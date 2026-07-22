import ApiError from "../../../errors/ApiError"
import prisma from "../../../shared/prisma"
import httpStatus from 'http-status'
import { teamService } from "../Team/team.service"
import { paginationHelper } from "../../../helpers/paginationHelper";


const sendMessage = async (senderId: string, teamId: string, message: string) => {

    const team = await teamService.isTeamExist(teamId)
    if (!team) {
        throw new ApiError(httpStatus.NOT_FOUND, "team not found")
    }

    const chat = await prisma.chat.create({ data: { message, teamId: team.id, senderId } })

    return chat
}

const getAllChats = async (userId: string, teamId: string, page: number = 1, limit: number = 20) => {
    console.log("UserId", userId)
    console.log("teamId", teamId)
    const isExist = await teamService.isTeamMemberExist(userId, teamId)

    if (!isExist) {
        throw new ApiError(httpStatus.NOT_FOUND, "team member is not present")
    }

    const team = await teamService.isTeamExist(teamId)

    if (!team) {
        throw new ApiError(httpStatus.NOT_FOUND, "team is not found")
    }

    const { skip, limit: paginationLimit } = paginationHelper.calculatePagination({ page, limit });

    const chats = await prisma.chat.findMany({
        where: { teamId: team.id },
        skip,
        take: paginationLimit,
        orderBy: { createdAt: "desc" },
        include: { sender: { select: { avatar: true, fullName: true } } }
    })

    const total = await prisma.chat.count({ where: { teamId: team.id } });
    const meta = paginationHelper.getPaginationMetaData(page, paginationLimit, total);

    return { data: chats, meta };
}

export const chatService = {
    getAllChats,
    sendMessage
}