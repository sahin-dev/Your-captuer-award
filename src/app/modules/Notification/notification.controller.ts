import { Request, Response } from "express";
import catchAsync from "../../../shared/catchAsync";
import { notificationService } from "./notification.service";
import sendResponse from "../../../shared/ApiResponse";
import httpStatus from 'http-status'


const getUserNotifications = catchAsync(async (req:Request, res:Response) => {
    const userId = req.user.id
    const { page, limit } = req.query;

    const result = await notificationService.getUserNotifications(
        userId,
        page ? Number(page) : undefined,
        limit ? Number(limit) : undefined
    )

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"notifications fetched successfully",
        data:result.data,
        meta:result.meta
    })
})

const getAdminNotification = catchAsync(async (req:Request, res:Response) => {
    const { page, limit } = req.query;

    const result = await notificationService.getAdminNotification(
        page ? Number(page) : undefined,
        limit ? Number(limit) : undefined
    )

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"admin notifications fetched successfully",
        data:result.data,
        meta:result.meta
    })
})

const markAllRead = catchAsync(async (req:Request, res:Response) => {

    const userId = req.user.id
    const notifications = await notificationService.markAllRead(userId)

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"mark all notification as read",
        data:notifications
    })
})

const markOneRead = catchAsync(async (req:Request, res:Response) => {
    const notification = await notificationService.markOneRead(req.params.notificationId, req.user.id)

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"notification marked as read",
        data:notification
    })
})
export const notificationController = {
    getUserNotifications,
    getAdminNotification,
    markAllRead,
    markOneRead
}
