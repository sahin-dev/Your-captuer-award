import prisma from "../../../shared/prisma"

const postNotification = async (title:string, message:string, receiverId:string)=>{

    const notification = await prisma.notification.create({data:{message,receiverId,title}})

    return notification


}

const getUserNotifications = async (receiverId:string)=>{
    const notifications = await prisma.notification.findMany({where:{receiverId}})

    return notifications
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

export const notificationService = {
    postNotification,
    getUserNotifications,
    getUnSentNotification,
    getNotificationDetails,
    updateNotificationStatus,
    
}