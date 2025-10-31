import {Request, Response} from 'express'
import { handleGetUserUploads, profileService } from './profile.service'
import sendResponse from '../../../shared/ApiResponse'
import httpStatus from 'http-status'
import catchAsync from '../../../shared/catchAsync'


export const getMyUploads = async (req:Request, res:Response)=> {
    const userId = req.user.id

    const {page, limit} = req.query as { page?: string; limit?: string }

    let pageNum = page ? Number(page) : undefined
    let limitNum = limit ? Number(limit) : undefined

    const uploads = await handleGetUserUploads(userId, {page:pageNum, limit:limitNum})

    sendResponse(res, {
        statusCode:httpStatus.OK,
        success:true,
        message:"user uploads fetched successfully",
        data:uploads
    })
}


const uploadUserPhoto = async (req:Request, res:Response) => {
    const userId = req.user.id
    const file = req.file
    const addedPhoto = await profileService.uploadUserPhoto(userId, file as Express.Multer.File)

    sendResponse(res, {
        statusCode:httpStatus.CREATED,
        success:true,
        message:"photo uploaded successfully",
        data:addedPhoto
    })
}


const getUserStates = async (req:Request, res:Response) => {
    const userId = req.user.id
    const states = await profileService.getStates(userId)

    sendResponse(res, {
        statusCode:httpStatus.OK,
        success:true,
        message:"user states fetched successfully",
        data:states
    })
}


const getUserPhotoDetails = catchAsync(async (req:Request, res:Response) => {
    const {photoId} = req.params
    const userId = req.user.id

    const result = await profileService.getUserPhotoDetails(userId,photoId)

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"photo details fetched successfully",
        data:result
    })
})

const deleteUserPhoto = catchAsync(async (req:Request, res:Response) => {
    const {photoId} = req.params
    const userId = req.user.id

    const result = await profileService.deleteUserPhoto(userId, photoId)

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"User photo deleted successfully",
        data:result
    })
})
export const profileController = {
    getMyUploads,
    uploadUserPhoto,
    getUserStates,
    getUserPhotoDetails,
    deleteUserPhoto

}