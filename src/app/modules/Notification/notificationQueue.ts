import { Notification } from "../../../prismaClient";
import { notificationService } from "./notification.service";

class NotificationQueue {
    private queue:Notification[] = []
    private static instance:NotificationQueue | null = null

    private constructor (){}

    static async createNotificationQueue (){
        if(NotificationQueue.instance)
            return NotificationQueue.instance
        const q = new NotificationQueue()
        await q.fetchUnsentNotification()

        return NotificationQueue.instance = q
    }

    private async fetchUnsentNotification (){
        let unsentNotification = await notificationService.getUnSentNotification()

        unsentNotification.forEach( notification => {
            this.queue.push(notification)
        })
    }

    enqueueNotification (notification:Notification){

        this.queue.push(notification)
    }

    dequeueNotification(){
        this.queue.shift()
    }
}