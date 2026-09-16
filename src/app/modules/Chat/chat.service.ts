import ApiError from "../../../errors/ApiError"
import prisma from "../../../shared/prisma"
import httpStatus from 'http-status'
import { teamService } from "../Team/team.service"
import { paginationHelper } from "../../../helpers/paginationHelper";
import { getIO } from "../../../helpers/websocketSetUp";
import { NotificationType, TeamMemberStatus } from "../../../prismaClient";
import { notificationService } from "../Notification/notification.service";


const sendMessage = async (senderId: string, teamId: string, message: string) => {

    const team = await teamService.isTeamExist(teamId)
    if (!team) {
        throw new ApiError(httpStatus.NOT_FOUND, "team not found")
    }

    const chat = await prisma.chat.create({ data: { message, teamId: team.id, senderId } })

    return chat
}

// Automated/system chat messages (matchmaking updates, etc.) with no human sender.
// Rendered by the frontend without an author, centered in the chat, using
// messageType to pick the presentation and metadata for structured details.
const sendSystemMessage = async (
    teamId: string,
    message: string,
    messageType: string,
    metadata?: Record<string, any>,
) => {
    const chat = await prisma.chat.create({
        data: { message, teamId, senderId: null, messageType, metadata },
    })

    // Prisma omits relation fields on create(); the frontend expects `sender`
    // to always be present (null for system messages) so it can render them
    // without an author instead of crashing on a missing field.
    const payload = { ...chat, sender: null }

    const io = getIO()
    if (io) {
        io.to(`team_${teamId}`).emit("new_message", { event: "message", data: payload })
    }

    return payload
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
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: { sender: { select: { id: true, firstName: true, lastName: true, fullName: true, avatar: true } } }
    })

    const total = await prisma.chat.count({ where: { teamId: team.id } });
    const meta = paginationHelper.getPaginationMetaData(page, paginationLimit, total);

    return { data: chats, meta };
}

const getUnreadCount = async (userId: string, teamId: string) => {
    const member = await teamService.isTeamMemberExist(userId, teamId)

    if (!member) {
        throw new ApiError(httpStatus.NOT_FOUND, "team member is not present")
    }

    const readAfter = member.lastChatReadAt || member.createdAt

    return prisma.chat.count({
        where: {
            teamId,
            createdAt: { gt: readAfter },
            OR: [
                { senderId: { not: userId } },
                { senderId: null },
            ],
        },
    })
}

const markTeamChatRead = async (userId: string, teamId: string) => {
    const member = await teamService.isTeamMemberExist(userId, teamId)

    if (!member) {
        throw new ApiError(httpStatus.NOT_FOUND, "team member is not present")
    }

    await prisma.teamMember.update({
        where: { id: member.id },
        data: { lastChatReadAt: new Date() },
    })

    const io = getIO()
    if (io) {
        io.to(userId).emit("chat_unread_count", { teamId, unreadCount: 0 })
    }

    return { unreadCount: 0 }
}

const notifyTeamMembersOfChatMessage = async (
    chat: {
        id: string
        teamId: string | null
        senderId: string | null
        message: string
        messageType: string
        fileUrl?: string | null
        createdAt: Date
        sender?: { firstName?: string | null; lastName?: string | null; fullName?: string | null } | null
    },
    senderId: string,
) => {
    if (!chat.teamId) {
        return
    }

    const [team, recipients] = await Promise.all([
        prisma.team.findUnique({ where: { id: chat.teamId }, select: { id: true, name: true } }),
        prisma.teamMember.findMany({
            where: {
                teamId: chat.teamId,
                memberId: { not: senderId },
                status: TeamMemberStatus.ACTIVE,
            },
            select: { memberId: true, lastChatReadAt: true, createdAt: true },
        }),
    ])

    if (!team || recipients.length === 0) {
        return
    }

    const senderName = [chat.sender?.firstName, chat.sender?.lastName].filter(Boolean).join(" ").trim()
        || chat.sender?.fullName
        || "A teammate"
    const title = `New message in ${team.name}`
    const message = chat.messageType === "file"
        ? `${senderName} shared a file.`
        : `${senderName}: ${chat.message}`
    const io = getIO()

    await Promise.all(recipients.map(async (recipient) => {
        const readAfter = recipient.lastChatReadAt || recipient.createdAt
        const unreadCount = await prisma.chat.count({
            where: {
                teamId: chat.teamId,
                createdAt: { gt: readAfter },
                OR: [
                    { senderId: { not: recipient.memberId } },
                    { senderId: null },
                ],
            },
        })

        const notification = await notificationService.postNotificationWithPayload(
            title,
            message,
            recipient.memberId,
            {
                event: "CHAT_MESSAGE",
                teamId: chat.teamId,
                teamName: team.name,
                chatId: chat.id,
                senderId,
                unreadCount,
            },
            NotificationType.CHAT,
        )

        if (io) {
            const socketPayload = {
                event: "CHAT_MESSAGE",
                title,
                message,
                data: notification.data,
                timestamp: new Date(),
            }
            io.to(recipient.memberId).emit("notification", socketPayload)
            io.to(recipient.memberId).emit("chat_unread_count", {
                teamId: chat.teamId,
                unreadCount,
                message: socketPayload,
            })
        }
    }))
}

export const chatService = {
    getAllChats,
    sendMessage,
    sendSystemMessage,
    getUnreadCount,
    markTeamChatRead,
    notifyTeamMembersOfChatMessage
}
