import httpstatus from 'http-status'
import ApiError from "../../../errors/ApiError"
import prisma, { PrismaTx } from "../../../shared/prisma"
import { ContestParticipant, ContestParticipantStatus, ContestPhoto, Prisma, User, Vote, VoteType } from '../../../prismaClient'
import { contestRuleEngine } from '../Contest/ContestRules/contestRule.engine'
import { getReceivedVoteStats, getVotePowerForVoter, getVoteWeightStats } from './voteWeight.service'
import { getStintStart } from '../Contest/scoring/voteTally'
import { pendingWorkQueue } from '../PendingWork/pendingWork.queue'
import { notificationOrchestrator } from '../Notification/notificationOrchestrator'
import { contestRankingService } from '../Contest/ContestRanking/contestRanking.service'
import { activeContestWhere } from '../Contest/contestLifecycle'
import { policyFor } from '../Contest/contestTypePolicy'
import logger from "../../../shared/logger"
import config from "../../../config"
import { runInBackground } from "../../../shared/backgroundTasks"
import { runWithWriteConflictRetry } from "../../../shared/transactionRetry"
import { profileCache } from "../Profile/profile.cache"

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

// Voting must not write to the contest document. Every vote in a contest would
// then touch one document, and MongoDB aborts transactions that write the same
// document at the same time, so concurrent votes would fail. Reading is enough
// because endDate cannot change once a contest is ACTIVE: the ranking ignores
// votes at or after endDate, and finalization waits FINALIZATION_GRACE_MS so
// that transactions already in progress can finish first.
const assertVotingOpen = async (tx:PrismaTx, contestId:string, castAt:Date) => {
    const openContest = await tx.contest.findFirst({
        where:{id:contestId, ...activeContestWhere(castAt)},
        select:{id:true}
    })
    if(!openContest){
        throw new ApiError(httpstatus.CONFLICT, "Contest voting has closed")
    }
}

