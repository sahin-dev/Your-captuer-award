import { Request, Response } from "express"
import { handleGetLikedPhotos, handleToggleLike } from "./like.service"
import sendResponse from "../../../shared/ApiResponse"

//POST  /likes/toggle
// Toggle like on a photo
// @access Private


export const toggleLike = async (req:Request, res: Response) => {
    
    const {photoId} = req.body
    const userId = req.user.id

    const like = await handleToggleLike(userId, photoId)

    sendResponse(res, {
        statusCode: 200,
        success: true,
        message: "Like toggled successfully",
        data: like
    })
}

export const getLikedPhotos = async (req: Request, res: Response) => {
     const {userId} = req.body

    const likes = await handleGetLikedPhotos(userId)

    sendResponse(res, {
        statusCode: 200,
        success: true,
        message: "Likes fetched successfully",
        data: likes
    })
}

export const getMyLikedPhotos = async (req: Request, res: Response) => {
    const userId = req.user.id

    const likes = await handleGetLikedPhotos(userId)

    sendResponse(res, {
        statusCode: 200,
        success: true,
        message: "My liked photos fetched successfully",
        data: likes
    })
}