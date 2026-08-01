import httpstatus from 'http-status'
import ApiError from "../../../errors/ApiError"
import prisma from "../../../shared/prisma"
import { ContestStatus, Prisma, Vote, VoteType } from '../../../prismaClient'
import globalEventHandler from '../../event/eventEmitter'
import Events from '../../event/events.constant'
import { ObjectId } from 'mongodb'
import { levelService } from '../Level/level.service'
import { contestRuleEngine } from '../Contest/ContestRules/contestRule.engine'
import { sumVoteWeight } from './voteWeight.service'
import { contestProgressService } from '../Contest/ContestProgress/contestProgress.service'

const getVoteType = async (photoId:string)=>{
    const contestPhoto = await prisma.contestPhoto.findUnique({where:{id:photoId}})
    let voteType:VoteType = VoteType.Organic

    if(contestPhoto && contestPhoto.promoted)
        voteType = VoteType.Promoted

    return voteType
}


export const addOneVote = async (userId:string, contestId:string, photoId:string)=>{
    
    const user = await prisma.user.findUnique({where:{id:userId}})
    
     if (!user){
        throw new ApiError(httpstatus.NOT_FOUND, 'User not found')
    }

    const contest = await prisma.contest.findUnique({where:{id:contestId, status:ContestStatus.ACTIVE}})
    
    if (!contest){
        throw new  ApiError(httpstatus.NOT_FOUND, 'contest not found')
    }

    const {voterParticipant} = await contestRuleEngine.validateVotingRules(contestId, userId, photoId)
    const contestPhoto = await prisma.contestPhoto.findFirst({where:{contestId, id:photoId}, include:{participant:true}})
    if(!contestPhoto){
        throw new ApiError(httpstatus.NOT_FOUND, "contest photo not found")
    }

    const type = await getVoteType(photoId)

    const weight = Math.max(1, user.voting_power ?? 1)
    try{
        const vote = await prisma.vote.create({data:{providerId:userId, contestId, photoId, type, power:weight, weight}})
        if(voterParticipant){
            await prisma.contestParticipant.update({where:{id:voterParticipant.id}, data:{exposure_bonus:{increment:2}}})
        }
        globalEventHandler.publish(Events.NEW_VOTE,{photoId, contestId})
        await contestProgressService.evaluateParticipantLevel(contestId, contestPhoto.participantId)
        await levelService.evaluateAndUpdateUserLevel(contestPhoto.participant.userId)
        return vote
    }catch(error){
        if(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"){
            return prisma.vote.findUnique({
                where:{providerId_contestId_photoId:{providerId:userId, contestId, photoId}}
            })
        }
        throw error
    }
}


export const addVotes = async (userId:string,contestId:string, photoIds:string[])=>{

    const user = await prisma.user.findUnique({where:{id:userId}})

     if (!user){
        throw new ApiError(httpstatus.NOT_FOUND, 'User not found')
    }
    const contest = await prisma.contest.findUnique({where:{id:contestId, status:ContestStatus.ACTIVE}})

    if (!contest){
        throw new  ApiError(httpstatus.NOT_FOUND, 'Contest is not available to vote')
    }

    const votes = (await Promise.all(photoIds.map(async (photoId:string)=>{
        return addOneVote(userId,contestId,photoId)
    }))).filter((vote): vote is Vote => Boolean(vote))

    return votes
}


export const getVoteCount = async (photoId:string)=>{

    const votesCount = await sumVoteWeight({photoId})

    return votesCount
}

const getUserPhotoVoteCount = async (userPhotoId:string) => {
    const votesCount = await sumVoteWeight({photo:{photoId:userPhotoId}})

    return votesCount
}


export const getVoteUsers = async (photoId:string)=>{
    const voters = await prisma.vote.findMany({where:{photoId}, include:{provider:true}})

    return voters
}



const getTotalPromotedVotes = async (userId:string)=>{
    const totalPromotedVotes = await sumVoteWeight({photo:{participant:{userId}}, type:VoteType.Promoted})

    return totalPromotedVotes
}

const getTotalOrganicVotes = async (userId:string)=>{
    const totalOrganicVotes = await sumVoteWeight({photo:{participant:{userId}}, type:VoteType.Organic})

    return totalOrganicVotes
}

const getTeamTotalVotes = async (contestId:string , teamId:string) => {

    const votes = await sumVoteWeight({contestId, photo:{photo:{user:{joinedTeam:{id:teamId}}}}})

    return votes
}

const getUserTotalVotes = async (userId:string) => {

    const totalVote = await sumVoteWeight({photo:{participant:{userId}}})

    return totalVote
}

const getUserContestSpecificVote = async (contestId:string, userId:string) => {
    const totalVote = await sumVoteWeight({contestId,photo:{participant:{userId}}})

    return totalVote
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
    const totalVotes = await sumVoteWeight({contestId, photo:{participantId}})

    return totalVotes
}


const getContestTotalVotes = async (contestId:string)=> {
    const votes = await sumVoteWeight({contestId})

    return votes
}
export const voteService = {
    getTotalPromotedVotes,
    getTotalOrganicVotes,
    getTeamTotalVotes,
    getVoteCount,
    getUserPhotoVoteCount,
    getUserTotalVotes,
    getUserContestSpecificVote,
    totalVotesOfParticipant,
    getContestTotalVotes
}
