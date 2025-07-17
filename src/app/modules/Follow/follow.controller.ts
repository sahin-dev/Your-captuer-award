import { Request, Response } from "express";
import catchAsync from "../../../shared/catchAsync";
import { handleFollowUnfollow, handleGetMyFollowers, handleGetMyFollowings } from "./followe.service";
import sendResponse from "../../../shared/ApiResponse";
import httpStatus from 'http-status'


export const toggoleFollow = catchAsync(async ( req:Request, res:Response)=>{

    const userId = req.user.id
    const {userId:followUserId} = req.body

    const data = await handleFollowUnfollow(userId, followUserId)

    sendResponse (res, {
        statusCode:httpStatus.OK,
        success:true,
        message:"user follow status changed successfully",
        data
    })

})

export const getFollowers = catchAsync(async (req:Request, res:Response)=>{
    const userId = req.user.id
    
    const followers = await handleGetMyFollowers(userId)

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"Followers fetched successfully",
        data:followers
    })
})


export const getFollowings = catchAsync(async (req:Request, res:Response)=>{
    const userId = req.user.id
    
    const followings = await handleGetMyFollowings(userId)

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"Followings fetched successfully",
        data:followings
    })
})