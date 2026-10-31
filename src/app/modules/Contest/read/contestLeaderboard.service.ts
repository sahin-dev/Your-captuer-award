import httpstatus from "http-status";
import ApiError from "../../../../errors/ApiError";
import { paginationHelper } from "../../../../helpers/paginationHelper";
import { YCLevel } from "../../../../prismaClient";
import prisma from "../../../../shared/prisma";
import { ycLevels } from "../../Awards/award.definitions";
import { ContestRanking, contestRankingService } from "../ContestRanking/contestRanking.service";

const rankLevelTabs = ['AMATEUR', 'TALENTED', 'SUPREME', 'SUPERIOR', 'TOP_NOTCH'] as const

type RankLevelTab = typeof rankLevelTabs[number]

const normalizeRankLevel = (level?: string): RankLevelTab => {
    const normalizedLevel = level?.toUpperCase().replace(/-/g, '_') as RankLevelTab
    return rankLevelTabs.includes(normalizedLevel) ? normalizedLevel : 'AMATEUR'
}

const getDesignLevelFromYCLevel = (level?: YCLevel | null): RankLevelTab => {
    const levelMap:Record<YCLevel, RankLevelTab> = {
        [ycLevels.NEW]:'AMATEUR',
        [ycLevels.AMATEUR]:'AMATEUR',
        [ycLevels.TALENTED]:'TALENTED',
        [ycLevels.SUPREME]:'SUPREME',
        [ycLevels.SUPERIOR]:'SUPERIOR',
        [ycLevels.TOP_NOTCH]:'TOP_NOTCH'
    }

    return level ? levelMap[level] : 'AMATEUR'
}

const paginateRankedData = <T>(data:T[], page?:number, limit?:number) => {
    const pagination = paginationHelper.calculatePagination({page, limit: limit ?? 20})
    const paginatedData = data.slice(pagination.skip, pagination.skip + pagination.limit)

    return {
        data:paginatedData,
        meta:paginationHelper.getPaginationMetaData(
            pagination.page,
            pagination.limit,
            data.length
        )
    }
}

const getFollowedUserIds = async (currentUserId:string, followingIds:string[]) => {
    if(!currentUserId || followingIds.length <= 0){
        return new Set<string>()
    }

    const follows = await prisma.follow.findMany({
        where:{
            followerId:currentUserId,
            followingId:{in:followingIds}
        },
        select:{followingId:true}
    })

    return new Set(follows.map(follow => follow.followingId))
}

const getContestPhotosSortedByVote = async (
    contestId:string,
    page?:number,
    limit?:number,
    rankingInput?:ContestRanking
) => {

    const contest = await prisma.contest.findUnique({where:{id:contestId}})

    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, 'Contest not found')
    }
    const ranking = rankingInput ?? await contestRankingService.buildContestRanking(contestId)
    const contestUploads = await prisma.contestPhoto.findMany({
        where:{id:{in:ranking.photos.map(photo => photo.photoId)}},
        include:{
            participant:{
                include:{
                    user:{select:{id:true, avatar:true, country:true, fullName:true, username:true}}
                }
            },
            photo:{select:{id:true, url:true, title:true}}
        }
    })
    const uploadById = new Map(contestUploads.map(upload => [upload.id,upload]))
    const sortedUploads = ranking.photos
        .map(photo => {
            const upload = uploadById.get(photo.photoId)
            if(!upload || !upload.photo){
                return null
            }
            return {
                contestPhotoId:upload.id,
                userPhotoId:upload.photo.id,
                url:upload.photo.url,
                title:upload.photo.title,
                score:photo.score,
                voteCount:photo.voteCount,
                voterCount:photo.voterCount,
                rank:photo.rank,
                photographer:upload.participant.user
            }
        })
        .filter((upload): upload is NonNullable<typeof upload> => Boolean(upload))

    const paginatedPhotos = paginateRankedData(sortedUploads, page, limit)
    return {
        photos:paginatedPhotos.data,
        meta:paginatedPhotos.meta
    }
}

