import httpstatus from 'http-status'
import ApiError from "../../../errors/ApiError"
import prisma from "../../../shared/prisma"
import { ContestStatus, Vote } from '@prisma/client'


export const addVotes = async (userId:string,contestId:string, photoIds:string[])=>{
    const user = await prisma.user.findUnique({where:{id:userId}})
    const contest = await prisma.contest.findUnique({where:{id:contestId, status:ContestStatus.OPEN, participants:{some:{userId}}}})

    if (!contest){
        throw new  ApiError(httpstatus.NOT_FOUND, 'Contest is not valid')
    }

    if (!user){
        throw new ApiError(httpstatus.NOT_FOUND, 'User not found')
    }
    let votes:Promise<Vote>[] = [];

    photoIds.forEach((id:string)=>{
        const vote = prisma.vote.create({data:{contestId:contest.id,providerId:user.id,photoId:id}})
        votes.push(vote)
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

