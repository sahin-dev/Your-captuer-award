import ApiError from "../../../errors/ApiError"
import prisma from "../../../shared/prisma"
import httpStatus from 'http-status'
import { teamService } from "../Team/team.service"


const sendMessage = async (senderId:string,teamId:string, message:string)=>{

    const team = await teamService.isTeamExist(teamId)
    if(!team){
        throw new ApiError(httpStatus.NOT_FOUND, "team not found")
    }

    const chat = await prisma.chat.create({data:{ message,teamId:team.id, senderId}})

    return chat
}

const getAllChats = async (userId:string,teamId:string)=>{

    const isExist = await teamService.isTeamMemberExist(userId, teamId)
    
    if(!isExist){
        throw new ApiError(httpStatus.NOT_FOUND, "team member is not present")
    }
    
    const team = await teamService.isTeamExist(teamId)

    if(!team){
        throw new ApiError(httpStatus.NOT_FOUND, "team is not found")
    }
    const chats = await prisma.chat.findMany({where:{teamId:team.id}, orderBy:{createdAt:"desc"}, include:{sender:{select:{avatar:true, fullName:true}}}})

    return chats
}

export const chatService = {
    getAllChats,
    sendMessage
}