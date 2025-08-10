import httpstatus from 'http-status'
import ApiError from "../../../errors/ApiError"
import prisma from "../../../shared/prisma"
import { ContestStatus, Vote } from '../../../prismaClient'
import globalEventHandler from '../../event/eventEmitter'
import Events from '../../event/events.constant'

const checkExistingVote = async (userId:string, contestId:string, photoId:string)=>{
    const exisitngVote = await prisma.vote.findFirst({where:{providerId:userId, contestId, photoId}})

    if(exisitngVote){
        return exisitngVote
    }

    return false
}



export const addOneVote = async (userId:string, contestId:string, photoId:string)=>{
    const user = await prisma.user.findUnique({where:{id:userId}})

     if (!user){
        throw new ApiError(httpstatus.NOT_FOUND, 'User not found')
    }
    const contest = await prisma.contest.findUnique({where:{id:contestId, status:ContestStatus.OPEN, participants:{some:{userId}}}})

    if (!contest){
        throw new  ApiError(httpstatus.NOT_FOUND, 'User is not valid to vote')
    }

    if(!(await checkExistingVote(userId, contestId,photoId))){
        const vote = await prisma.vote.create({data:{providerId:userId, contestId, photoId}})
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
    const contest = await prisma.contest.findUnique({where:{id:contestId, status:ContestStatus.OPEN, participants:{some:{userId}}}})

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
            const vote = await prisma.vote.create({data:{contestId:contest.id,providerId:user.id,photoId}})
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

