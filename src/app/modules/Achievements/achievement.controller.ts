import catchAsync from "../../../shared/catchAsync"
import {Request, Response} from 'express'
import { achievementService } from "./achievement.service"
import prisma from "../../../shared/prisma"
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

    const {userId,contestId} = req.params
 

    const achievememnts = await achievementService.getContestAchievementsByUser(userId, contestId)

    sendResponse (res, {
        statusCode:200,
        success:true,
        message:"Contest achievement fetched successfully",
        data:achievememnts
    })
})


export const achieveController = {
    getAchievementsByContest, getAchievementByUser
}