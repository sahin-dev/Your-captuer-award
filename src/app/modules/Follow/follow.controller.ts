import { Request, Response } from "express";
import catchAsync from "../../../shared/catchAsync";
import { handleFollowUnfollow, handleGetMyFollowers, handleGetMyFollowings } from "./followe.service";
import sendResponse from "../../../shared/ApiResponse";
import httpStatus from 'http-status'


export const toggoleFollow = catchAsync(async ( req:Request, res:Response)=>{

    const userId = req.user.id
    const {userId:followedUserId} = req.body

    const data = await handleFollowUnfollow(userId, followedUserId)

    sendResponse (res, {
        statusCode:httpStatus.OK,
        success:true,
        message:"user follow status changed successfully",
        data
    })

})

export const getFollowers = catchAsync(async (req:Request, res:Response)=>{
    const userId = req.user.id
    const { page, limit } = req.query;
    
    const result = await handleGetMyFollowers(userId, page ? Number(page) : undefined, limit ? Number(limit) : undefined)

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"Followers fetched successfully",
        data:result.data,
        meta:result.meta
    })
})


export const getFollowings = catchAsync(async (req:Request, res:Response)=>{
    const userId = req.user.id
    const { page, limit } = req.query;
    
    const result = await handleGetMyFollowings(userId, page ? Number(page) : undefined, limit ? Number(limit) : undefined)

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"Followings fetched successfully",
        data:result.data,
        meta:result.meta
    })
})