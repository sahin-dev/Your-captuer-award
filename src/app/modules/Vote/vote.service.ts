import httpstatus from 'http-status'
import ApiError from "../../../errors/ApiError"
import prisma from "../../../shared/prisma"
import { ContestPhoto, ContestStatus, Prisma, Vote, VoteType } from '../../../prismaClient'
import globalEventHandler from '../../event/eventEmitter'
import Events from '../../event/events.constant'
import { ObjectId } from 'mongodb'
import { levelService } from '../Level/level.service'
import { contestRuleEngine } from '../Contest/ContestRules/contestRule.engine'
import { getVoteWeightStats } from './voteWeight.service'
import { contestProgressService } from '../Contest/ContestProgress/contestProgress.service'
import { notificationOrchestrator } from '../Notification/notificationOrchestrator'
import { contestRankingService } from '../Contest/ContestRanking/contestRanking.service'

type VoteContestPhoto = ContestPhoto & {
    participant: {
        id: string
        userId: string
    }
}

const resolveContestPhotoForVote = async (contestId:string, contestPhotoId:string): Promise<VoteContestPhoto | null> => {
    const contestPhoto = await prisma.contestPhoto.findFirst({
        // `photoId` is retained as a rolling-deployment fallback for older
        // clients. New clients always submit the ContestPhoto id.
        where:{
            contestId,
            OR:[{id:contestPhotoId}, {photoId:contestPhotoId}]
        },
        include:{participant:true}
    })

    return contestPhoto
}

const getVoteType = (contestPhoto: Pick<ContestPhoto, "promoted">)=>{
    let voteType:VoteType = VoteType.Organic

    if(contestPhoto.promoted)
        voteType = VoteType.Promoted

    return voteType
}


export const addOneVote = async (userId:string, contestId:string, contestPhotoId:string)=>{
    
    const user = await prisma.user.findUnique({where:{id:userId}})
    
     if (!user){
        throw new ApiError(httpstatus.NOT_FOUND, 'User not found')
    }

    const contest = await prisma.contest.findUnique({where:{id:contestId, status:ContestStatus.ACTIVE}})
    
    if (!contest){
        throw new  ApiError(httpstatus.NOT_FOUND, 'contest not found')
    }

    const contestPhoto = await resolveContestPhotoForVote(contestId, contestPhotoId)
    if(!contestPhoto){
        throw new ApiError(httpstatus.NOT_FOUND, "contest photo not found")
    }
    const {voterParticipant} = await contestRuleEngine.validateVotingRules(contestId, userId, contestPhoto.id)

    const type = getVoteType(contestPhoto)

    const weight = Math.max(1, user.voting_power ?? 1)
    try{
        // Stamp the image live in this slot right now, so a later swap doesn't
        // silently move this vote onto a different photo's tally - see getVoteCount.
        const vote = await prisma.vote.create({data:{providerId:userId, contestId, contestPhotoId:contestPhoto.id, photoRefId:contestPhoto.photoId, type, power:weight, weight}})
        // Casting a vote rewards the voter's own participation - their exposure
        // goes up, not the photo they voted for (that's driven separately by
        // submission/trade spotlight windows and scheduled decay).
        if(voterParticipant){
            await prisma.contestParticipant.update({
                where:{id:voterParticipant.id},
                data:{exposure_bonus:{increment:2}, exposureUpdatedAt:new Date()}
            })
        }
        globalEventHandler.publish(Events.NEW_VOTE,{photoId:contestPhoto.id, contestId})
        await contestProgressService.evaluateParticipantLevel(contestId, contestPhoto.participantId)
        await levelService.evaluateAndUpdateUserLevel(contestPhoto.participant.userId)

        const totalVotes = await getVoteCount(contestPhoto.id)
        const voterName = user.fullName || [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || "Someone"
        await notificationOrchestrator.notifyVoteReceived(
            contestPhoto.participantId,
            contestPhoto.participant.userId,
            contestId,
            contest.title,
            contestPhoto.id,
            userId,
            voterName,
            totalVotes,
        )

        return vote
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

    const user = await prisma.user.findUnique({where:{id:userId}})

     if (!user){
        throw new ApiError(httpstatus.NOT_FOUND, 'User not found')
    }
    const contest = await prisma.contest.findUnique({where:{id:contestId, status:ContestStatus.ACTIVE}})

    if (!contest){
        throw new  ApiError(httpstatus.NOT_FOUND, 'Contest is not available to vote')
    }

    const votes = (await Promise.all(contestPhotoIds.map(async (contestPhotoId:string)=>{
        return addOneVote(userId, contestId, contestPhotoId)
    }))).filter((vote): vote is Vote => Boolean(vote))

    return votes
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
    const contestIdByPhotoId = new Map(contestPhotos.map(photo => [photo.id, photo.contestId]))
    const uniqueContestIds = [...new Set(contestPhotos.map(photo => photo.contestId))]
    const rankings = await Promise.all(
        uniqueContestIds.map(async contestId => contestRankingService.buildContestRanking(contestId))
    )
    const rankByPhotoId = new Map(
        rankings.flatMap(ranking => ranking.photos.map(photo => [photo.photoId, photo.rank] as const))
    )

    const counts = await Promise.all(
        contestPhotoIds.map(async (contestPhotoId) => ({
            contestPhotoId,
            voteCount: await getVoteCount(contestPhotoId),
            rank:contestIdByPhotoId.has(contestPhotoId) ? rankByPhotoId.get(contestPhotoId) ?? null : null
        }))
    )

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
    const { count } = await getVoteWeightStats({contestId, photo:{participantId}})

    return count
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
