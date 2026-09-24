import httpstatus from 'http-status'
import ApiError from "../../../errors/ApiError"
import prisma from "../../../shared/prisma"
import { ContestParticipant, ContestParticipantStatus, ContestPhoto, Prisma, User, Vote, VoteType } from '../../../prismaClient'
import { ObjectId } from 'mongodb'
import { levelService } from '../Level/level.service'
import { contestRuleEngine } from '../Contest/ContestRules/contestRule.engine'
import { getVoteWeightStats } from './voteWeight.service'
import { contestProgressService } from '../Contest/ContestProgress/contestProgress.service'
import { notificationOrchestrator } from '../Notification/notificationOrchestrator'
import { contestRankingService } from '../Contest/ContestRanking/contestRanking.service'
import { activeContestWhere } from '../Contest/contestLifecycle'
import logger from "../../../shared/logger"
import config from "../../../config"
import { runInBackground } from "../../../shared/backgroundTasks"

type VoteContestPhoto = ContestPhoto & {
    participant: ContestParticipant
}

const resolveContestPhotoForVote = async (contestId:string, contestPhotoId:string): Promise<VoteContestPhoto | null> => {
    const contestPhoto = await prisma.contestPhoto.findFirst({
        // `photoId` is retained as a rolling-deployment fallback for older
        // clients. New clients always submit the ContestPhoto id.
        where:{
            contestId,
            photoId:{not:null},
            participant:{status:ContestParticipantStatus.ACTIVE},
            OR:[{id:contestPhotoId}, {photoId:contestPhotoId}]
        },
        include:{participant:true}
    })

    return contestPhoto
}

const getVoteType = (contestPhoto: Pick<ContestPhoto, "promoted" | "promotionExpiresAt">)=>{
    let voteType:VoteType = VoteType.Organic

    if(contestPhoto.promoted && contestPhoto.promotionExpiresAt && contestPhoto.promotionExpiresAt > new Date())
        voteType = VoteType.Promoted

    return voteType
}