const getContestTopPhotographers = async (
    contestId: string,
    currentUserId?: string,
    page?: number,
    limit?: number,
    level?: string,
    rankingInput?:ContestRanking,
    // /rank-photographer lists every photographer when no level tab is
    // requested. /ranking keeps the older default of the AMATEUR tab.
    options?: { allLevelsWhenUnset?: boolean }
) => {
    const contest = await prisma.contest.findUnique({
        where: { id: contestId }
    })

    if (!contest) {
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }

    const showAllLevels = Boolean(options?.allLevelsWhenUnset) && !level
    const activeLevel = showAllLevels ? null : normalizeRankLevel(level)

    const ranking = rankingInput ?? await contestRankingService.buildContestRanking(contestId)

    const contestParticipants = await prisma.contestParticipant.findMany({
        where: {
            id: {
                in: ranking.photographers.map(
                    photographer => photographer.participantId
                )
            }
        },
        include: {
            photos: {
                select: {
                    photo: {
                        select: {
                            id: true,
                            url: true,
                            title: true
                        }
                    },
                    id: true
                }
            },
            user: {
                select: {
                    id: true,
                    avatar: true,
                    country: true,
                    fullName: true,
                    username: true
                }
            }
        }
    })

    const participantById = new Map(
        contestParticipants.map(participant => [
            participant.id,
            participant
        ])
    )

    const photoVoteCountById = new Map(
        ranking.photos.map(photo => [
            photo.photoId,
            photo.voteCount
        ])
    )

    const participantWithVote = ranking.photographers.flatMap(
        photographer => {
            const participant = participantById.get(
                photographer.participantId
            )

            if (!participant) {
                return []
            }

            return [
                {
                    participantId: participant.id,
                    rank: photographer.rank,
                    level: getDesignLevelFromYCLevel(photographer.level),
                    score: photographer.score,
                    user: participant.user,
                    photos: participant.photos
                        .flatMap(photo =>
                            photo.photo
                                ? [
                                      {
                                          contestPhotoId: photo.id,
                                          userPhotoId: photo.photo.id,
                                          url: photo.photo.url,
                                          title: photo.photo.title,
                                          voteCount:
                                              photoVoteCountById.get(
                                                  photo.id
                                              ) || 0
                                      }
                                  ]
                                : []
                        )
                        .sort((a, b) => b.voteCount - a.voteCount),
                    totalVotes: photographer.voteCount,
                    voterCount: photographer.voterCount
                }
            ]
        }
    )

    const contestTotalVotes = ranking.photographers.reduce(
        (total, participant) => total + participant.voteCount,
        0
    )

    // Only fetch following information when a user is logged in
    const followingIds = currentUserId
        ? await getFollowedUserIds(
              currentUserId,
              participantWithVote.map(participant => participant.user.id)
          )
        : new Set<string>()

    const sortedParticipant = participantWithVote
        .filter(participant => activeLevel === null || participant.level === activeLevel)
        .map((participant, idx) => ({
            ...participant,
            levelRank: idx + 1,
            user: {
                ...participant.user,
                isFollowing: currentUserId
                    ? followingIds.has(participant.user.id)
                    : false
            }
        }))

    const paginatedParticipants = paginateRankedData(
        sortedParticipant,
        page,
        limit
    )

    return {
        contestTotalVotes,
        levelTabs: rankLevelTabs,
        activeLevel,
        participants: paginatedParticipants.data,
        meta: paginatedParticipants.meta
    }
}

// Single "Ranking" button destination: combines the photo and photographer
// leaderboards that were previously two separate calls (/rank-photos,
// /rank-photographer) into one response.
const getContestRanking = async (
    contestId:string,
    currentUserId?:string,
    page?:number,
    limit?:number,
    level?:string
) => {
    const ranking = await contestRankingService.buildContestRanking(contestId)
    const [photos, photographers] = await Promise.all([
        getContestPhotosSortedByVote(contestId, page, limit, ranking),
        getContestTopPhotographers(contestId, currentUserId, page, limit, level, ranking)
    ])

    return {photos, photographers}
}

export const contestLeaderboardService = {
    getContestPhotosSortedByVote,
    getContestTopPhotographers,
    getContestRanking,
}
