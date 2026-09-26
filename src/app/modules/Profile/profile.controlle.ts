import { Request, Response } from 'express'
import { handleGetUserPublicUploads, handleGetUserUploads, profileService } from './profile.service'
import sendResponse from '../../../shared/ApiResponse'
import httpStatus from 'http-status'
import catchAsync from '../../../shared/catchAsync'


export const getMyUploads = catchAsync(async (req: Request, res: Response) => {
    const userId = req.user.id

    const { page, limit } = req.query as { page?: string; limit?: string }

    let pageNum = page ? Number(page) : undefined
    let limitNum = limit ? Number(limit) : undefined

    // viewerId = self, so isLiked works for own photos too
    const result = await handleGetUserUploads(userId, { page: pageNum, limit: limitNum }, userId)

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "user uploads fetched successfully",
        data: result.data,
        meta: result.meta
    })
})

export const getUserPhotos = catchAsync(async (req: Request, res: Response) => {
    const targetUserId = req.params.id
    const viewerId = req.user?.id
    const { page, limit } = req.query as { page?: string; limit?: string }

    let pageNum = page ? Number(page) : undefined
    let limitNum = limit ? Number(limit) : undefined

    // Pass viewerId so each photo includes isLiked
    const result = await handleGetUserPublicUploads(targetUserId, { page: pageNum, limit: limitNum }, viewerId)

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "user uploads fetched successfully",
        data: result.data,
        meta: result.meta
    })
})


const uploadUserPhoto = async (req: Request, res: Response) => {
    const userId = req.user.id
    const file = req.file
    const addedPhoto = await profileService.uploadUserPhoto(userId, file as Express.Multer.File)

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "photo uploaded successfully",
        data: addedPhoto
    })
}


const createDirectUploadUrl = catchAsync(async (req:Request, res:Response) => {
    const {fileName, contentType, fileSize} = req.body
    const result = await profileService.createDirectUploadUrl(
        req.user.id,
        String(fileName || "upload"),
        String(contentType || ""),
        Number(fileSize),
    )
    sendResponse(res, {statusCode:httpStatus.OK, success:true, message:"upload URL created", data:result})
})

const confirmDirectUpload = catchAsync(async (req:Request, res:Response) => {
    const result = await profileService.confirmDirectUpload(req.user.id, String(req.body.key || ""))
    sendResponse(res, {statusCode:httpStatus.CREATED, success:true, message:"photo upload confirmed", data:result})
})

const getUserStates = async (req: Request, res: Response) => {
    const userId = req.user.id
    const states = await profileService.getStates(userId)

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "user states fetched successfully",
        data: states
    })
}

const getUserPublicStates = catchAsync(async (req:Request, res:Response) => {
    const userId = req.params.id
    const states = await profileService.getStates(userId)

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "user states fetched successfully",
        data: states
    })
})


const getUserPhotoDetails = catchAsync(async (req: Request, res: Response) => {
    const { photoId } = req.params
    const userId = req.user.id
    const viewerId = req.user.id

    const result = await profileService.getUserPhotoDetails(userId, photoId, viewerId)

    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "photo details fetched successfully",
        data: result
    })
})

const deleteUserPhoto = catchAsync(async (req: Request, res: Response) => {
    const { photoId } = req.params
    const userId = req.user.id

    const result = await profileService.deleteUserPhoto(userId, photoId)

    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "User photo deleted successfully",
        data: result
    })
})

const updatePhotoLabels = catchAsync(async (req: Request, res: Response) => {
    const { photoId } = req.params
    const userId = req.user.id

    const result = await profileService.updatePhotoLabels(userId, photoId, req.body.labels)

    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "photo labels updated successfully",
        data: result
    })
})

// GET /profile/users/:id/profile — public user profile with isFollowed
const getUserPublicProfile = catchAsync(async (req: Request, res: Response) => {
    const targetUserId = req.params.id
    const viewerId = req.user?.id

    const result = await profileService.getUserProfileDetails(targetUserId, viewerId)

    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "user profile fetched successfully",
        data: result
    })
})

// GET /profile/users/:id/photos/:photoId — public photo detail with isLiked + isFollowed + comments
const getPublicPhotoDetails = catchAsync(async (req: Request, res: Response) => {
    const { id: targetUserId, photoId } = req.params
    const viewerId = req.user?.id

    const result = await profileService.getPublicPhotoDetails(targetUserId, photoId, viewerId)

    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "photo details fetched successfully",
        data: result
    })
})
export const profileController = {
    getMyUploads,
    uploadUserPhoto,
    createDirectUploadUrl,
    confirmDirectUpload,
    getUserStates,
    getUserPhotoDetails,
    deleteUserPhoto,
    updatePhotoLabels,
    getUserPhotos,
    getUserPublicStates,
    getUserPublicProfile,
    getPublicPhotoDetails,
}
