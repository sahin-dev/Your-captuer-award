import ApiError from "../../../errors/ApiError"
import { userSockets } from "../../../helpers/websocketSetUp"
import { paginationHelper } from "../../../helpers/paginationHelper"
import { NotificationType, UserRole } from "../../../prismaClient"
import prisma from "../../../shared/prisma"
import httpStatus from 'http-status'

const postNotification = async (title:string, message:string, receiverId:string,type?:NotificationType)=>{

    const notification = await prisma.notification.create({data:{message, receiverId, title, ...(type && { type })}})

    return notification
}

const postNotificationWithPayload = async (title:string, message:string, receiverId:string, payload:Record<string, any>,type?:NotificationType,) => {

    const notification = await prisma.notification.create({data:{title, message, receiverId, data:payload, ...(type && { type })}})

    const userSocket = userSockets.get(receiverId)
    if(userSocket && (userSocket.readyState === WebSocket.OPEN)){
        userSocket.send(JSON.stringify({type:"notification", data:notification}))
    }

    return notification
}

const getUserNotifications = async (receiverId:string, page: number = 1, limit: number = 10)=>{
    const { skip, limit: paginationLimit } = paginationHelper.calculatePagination({ page, limit });
    
    const notifications = await prisma.notification.findMany({where:{receiverId}, skip, take: paginationLimit, orderBy: { createdAt: 'desc' }})

    const total = await prisma.notification.count({where:{receiverId}});
    const paginationMetaData = paginationHelper.getPaginationMetaData(page, paginationLimit, total);
    
    return { data: notifications, meta: paginationMetaData };
}

const getNotificationDetails = async (notificationId:string)=>{
    const notification = await prisma.notification.findUnique({where:{id:notificationId}})

    await updateNotificationStatus(notificationId, {isRead:true})

    return notification
}

const updateNotificationStatus = async (notificationId:string, status:{isRead?:boolean, isSent?:boolean})=>{

    const updatedNotification = await prisma.notification.update({where:{id:notificationId}, data:{...status}})

    return updatedNotification
}

const getUnSentNotification = async ()=>{
    const unsentNotification = await prisma.notification.findMany({where:{isSent:false}})
    return unsentNotification
}


const getAdminNotification = async (page: number = 1, limit: number = 10) => {
    const { skip, limit: paginationLimit } = paginationHelper.calculatePagination({ page, limit });
    
    const adminNotifications = await prisma.notification.findMany({where:{type:NotificationType.PAYMENT}, skip, take: paginationLimit, orderBy: { createdAt: 'desc' }})

    const total = await prisma.notification.count({where:{type:NotificationType.PAYMENT}});
    const paginationMetaData = paginationHelper.getPaginationMetaData(page, paginationLimit, total);

    return { data: adminNotifications, meta: paginationMetaData };
}

const markAllRead = async (userId:string) => {
    const user = await prisma.user.findUnique({where:{id:userId}})
    if(!user){
        throw new ApiError(httpStatus.NOT_FOUND, "user not found")
    }

    if(user.role === UserRole.USER){
        return await prisma.notification.updateMany({where:{receiverId:userId}, data:{isRead:true}})
    }

    return await prisma.notification.updateMany({where:{receiverId:'admin'}, data:{isRead:true}})
}

export const notificationService = {
    postNotification,
    getUserNotifications,
    getUnSentNotification,
    getNotificationDetails,
    updateNotificationStatus,
    postNotificationWithPayload,
    getAdminNotification,
    markAllRead
    
}