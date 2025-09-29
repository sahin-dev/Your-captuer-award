import httpstatus from 'http-status'
import ApiError from "../../../errors/ApiError"
import prisma from "../../../shared/prisma"
import { ContestStatus, Vote, VoteType } from '../../../prismaClient'
import globalEventHandler from '../../event/eventEmitter'
import Events from '../../event/events.constant'

const checkExistingVote = async (userId:string, contestId:string, photoId:string)=>{
    const exisitngVote = await prisma.vote.findFirst({where:{providerId:userId, contestId, photoId}})

    if(exisitngVote){
        return exisitngVote
    }

    return false
}


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
    const participant = await prisma.contestParticipant.findFirst({where:{contestId:contest.id, userId}})

    if (!participant){
        throw new ApiError(httpstatus.NOT_FOUND, "participant not found")
    }
    const contestPhoto = await prisma.contestPhoto.findFirst({where:{contestId, id:photoId}})
    if(!contestPhoto){
        throw new ApiError(httpstatus.NOT_FOUND, "contest photo not found")
    }

    const type = await getVoteType(photoId)

    if(!(await checkExistingVote(userId, contestId,photoId))){
        const vote = await prisma.vote.create({data:{providerId:userId, contestId, photoId, type}})
        await prisma.contestParticipant.update({where:{id:participant.id}, data:{exposure_bonus:{increment:2}}})
        globalEventHandler.publish(Events.NEW_VOTE,{photoId, contestId})
        return vote
    }
    
}


export const addVotes = async (userId:string,contestId:string, photoIds:string[])=>{

    const user = await prisma.user.findUnique({where:{id:userId}})

     if (!user){
        throw new ApiError(httpstatus.NOT_FOUND, 'User not found')
    }
    const contest = await prisma.contest.findUnique({where:{id:contestId, status:ContestStatus.ACTIVE, participants:{some:{userId}}}})

    if (!contest){
        throw new  ApiError(httpstatus.NOT_FOUND, 'User is not valid to vote')
    }

   
    let votes:Vote[] = [];

    photoIds.forEach( async (photoId:string)=>{
        
       const vote = await addOneVote(userId,contestId,photoId)
       if(vote)
            votes.push(vote)

        //publish a event if new vote added 
    })

    return await Promise.all(votes)
}


export const getVoteCount = async (photoId:string)=>{

    const votesCount = await prisma.vote.count({where:{photoId}})

    return votesCount
}


export const getVoteUsers = async (photoId:string)=>{
    const voters = await prisma.vote.findMany({where:{photoId}, include:{provider:true}})

    return voters
}



const getTotalPromotedVotes = async (userId:string)=>{
    const totalPromotedVotes = await prisma.vote.count({where:{photo:{participant:{userId}}, type:VoteType.Promoted}})

    return totalPromotedVotes
}

const getTotalOrganicVotes = async (userId:string)=>{
    const totalOrganicVotes = await prisma.vote.count({where:{photo:{participant:{userId}}, type:VoteType.Organic}})

    return totalOrganicVotes
}

const getTeamTotalVotes = async (contestId:string , teamId:string) => {

    const votes = await prisma.vote.count({where:{contestId, photo:{photo:{user:{joinedTeam:{id:teamId}}}}}})

    return votes
}

const getUserTotalVotes = async (userId:string) => {

    const totalVote = await prisma.vote.count({where:{photo:{participant:{userId}}}})

    return totalVote
}

const getUserContestSpecificVote = async (contestId:string, userId:string) => {
    const totalVote = await prisma.vote.count({where:{contestId,photo:{participant:{userId}}}})

    return totalVote
}

export const voteService = {
    getTotalPromotedVotes,
    getTotalOrganicVotes,
    getTeamTotalVotes,
    getVoteCount,
    getUserTotalVotes,
    getUserContestSpecificVote
}