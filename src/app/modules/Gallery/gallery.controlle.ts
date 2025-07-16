import {Request, Response} from 'express'
import { handleGetUserUploads } from './gallery.service'
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

export const getUserUploads = async (req:Request, res:Response)=> {
    const {userId} = req.params

    const uploads = await handleGetUserUploads(userId)
    sendResponse(res, {
        statusCode:httpStatus.OK,
        success:true,
        message:"user uploads fetched successfully",
        data:uploads
    })

}
