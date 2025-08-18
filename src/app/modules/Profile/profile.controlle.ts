import {Request, Response} from 'express'
import { handleGetUserUploads, profileService } from './profile.service'
import sendResponse from '../../../shared/ApiResponse'

import httpStatus from 'http-status'


export const getMyUploads = async (req:Request, res:Response)=> {
    const userId = req.user.id

    const uploads = await handleGetUserUploads(userId)

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

export const profileController = {
    getMyUploads,
    uploadUserPhoto,
    getUserStates

}