import { notDeletedContest } from "../Contest/contestLifecycle";
import { ContestStatus, PaymentStatus, PaymentType } from "../../../prismaClient";
import prisma from "../../../shared/prisma";
import { getPotyPrizePools } from "./photographyOfTheYearPrizePool";

// Where a Photographer of the Year contest is in its life, from the admin's
// point of view. Derived from the dates and the published result rather than
// the stored status, so it is right even between scheduler ticks.
export type PotyStage = "SCHEDULED" | "RUNNING" | "JUDGING" | "PUBLISHED";

const MANAGEABLE_STATUSES: ContestStatus[] = [ContestStatus.NEW, ContestStatus.UPCOMING, ContestStatus.ACTIVE];

const countByContest = (groups: { contestId: string | null; _count: { _all: number } }[]) =>
  new Map(groups.flatMap((group) => (group.contestId ? [[group.contestId, group._count._all] as const] : [])));

// Everything the admin hub needs in one call: each contest with its stage,
// entry and payment counts, prize pool, and whether it can still be edited or
// deleted (with the reason when it cannot), plus totals across all contests.
const getAdminOverview = async () => {
  const contests = await prisma.contest.findMany({
    where: { isPhotographyOfYear: true, ...notDeletedContest },
    select: {
      id: true,
      title: true,
      description: true,
      banner: true,
      status: true,
      startDate: true,
      endDate: true,
      entryFeeAmount: true,
      currency: true,
      createdAt: true,
      potyResult: { select: { winnerPhotoIds: true, firstPhotoId: true, secondPhotoId: true, thirdPhotoId: true, updatedAt: true } },
    },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
  });
  const ids = contests.map((contest) => contest.id);

  const [participants, entries, paid, pools] = ids.length
    ? await Promise.all([
        prisma.contestParticipant.groupBy({ by: ["contestId"], where: { contestId: { in: ids } }, _count: { _all: true } }),
        prisma.contestPhoto.groupBy({
          by: ["contestId"],
          where: { contestId: { in: ids }, photoId: { not: null } },
          _count: { _all: true },
        }),
        prisma.payment.groupBy({
          by: ["contestId"],
          where: { contestId: { in: ids }, type: PaymentType.CONTEST, status: PaymentStatus.SUCCEEDED },
          _count: { _all: true },
        }),
        getPotyPrizePools(ids),
      ])
    : [[], [], [], new Map()];

  const participantCount = countByContest(participants);
  const entryCount = countByContest(entries);
  const paidCount = countByContest(paid);
  const now = new Date();

  const items = contests.map(({ potyResult, ...contest }) => {
    const winners = potyResult
      ? (potyResult.winnerPhotoIds?.length
          ? potyResult.winnerPhotoIds
          : [potyResult.firstPhotoId, potyResult.secondPhotoId, potyResult.thirdPhotoId].filter((id): id is string => Boolean(id)))
      : [];
    const published = Boolean(potyResult) && contest.status === ContestStatus.COMPLETED;
    const stage: PotyStage = published
      ? "PUBLISHED"
      : contest.endDate <= now
        ? "JUDGING"
        : contest.startDate > now
          ? "SCHEDULED"
          : "RUNNING";

    const paidEntryCount = paidCount.get(contest.id) ?? 0;
    // Mirrors the edit rules in Contest/authoring/contestAuthoring.service.ts.
    const manageable = MANAGEABLE_STATUSES.includes(contest.status) && contest.endDate > now;

    return {
      ...contest,
      stage,
      participantCount: participantCount.get(contest.id) ?? 0,
      entryCount: entryCount.get(contest.id) ?? 0,
      paidEntryCount,
      potyPrizePool: pools.get(contest.id) ?? null,
      winnerCount: winners.length,
      publishedAt: published ? potyResult?.updatedAt ?? null : null,
      canEdit: manageable,
      // Start date, entry fee and rules are locked once the contest is running.
      editLocksStartedFields: manageable && contest.startDate <= now,
      // Mirrors getContestEditLocks in Contest/authoring: the entry fee and
      // rules also lock as soon as anyone registers (registration opens while
      // the contest is still scheduled).
      editLocks: {
        startDate: manageable && contest.startDate <= now,
        feeAndRules: manageable && (contest.startDate <= now || (participantCount.get(contest.id) ?? 0) > 0),
      },
      // POTY can be deleted at any stage; deleting purges every related record.
      canDelete: true,
      deleteBlockedReason: null as string | null,
    };
  });

  const sum = (pick: (item: typeof items[number]) => number) =>
    Math.round(items.reduce((total, item) => total + pick(item), 0) * 100) / 100;

  return {
    contests: items,
    totals: {
      contests: items.length,
      scheduled: items.filter((item) => item.stage === "SCHEDULED").length,
      running: items.filter((item) => item.stage === "RUNNING").length,
      awaitingJudging: items.filter((item) => item.stage === "JUDGING").length,
      published: items.filter((item) => item.stage === "PUBLISHED").length,
      entries: sum((item) => item.entryCount),
      collectedFees: sum((item) => item.potyPrizePool?.collectedFees ?? 0),
      prizePool: sum((item) => item.potyPrizePool?.prizePool ?? 0),
      currency: "USD" as const,
    },
  };
};

export const photographyOfTheYearAdminService = {
  getAdminOverview,
};