const getVoterName = (user:User) =>
    user.fullName || [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || "Someone"

// Everything derived from a vote: participant level, photo owner's level and
// the "you received a vote" notification. The vote is already durable when
// this runs, so a failure here is logged and never fails the vote.
const runVoteSideEffects = async (contestId:string, contestTitle:string, voter:User, photos:VoteContestPhoto[]) => {
    const voterName = getVoterName(voter)
    const participantIds = [...new Set(photos.map(photo => photo.participantId))]
    const ownerUserIds = [...new Set(photos.map(photo => photo.participant.userId))]

    const settled = await Promise.allSettled([
        ...participantIds.map(participantId => contestProgressService.evaluateParticipantLevel(contestId, participantId)),
        ...ownerUserIds.map(ownerUserId => levelService.evaluateAndUpdateUserLevel(ownerUserId)),
        ...photos.map(photo => getVoteCount(photo.id).then(totalVotes => notificationOrchestrator.notifyVoteReceived(
            photo.participantId,
            photo.participant.userId,
            contestId,
            contestTitle,
            photo.id,
            voter.id,
            voterName,
            totalVotes,
        ))),
    ])
    settled.forEach(effect => {
        if(effect.status === "rejected") logger.error({ err: effect.reason, contestId }, "Post-vote side effect failed")
    })
}

// By default the response goes out as soon as the vote is committed and the
// side effects finish in the background (config.vote.asyncSideEffects).
const handleVoteSideEffects = async (contestId:string, contestTitle:string, voter:User, photos:VoteContestPhoto[]) => {
    if(photos.length === 0){
        return
    }
    // Drop the memoized ranking first so the side effects score this vote.
    contestRankingService.invalidateContestRanking(contestId)

    if(config.vote.asyncSideEffects){
        runInBackground("vote-side-effects", () => runVoteSideEffects(contestId, contestTitle, voter, photos))
        return
    }
    await runVoteSideEffects(contestId, contestTitle, voter, photos)
}

export const addOneVote = async (userId:string, contestId:string, contestPhotoId:string)=>{
    const [user, contest, contestPhoto] = await Promise.all([
        prisma.user.findUnique({where:{id:userId}}),
        prisma.contest.findFirst({where:{id:contestId, ...activeContestWhere()}}),
        resolveContestPhotoForVote(contestId, contestPhotoId),
    ])

    if (!user){
        throw new ApiError(httpstatus.NOT_FOUND, 'User not found')
    }
    if (!contest){
        throw new  ApiError(httpstatus.NOT_FOUND, 'contest not found')
    }
    if(!contestPhoto){
        throw new ApiError(httpstatus.NOT_FOUND, "contest photo not found")
    }
    const {voterParticipant} = await contestRuleEngine.validateVotingRules(
        contestId, userId, [contestPhoto.id], {contest, user, contestPhotos:[contestPhoto]}
    )

    const type = getVoteType(contestPhoto)

    try{
        const result = await prisma.$transaction(async tx => {
            // A harmless write serializes voting with the finalizer's status
            // transition. If finalization wins the race this guard matches 0;
            // if this vote wins, the finalizer snapshot includes it.
            const guard = await tx.contest.updateMany({
                where:{id:contestId, ...activeContestWhere()},
                data:{updatedAt:new Date()}
            })
            if(guard.count !== 1){
                throw new ApiError(httpstatus.CONFLICT, "Contest voting has closed")
            }

            const vote = await tx.vote.create({data:{providerId:userId, contestId, contestPhotoId:contestPhoto.id, photoRefId:contestPhoto.photoId, type, power:1, weight:1}})
            if(voterParticipant){
                await tx.contestParticipant.updateMany({
                    where:{id:voterParticipant.id, status:ContestParticipantStatus.ACTIVE},
                    data:{exposure_bonus:{increment:2}, exposureUpdatedAt:new Date()}
                })
            }
            return vote
        }, {timeout:15000, maxWait:10000})

        await handleVoteSideEffects(contestId, contest.title, user, [contestPhoto])

        return result
    }catch(error){
        if(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"){
            return prisma.vote.findUnique({
                where:{providerId_contestId_contestPhotoId:{providerId:userId, contestId, contestPhotoId:contestPhoto.id}}
            })
        }
        throw error
    }
}


export const addVotes = async (userId:string, contestId:string, contestPhotoIds:string[])=>{

    const uniquePhotoIds = [...new Set(contestPhotoIds)]
    const [user, contest, contestPhotos] = await Promise.all([
        prisma.user.findUnique({where:{id:userId}}),
        prisma.contest.findFirst({where:{id:contestId, ...activeContestWhere()}}),
        Promise.all(uniquePhotoIds.map(id => resolveContestPhotoForVote(contestId, id))),
    ])

    if (!user){
        throw new ApiError(httpstatus.NOT_FOUND, 'User not found')
    }
    if (!contest){
        throw new  ApiError(httpstatus.NOT_FOUND, 'Contest is not available to vote')
    }
    if(contestPhotos.some(photo => !photo)){
        throw new ApiError(httpstatus.NOT_FOUND, "One or more contest photos were not found")
    }
    const resolvedPhotos = contestPhotos.filter((photo): photo is VoteContestPhoto => Boolean(photo))
    const {voterParticipant} = await contestRuleEngine.validateVotingRules(
        contestId, userId, resolvedPhotos.map(photo => photo.id), {contest, user, contestPhotos:resolvedPhotos}
    )

    const persistVotes = () => prisma.$transaction(async tx => {
        const guard = await tx.contest.updateMany({
            where:{id:contestId, ...activeContestWhere()},
            data:{updatedAt:new Date()}
        })
        if(guard.count !== 1){
            throw new ApiError(httpstatus.CONFLICT, "Contest voting has closed")
        }

        // Bulk voting is one round trip per step, not two per photo. Checking
        // and inserting each vote in a loop cost 2N+2 sequential queries, so a
        // dozen photos was enough to blow past the interactive transaction
        // timeout against a remote database and lose the whole ballot.
        const contestPhotoIds = resolvedPhotos.map(photo => photo.id)
        const existingVotes = await tx.vote.findMany({
            where:{providerId:userId, contestId, contestPhotoId:{in:contestPhotoIds}}
        })
        const existingPhotoIds = new Set(existingVotes.map(vote => vote.contestPhotoId))
        const newPhotos = resolvedPhotos.filter(photo => !existingPhotoIds.has(photo.id))

        if(newPhotos.length > 0){
            await tx.vote.createMany({
                data:newPhotos.map(photo => ({
                    providerId:userId,
                    contestId,
                    contestPhotoId:photo.id,
                    photoRefId:photo.photoId,
                    type:getVoteType(photo),
                    power:1,
                    weight:1
                }))
            })
            if(voterParticipant){
                await tx.contestParticipant.updateMany({
                    where:{id:voterParticipant.id, status:ContestParticipantStatus.ACTIVE},
                    data:{exposure_bonus:{increment:2 * newPhotos.length}, exposureUpdatedAt:new Date()}
                })
            }
        }

        // createMany does not return the inserted rows, so re-read only when
        // something was actually written.
        const storedVotes = newPhotos.length > 0
            ? await tx.vote.findMany({
                where:{providerId:userId, contestId, contestPhotoId:{in:contestPhotoIds}}
            })
            : existingVotes
        const voteByPhotoId = new Map(storedVotes.map(vote => [vote.contestPhotoId, vote]))
        const votes = resolvedPhotos
            .map(photo => voteByPhotoId.get(photo.id))
            .filter((vote): vote is Vote => Boolean(vote))

        return {votes, createdPhotoIds:newPhotos.map(photo => photo.id)}
    }, {timeout:15000, maxWait:10000})

    let persisted:Awaited<ReturnType<typeof persistVotes>>
    try{
        persisted = await persistVotes()
    }catch(error){
        // A concurrent retry may insert one of the same unique votes after our
        // pre-check. Re-read once so the whole bulk request stays idempotent.
        if(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"){
            persisted = await persistVotes()
        }else{
            throw error
        }
    }

    const createdIds = new Set(persisted.createdPhotoIds)
    await handleVoteSideEffects(contestId, contest.title, user, resolvedPhotos.filter(photo => createdIds.has(photo.id)))

    return persisted.votes
}


// Counts only votes cast while the photo currently in this contest slot was live
// AND since it started this particular stint in the slot (stintStartedAt) - a
// trade always starts the new photo's live count at zero (or bankedVotes, if
// it's a photo being restored from an earlier stint - see
// ContestPhotoTradeRecord) instead of inheriting whatever was voted on before
// the trade, even if the exact same photo is later re-selected into this same
// slot. A null photoRefId is a legacy (pre-swap-tracking) vote and is treated
// as belonging to whatever photo is live now.
export const getVoteCount = async (contestPhotoId:string)=>{
    const contestPhoto = await prisma.contestPhoto.findUnique({
        where:{id:contestPhotoId},
        select:{photoId:true, bankedVotes:true, stintStartedAt:true, createdAt:true}
    })
    const stintStartedAt = contestPhoto?.stintStartedAt ?? contestPhoto?.createdAt ?? new Date(0)
    const { count } = await getVoteWeightStats({
        contestPhotoId,
        createdAt:{gte:stintStartedAt},
        OR:[{photoRefId:contestPhoto?.photoId ?? null}, {photoRefId:null}]
    })

    return count + (contestPhoto?.bankedVotes ?? 0)
}

// Bulk variant of getVoteCount for the frontend's realtime polling - a client
// watching a handful of contest photo slots (e.g. the "My Contests" list)
// polls this instead of re-fetching the full joined-contest payload on an
// interval, so the recurring request stays a handful of counts/ranks instead
// of re-downloading contest/rules/banner data the client already has.
const getVoteCountsByPhotoIds = async (contestPhotoIds:string[]) => {
    const contestPhotos = await prisma.contestPhoto.findMany({
        where:{id:{in:contestPhotoIds}},
        select:{id:true, contestId:true}
    })
    const uniqueContestIds = [...new Set(contestPhotos.map(photo => photo.contestId))]
    const rankings = await Promise.all(
        uniqueContestIds.map(async contestId => contestRankingService.buildContestRanking(contestId))
    )
    const photoRankingByPhotoId = new Map(
        rankings.flatMap(ranking => ranking.photos.map(photo => [photo.photoId, photo] as const))
    )
    const photographerRankByParticipantId = new Map(
        rankings.flatMap(ranking => ranking.photographers.map(photographer => [photographer.participantId, photographer.rank] as const))
    )

    // Counts come out of the same ranking that produced the ranks, so a polling
    // client never sees a vote total that disagrees with the leaderboard beside
    // it - and one contest costs one ranking build instead of two queries per
    // watched photo.
    const counts = contestPhotoIds.map((contestPhotoId) => {
        const photoRanking = photoRankingByPhotoId.get(contestPhotoId)

        return {
            contestPhotoId,
            voteCount: photoRanking?.voteCount ?? 0,
            rank:photoRanking ? photographerRankByParticipantId.get(photoRanking.participantId) ?? null : null,
            photoRank:photoRanking?.rank ?? null
        }
    })

    return counts
}

const getUserPhotoVoteCount = async (userPhotoId:string) => {
    const { count } = await getVoteWeightStats({photo:{photoId:userPhotoId}})

    return count
}


export const getVoteUsers = async (contestPhotoId:string)=>{
    const voters = await prisma.vote.findMany({where:{contestPhotoId}, include:{provider:true}})

    return voters
}



const getTotalPromotedVotes = async (userId:string)=>{
    const { count } = await getVoteWeightStats({photo:{participant:{userId}}, type:VoteType.Promoted})

    return count
}

const getTotalOrganicVotes = async (userId:string)=>{
    const { count } = await getVoteWeightStats({photo:{participant:{userId}}, type:VoteType.Organic})

    return count
}

const getTeamTotalVotes = async (contestId:string , teamId:string) => {

    const { count } = await getVoteWeightStats({contestId, photo:{photo:{user:{joinedTeam:{id:teamId}}}}})

    return count
}

const getUserTotalVotes = async (userId:string) => {

    const { count } = await getVoteWeightStats({photo:{participant:{userId}}})

    return count
}

const getUserContestSpecificVote = async (contestId:string, userId:string) => {
    const { count } = await getVoteWeightStats({contestId,photo:{participant:{userId}}})

    return count
}

const getParticipantTotalVotes = async (photos:{id:string, url:string}[])=>{

    const photosWithVotes = await Promise.all(photos.map(async photo => {
        const vote = await getVoteCount(photo.id)
        return {...photo, vote}
    }))

    const totalVotes = photosWithVotes.reduce((prev,curr) => prev + curr.vote,0)

  

    return totalVotes
}

const totalVotesOfParticipant = async (participantId:string, contestId:string)=> {
    const ranking = await contestRankingService.buildContestRanking(contestId)
    return ranking.photographers.find(item => item.participantId === participantId)?.score ?? 0
}


const getContestTotalVotes = async (contestId:string)=> {
    const { count } = await getVoteWeightStats({contestId})

    return count
}
export const voteService = {
    getTotalPromotedVotes,
    getTotalOrganicVotes,
    getTeamTotalVotes,
    getVoteCount,
    getVoteCountsByPhotoIds,
    getUserPhotoVoteCount,
    getUserTotalVotes,
    getUserContestSpecificVote,
    totalVotesOfParticipant,
    getContestTotalVotes
}
