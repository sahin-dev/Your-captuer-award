import httpstatus from "http-status";
import ApiError from "../../../../errors/ApiError";
import { paginationHelper } from "../../../../helpers/paginationHelper";
import { getTeammateUserIds } from "../../../../helpers/teammate.helper";
import { ContestParticipantStatus } from "../../../../prismaClient";
import prisma from "../../../../shared/prisma";
import { voteService } from "../../Vote/vote.service";
import { activeContestWhere } from "../contestLifecycle";
import { EXPOSURE_BOOST_WEIGHT_MULTIPLIER } from "../exposure/exposure.service";
import { contestPhotoPresenter } from "../presenters/contestPhoto.presenter";

const createRandomSeed = () => `${Date.now()}-${Math.random()}`

const hashSeed = (seed:string) => {
    let hash = 2166136261

    for (let index = 0; index < seed.length; index++) {
        hash ^= seed.charCodeAt(index)
        hash = Math.imul(hash, 16777619)
    }

    return hash >>> 0
}

const seededRandom = (seed:string) => {
    let state = hashSeed(seed) || 1

    return () => {
        state ^= state << 13
        state ^= state >>> 17
        state ^= state << 5
        return ((state >>> 0) / 4294967296)
    }
}

// Randomized order for vote-serving, biased by each photo's exposure_bonus: a
// higher-exposure photo is more likely (not guaranteed) to sort earlier. Uses
// the standard "weighted reservoir" sampling key (random() ** (1/weight)) so it
// stays a true shuffle - not a strict exposure-descending sort - while still
// giving higher-exposure photos meaningfully better odds of early placement.
// getWeight defaults to a flat 1 (a plain unweighted shuffle) for callers that
// don't care about exposure.
const shuffleWithSeed = <T>(items:T[], seed:string, getWeight:(item:T) => number = () => 1) => {
    const random = seededRandom(seed)

    return items
        .map(item => {
            const weight = Math.max(getWeight(item), 1)
            const key = Math.pow(random(), 1 / weight)
            return {item, key}
        })
        .sort((a, b) => b.key - a.key)
        .map(entry => entry.item)
}

type FeedPhoto = {
    id:string;
    promoted:boolean;
    promotionExpiresAt:Date | null;
    exposureBoostExpiresAt:Date | null;
    participantId:string;
}

const isPromotionActive = (photo:FeedPhoto, now:Date) =>
    Boolean(photo.promoted && photo.promotionExpiresAt && photo.promotionExpiresAt > now)

// The photos this voter can still vote on. These are three simple queries that
// each use an index, then filtered here. A single query with the same filters
// makes MongoDB join votes for every photo, which took seconds per page.
const loadVotablePhotos = async (contestId:string, voterId:string) => {
    const teammateUserIds = await getTeammateUserIds(voterId)
    const excludedUserIds = [voterId, ...teammateUserIds]

    const [participants, voterVotes, photos] = await Promise.all([
        prisma.contestParticipant.findMany({
            where:{contestId, status:ContestParticipantStatus.ACTIVE, userId:{notIn:excludedUserIds}},
            select:{id:true, exposure_bonus:true}
        }),
        prisma.vote.findMany({
            where:{contestId, providerId:voterId},
            select:{contestPhotoId:true}
        }),
        prisma.contestPhoto.findMany({
            where:{contestId, photoId:{not:null}},
            orderBy:[{createdAt:"desc"}, {id:"desc"}],
            select:{id:true, promoted:true, promotionExpiresAt:true, exposureBoostExpiresAt:true, participantId:true}
        })
    ])

    const exposureByParticipantId = new Map(participants.map(participant => [participant.id, participant.exposure_bonus]))
    const votedPhotoIds = new Set(voterVotes.map(vote => vote.contestPhotoId))
    const votablePhotos = photos.filter(photo => exposureByParticipantId.has(photo.participantId) && !votedPhotoIds.has(photo.id))

    return {votablePhotos, exposureByParticipantId}
}

const getContestUploadsToVote = async (userId:string, contestId:string, page?:number, limit?:number, seed?:string)=> {
    const contest = await prisma.contest.findFirst({where:{id:contestId, ...activeContestWhere()}, select:{id:true}})
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }
    const participant = await prisma.contestParticipant.findUnique({where:{contestId_userId:{contestId, userId}}})
    if(!participant || participant.status !== ContestParticipantStatus.ACTIVE){
        throw new ApiError(httpstatus.NOT_FOUND, "user is not in the participation list")
    }

    const {skip, limit:paginationLimit, page:currentPage} = paginationHelper.calculatePagination({page, limit})
    const randomSeed = seed?.trim() || createRandomSeed()
    const {votablePhotos, exposureByParticipantId} = await loadVotablePhotos(contestId, userId)

    const now = new Date()
    const promotedPhotos = votablePhotos.filter(photo => isPromotionActive(photo, now))
    const regularPhotos = votablePhotos.filter(photo => !isPromotionActive(photo, now))

    // Base weight comes from the participant's own exposure_bonus (their
    // voting-activity reward, decayed over time). A photo still within its
    // 1-hour post-submission/trade spotlight window gets that weight multiplied
    // up, so fresh/traded-in photos dominate the queue for a while regardless of
    // the photographer's own history.
    const exposureWeight = (photo:FeedPhoto) => {
        const participantWeight = Math.max(exposureByParticipantId.get(photo.participantId) ?? 0, 1)
        const isSpotlighted = Boolean(photo.exposureBoostExpiresAt && photo.exposureBoostExpiresAt > now)
        return isSpotlighted ? participantWeight * EXPOSURE_BOOST_WEIGHT_MULTIPLIER : participantWeight
    }
    const shuffledPhotos = [
        ...shuffleWithSeed(promotedPhotos, `${randomSeed}:promoted`, exposureWeight),
        ...shuffleWithSeed(regularPhotos, `${randomSeed}:regular`, exposureWeight)
    ]
    const pagePhotoIds = shuffledPhotos.slice(skip, skip + paginationLimit).map(photo => photo.id)

    const [pagePhotos, voteCountByContestPhotoId] = await Promise.all([
        prisma.contestPhoto.findMany({
            where:{id:{in:pagePhotoIds}},
            select:{id:true, photo:{select:{id:true, url:true}}}
        }),
        voteService.getVoteCountsForContestPhotos(pagePhotoIds)
    ])
    const photoByContestPhotoId = new Map(pagePhotos.map(upload => [upload.id, upload.photo] as const))

    const data = pagePhotoIds.flatMap(contestPhotoId => {
        const photo = photoByContestPhotoId.get(contestPhotoId)
        if(!photo){
            return []
        }
        return [contestPhotoPresenter.toVotablePhoto(contestPhotoId, photo, voteCountByContestPhotoId.get(contestPhotoId) ?? 0)]
    })

    return {
        data,
        meta:{
            ...paginationHelper.getPaginationMetaData(currentPage, paginationLimit, votablePhotos.length),
            seed:randomSeed
        }
    }
}

export const votingFeedService = {
    getContestUploadsToVote,
}
