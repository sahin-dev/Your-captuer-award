import catchAsync from "../../../shared/catchAsync"
import {Request, Response} from 'express'
import { achievementService } from "./achievement.service"
import httpStatus from 'http-status'
import sendResponse from "../../../shared/ApiResponse"

const getAchievementsByContest = catchAsync(async (req:Request, res:Response)=>{

    const {contestId} = req.params
    
    const achievements = await achievementService.getAchievements(contestId)

    sendResponse(res, {
        statusCode:200,
        message:"Conetst achievement fethced successfully",
        success:true,
        data:achievements
    })
})

const getAchievementByUser  = catchAsync(async (req:Request, res:Response)=>{

    const {userId} = req.params
 

    const achievememnts = await achievementService.getContestAchievementsByUser(userId)

    sendResponse (res, {
        statusCode:200,
        success:true,
        message:"Contest achievement fetched successfully",
        data:achievememnts
    })
})

const getMyAchievements = catchAsync(async (req:Request, res:Response) => {

    const userId = req.user.id
    const {type} = req.body
    
    const myAchievements = await achievementService.getContestAchievementsByUser(userId, type)
   

    sendResponse (res, {
        statusCode:httpStatus.OK,
        success:true,
        message:"user achievements fetched!",
        data:myAchievements
    })
})

const getAchievementsByType = catchAsync(async (req:Request, res:Response) => {
    const {type} = req.body
    const userId = req.user.id

    const result =  await achievementService.getContestByAchievementsType(userId, type)

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"achievements fetched successfully",
        data:result
    })
})


export const achieveController = {
    getAchievementsByContest, getAchievementByUser, getMyAchievements, getAchievementsByType
}