import { Request, Response } from "express"
import { handleGetLikedPhotos, handleToggleLike } from "./like.service"
import sendResponse from "../../../shared/ApiResponse"
import catchAsync from "../../../shared/catchAsync"

//POST  /likes/toggle
// Toggle like on a photo
// @access Private


export const toggleLike = catchAsync(async (req: Request, res: Response) => {
    
    const {photoId} = req.params
    const userId = req.user.id

    const like = await handleToggleLike(userId, photoId)

    sendResponse(res, {
        statusCode: 200,
        success: true,
        message: "Like toggled successfully",
        data: like
    })
})

export const getLikedPhotos = catchAsync(async (req: Request, res: Response) => {
    const {userId} = req.body

    const likes = await handleGetLikedPhotos(userId)

    sendResponse(res, {
        statusCode: 200,
        success: true,
        message: "Likes fetched successfully",
        data: likes
    })
})

export const getMyLikedPhotos = catchAsync(async (req: Request, res: Response) => {
    const userId = req.user.id

    const likes = await handleGetLikedPhotos(userId)
    
    sendResponse(res, {
        statusCode: 200,
        success: true,
        message: "My liked photos fetched successfully",
        data: likes
    })
})