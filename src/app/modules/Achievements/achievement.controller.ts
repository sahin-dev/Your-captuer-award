import catchAsync from "../../../shared/catchAsync"
import {Request, Response} from 'express'
import { achievementService } from "./achievement.service"
import httpStatus from 'http-status'
import sendResponse from "../../../shared/ApiResponse"

const getAchievementsByContest = catchAsync(async (req:Request, res:Response)=>{

    const {contestId} = req.params
    const { page, limit } = req.query;
    
    const result = await achievementService.getAchievements(contestId, page ? Number(page) : undefined, limit ? Number(limit) : undefined)

    sendResponse(res, {
        statusCode:200,
        message:"Contest achievement fetched successfully",
        success:true,
        data:result.data,
        meta:result.meta
    })
})

const getAchievementByUser  = catchAsync(async (req:Request, res:Response)=>{

    const {userId} = req.params
    const { page, limit } = req.query;
 
    const result = await achievementService.getContestAchievementsByUser(userId, undefined, page ? Number(page) : undefined, limit ? Number(limit) : undefined)

    sendResponse (res, {
        statusCode:200,
        success:true,
        message:"Contest achievement fetched successfully",
        data:result.data,
        meta:result.meta
    })
})

const getMyAchievements = catchAsync(async (req:Request, res:Response) => {

    const userId = req.user.id
    const {type} = req.body
    const { page, limit } = req.query;
    
    const result = await achievementService.getContestAchievementsByUser(userId, type, page ? Number(page) : undefined, limit ? Number(limit) : undefined)
   
    sendResponse (res, {
        statusCode:httpStatus.OK,
        success:true,
        message:"user achievements fetched!",
        data:result.data,
        meta:result.meta
    })
})

const getAchievementsByType = catchAsync(async (req:Request, res:Response) => {
    const {type} = req.body
    const userId = req.user.id
    const { page, limit } = req.query;

    const result =  await achievementService.getContestByAchievementsType(userId, type, page ? Number(page) : undefined, limit ? Number(limit) : undefined)

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"achievements fetched successfully",
        data:result.data,
        meta:result.meta
    })
})

const getUserPhotoAchievements =  catchAsync(async (req:Request, res:Response) => {

    const {photoId} = req.params
    const userId = req.user.id
    const achievements = await achievementService.getUserPhotoAchievements(userId, photoId)

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"photo achievements fetched successfully",
        data:achievements
    })
})


export const achieveController = {
    getAchievementsByContest, getAchievementByUser, getMyAchievements, getAchievementsByType, getUserPhotoAchievements
}