// Everything derived from a vote. Level checks are slow, so they go on the
// pending work list and run in batches (see pendingWork.queue.ts). Only the
// "you received a vote" notification is sent now. The vote is already durable
// when this runs, so a failure here is logged and never fails the vote.
const runVoteSideEffects = async (contestId:string, contestTitle:string, voter:User, photos:VoteContestPhoto[]) => {
    const voterName = getVoterName(voter)
    const participantIds = [...new Set(photos.map(photo => photo.participantId))]
    const ownerUserIds = [...new Set(photos.map(photo => photo.participant.userId))]

    const settled = await Promise.allSettled([
        ...participantIds.map(participantId => pendingWorkQueue.enqueue("PARTICIPANT_LEVEL", participantId, {contestId})),
        ...ownerUserIds.map(ownerUserId => pendingWorkQueue.enqueue("USER_LEVEL", ownerUserId)),
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
    const ownerUserIds = [...new Set(photos.map(photo => photo.participant.userId))]
    await Promise.all([
        profileCache.invalidateUsers(ownerUserIds),
        ...photos.flatMap(photo => photo.photoId ? [profileCache.invalidatePhoto(photo.photoId)] : [])
    ])

    if(config.vote.asyncSideEffects){
        runInBackground("vote-side-effects", () => runVoteSideEffects(contestId, contestTitle, voter, photos))
        return
    }
    await runVoteSideEffects(contestId, contestTitle, voter, photos)
}

// Finalization grace (FINALIZATION_GRACE_MS) must stay longer than this.
export const VOTE_TRANSACTION_TIMEOUT_MS = 15000

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
    if (!policyFor(contest).acceptsDirectVotes) {
        throw new ApiError(httpstatus.BAD_REQUEST, "Photographer of the Year scores come from regular contest votes")
    }
    if(!contestPhoto){
        throw new ApiError(httpstatus.NOT_FOUND, "contest photo not found")
    }
    const {voterParticipant} = await contestRuleEngine.validateVotingRules(
        contestId, userId, [contestPhoto.id], {contest, user, contestPhotos:[contestPhoto]}
    )

    const type = getVoteType(contestPhoto)

    try{
        const result = await runWithWriteConflictRetry(() => prisma.$transaction(async tx => {
            const castAt = new Date()
            await assertVotingOpen(tx, contestId, castAt)

            const vote = await tx.vote.create({data:{providerId:userId, contestId, contestPhotoId:contestPhoto.id, photoRefId:contestPhoto.photoId, type, power:getVotePowerForVoter(user), weight:1, createdAt:castAt}})
            if(voterParticipant){
                await tx.contestParticipant.updateMany({
                    where:{id:voterParticipant.id, status:ContestParticipantStatus.ACTIVE},
                    data:{exposure_bonus:{increment:2}, exposureUpdatedAt:new Date()}
                })
            }
            return vote
        }, {timeout:VOTE_TRANSACTION_TIMEOUT_MS, maxWait:10000}), {label:"vote"})

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
    if (!policyFor(contest).acceptsDirectVotes) {
        throw new ApiError(httpstatus.BAD_REQUEST, "Photographer of the Year scores come from regular contest votes")
    }
    if(contestPhotos.some(photo => !photo)){
        throw new ApiError(httpstatus.NOT_FOUND, "One or more contest photos were not found")
    }
    const resolvedPhotos = contestPhotos.filter((photo): photo is VoteContestPhoto => Boolean(photo))
    const {voterParticipant} = await contestRuleEngine.validateVotingRules(
        contestId, userId, resolvedPhotos.map(photo => photo.id), {contest, user, contestPhotos:resolvedPhotos}
    )

    const persistVotes = () => runWithWriteConflictRetry(() => prisma.$transaction(async tx => {
        const castAt = new Date()
        await assertVotingOpen(tx, contestId, castAt)

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
                    power:getVotePowerForVoter(user),
                    weight:1,
                    createdAt:castAt
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
    }, {timeout:VOTE_TRANSACTION_TIMEOUT_MS, maxWait:10000}), {label:"bulk vote"})

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
    const stintStartedAt = contestPhoto ? getStintStart(contestPhoto) : new Date(0)
    // Votes counted with voting power (see voteWeight.service).
    const { weight: count } = await getVoteWeightStats({
        contestPhotoId,
        createdAt:{gte:stintStartedAt},
        OR:[{photoRefId:contestPhoto?.photoId ?? null}, {photoRefId:null}]
    })

    return count + (contestPhoto?.bankedVotes ?? 0)
}

const getVoteCountsForContestPhotos = async (contestPhotoIds:string[]) => {
    const uniqueContestPhotoIds = [...new Set(contestPhotoIds)]
    if(uniqueContestPhotoIds.length === 0){
        return new Map<string, number>()
    }

    const contestPhotos = await prisma.contestPhoto.findMany({
        where:{id:{in:uniqueContestPhotoIds}},
        select:{id:true, photoId:true, bankedVotes:true, stintStartedAt:true, createdAt:true}
    })
    if(contestPhotos.length === 0){
        return new Map<string, number>()
    }

    const countByContestPhotoId = new Map(contestPhotos.map(contestPhoto => [contestPhoto.id, contestPhoto.bankedVotes ?? 0]))
    const voteFilters = contestPhotos.map(contestPhoto => ({
        contestPhotoId:contestPhoto.id,
        createdAt:{gte:getStintStart(contestPhoto)},
        OR:[{photoRefId:contestPhoto.photoId ?? null}, {photoRefId:null}]
    }))
    const votes = await prisma.vote.findMany({
        where:{OR:voteFilters},
        select:{contestPhotoId:true, power:true}
    })

    votes.forEach(vote => {
        countByContestPhotoId.set(
            vote.contestPhotoId,
            (countByContestPhotoId.get(vote.contestPhotoId) ?? 0) + (vote.power ?? 0)
        )
    })

    return countByContestPhotoId
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
    // Votes counted with voting power (see voteWeight.service).
    const { weight: count } = await getVoteWeightStats({photo:{photoId:userPhotoId}})

    return count
}


export const getVoteUsers = async (contestPhotoId:string)=>{
    const voters = await prisma.vote.findMany({where:{contestPhotoId}, include:{provider:true}})

    return voters
}



const getTotalPromotedVotes = async (userId:string)=>{
    const { weight: count } = await getReceivedVoteStats(userId, {type:VoteType.Promoted})

    return count
}

const getTotalOrganicVotes = async (userId:string)=>{
    const { weight: count } = await getReceivedVoteStats(userId, {type:VoteType.Organic})

    return count
}

const getTeamTotalVotes = async (contestId:string , teamId:string) => {

    // Votes counted with voting power (see voteWeight.service).
    const { weight: count } = await getVoteWeightStats({contestId, photo:{photo:{user:{joinedTeam:{id:teamId}}}}})

    return count
}

const getUserTotalVotes = async (userId:string) => {
    const { weight: count } = await getReceivedVoteStats(userId)

    return count
}

const getUserContestSpecificVote = async (contestId:string, userId:string) => {
    const { weight: count } = await getReceivedVoteStats(userId, {contestId})

    return count
}

const totalVotesOfParticipant = async (participantId:string, contestId:string)=> {
    const ranking = await contestRankingService.buildContestRanking(contestId)
    return ranking.photographers.find(item => item.participantId === participantId)?.score ?? 0
}


const getContestTotalVotes = async (contestId:string)=> {
    // Votes counted with voting power (see voteWeight.service).
    const { weight: count } = await getVoteWeightStats({contestId})

    return count
}
export const voteService = {
    getTotalPromotedVotes,
    getTotalOrganicVotes,
    getTeamTotalVotes,
    getVoteCount,
    getVoteCountsForContestPhotos,
    getVoteCountsByPhotoIds,
    getUserPhotoVoteCount,
    getUserTotalVotes,
    getUserContestSpecificVote,
    totalVotesOfParticipant,
    getContestTotalVotes
}
