import { ContestStatus } from "../../../prismaClient";
import prisma from "../../../shared/prisma";
import ApiError from "../../../errors/ApiError";
import httpStatus from "http-status";
import { paginationHelper } from "../../../helpers/paginationHelper";
import { withPotyPrizePools } from "./photographyOfTheYearPrizePool";

const paginate = <T>(items: T[], page?: number, limit?: number) => {
  const { skip, limit: pageLimit, page: currentPage } = paginationHelper.calculatePagination({ page, limit });
  return {
    data: items.slice(skip, skip + pageLimit),
    meta: paginationHelper.getPaginationMetaData(currentPage, pageLimit, items.length),
  };
};

// Every submitted photo is ranked by the weighted votes its library photo
// (UserPhoto) received in regular contests between the POTY start and end
// dates. Votes are matched on Vote.photoRefId, so a user can enter the same
// photo in any number of regular contests and every vote it gets counts here.
const buildFullRanking = async (contestId: string) => {
  const contest = await prisma.contest.findFirst({
    where: { id: contestId, isPhotographyOfYear: true, OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
    select: { id: true, startDate: true, endDate: true },
  });

  if (!contest) {
    throw new ApiError(httpStatus.NOT_FOUND, "Photographer of the Year contest not found");
  }

  const entries = await prisma.contestPhoto.findMany({
    where: {
      contestId,
      photoId: { not: null },
      participant: { status: "ACTIVE" },
    },
    include: {
      participant: {
        include: { user: { select: { id: true, avatar: true, country: true, fullName: true, username: true } } },
      },
      photo: { select: { id: true, url: true, title: true } },
    },
  });

  const entryByUserPhotoId = new Map<string, typeof entries[number]>();
  entries.forEach((entry) => {
    if (entry.photo && !entryByUserPhotoId.has(entry.photo.id)) {
      entryByUserPhotoId.set(entry.photo.id, entry);
    }
  });
  const photoIds = [...entryByUserPhotoId.keys()];
  const potyContestIds = await prisma.contest.findMany({
    where: { isPhotographyOfYear: true },
    select: { id: true },
  }).then((contests) => contests.map((item) => item.id));

  const scores = photoIds.length === 0
    ? []
    : await prisma.vote.groupBy({
      by: ["photoRefId"],
      where: {
        photoRefId: { in: photoIds },
        createdAt: { gte: contest.startDate, lt: contest.endDate },
        // POTY votes do not feed back into the POTY score; all regular contests qualify.
        contestId: { notIn: potyContestIds },
      },
      _sum: { power: true },
      _count: { _all: true },
    });
  const scoreByPhotoId = new Map(scores.map((score) => [
    score.photoRefId,
    { score: score._sum.power ?? 0, voterCount: score._count._all },
  ]));

  const photos = [...entryByUserPhotoId.entries()]
    .map(([userPhotoId, entry]) => {
      const score = scoreByPhotoId.get(userPhotoId);
      return {
        contestPhotoId: entry.id,
        userPhotoId,
        participantId: entry.participantId,
        url: entry.photo?.url ?? "",
        title: entry.photo?.title ?? null,
        score: score?.score ?? 0,
        // Same meaning as regular contests: votes weighted by voting power.
        voteCount: score?.score ?? 0,
        voterCount: score?.voterCount ?? 0,
        photographer: entry.participant.user,
        createdAt: entry.createdAt,
      };
    })
    // Ties go to the photo entered first, then a stable id order.
    .sort((left, right) => right.score - left.score
      || left.createdAt.getTime() - right.createdAt.getTime()
      || left.userPhotoId.localeCompare(right.userPhotoId))
    .map(({ createdAt: _createdAt, ...photo }, index) => ({ ...photo, rank: index + 1 }));

  const photographerById = new Map<string, {
    participantId: string;
    user: typeof photos[number]["photographer"];
    totalVotes: number;
    photos: typeof photos;
  }>();
  photos.forEach((photo) => {
    const photographer = photographerById.get(photo.participantId)
      ?? { participantId: photo.participantId, user: photo.photographer, totalVotes: 0, photos: [] };
    photographer.totalVotes += photo.voteCount;
    photographer.photos.push(photo);
    photographerById.set(photo.participantId, photographer);
  });
  // A photographer's standing is the sum of their submitted photos; ties keep
  // the order of their best-ranked photo.
  const photographers = [...photographerById.values()]
    .sort((left, right) => right.totalVotes - left.totalVotes || left.photos[0].rank - right.photos[0].rank)
    .map((photographer, index) => ({ ...photographer, rank: index + 1 }));

  return {
    photos,
    photographers,
    contestTotalVotes: photos.reduce((total, photo) => total + photo.voteCount, 0),
  };
};

const buildPhotographyOfYearRanking = async (contestId: string, page?: number, limit?: number) => {
  const ranking = await buildFullRanking(contestId);
  return paginate(ranking.photos, page, limit);
};

const buildPhotographyOfYearPhotographerRanking = async (contestId: string, page?: number, limit?: number) => {
  const ranking = await buildFullRanking(contestId);
  const { data, meta } = paginate(ranking.photographers, page, limit);
  return { participants: data, contestTotalVotes: ranking.contestTotalVotes, meta };
};

// The signed-in user's own standing, for their joined POTY card.
const getMyPhotographyOfYearEntry = async (contestId: string, userId: string) => {
  const ranking = await buildFullRanking(contestId);
  const photographer = ranking.photographers.find((item) => item.user.id === userId);
  return {
    joined: Boolean(photographer),
    rank: photographer?.rank ?? null,
    totalPhotographers: ranking.photographers.length,
    totalVotes: photographer?.totalVotes ?? 0,
    photos: (photographer?.photos ?? []).map((photo) => ({
      contestPhotoId: photo.contestPhotoId,
      userPhotoId: photo.userPhotoId,
      voteCount: photo.voteCount,
      voterCount: photo.voterCount,
      rank: photo.rank,
    })),
  };
};

const getPhotographyOfYearContests = async () => {
  const contests = await prisma.contest.findMany({
    where: { isPhotographyOfYear: true, OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
  });
  const now = new Date();

  return (await withPotyPrizePools(contests)).map((contest) => ({
    ...contest,
    status: contest.endDate <= now
      ? ContestStatus.COMPLETED
      : contest.startDate > now
        ? ContestStatus.UPCOMING
        : ContestStatus.ACTIVE,
  }));
};

export const photographyOfTheYearRankingService = {
  buildPhotographyOfYearRanking,
  buildPhotographyOfYearPhotographerRanking,
  getMyPhotographyOfYearEntry,
  getPhotographyOfYearContests,
};
