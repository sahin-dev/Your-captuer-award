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
    const contest = await prisma.contest.findUnique({where:{id:contestId, status:ContestStatus.ACTIVE, participants:{some:{userId}}}})

    if (!contest){
        throw new  ApiError(httpstatus.NOT_FOUND, 'User is not valid to vote')
    }

    const type = await getVoteType(photoId)

    if(!(await checkExistingVote(userId, contestId,photoId))){
        const vote = await prisma.vote.create({data:{providerId:userId, contestId, photoId, type}})
        globalEventHandler.publish(Events.NEW_VOTE,{photoId, contestId})
        return vote
    }
    return "vote exist"
    
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
        const contestPhoto = await prisma.contestPhoto.findFirst({where:{contestId, photoId}})
        if(!contestPhoto){
            throw new ApiError(httpstatus.NOT_FOUND, "contest photo not found")
        }
        const isVoteExist = await checkExistingVote(userId, contestId, photoId)
        if( !isVoteExist){
            const type = await getVoteType(photoId)
            const vote = await prisma.vote.create({data:{contestId:contest.id,providerId:user.id,photoId, type}})
            globalEventHandler.publish(Events.NEW_VOTE,{photoId, contestId})
            votes.push(vote)
        }
            

        //publish a event if new vote added 
    })

    return Promise.all(votes)
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

export const voteService = {
    getTotalPromotedVotes,
    getTotalOrganicVotes
}