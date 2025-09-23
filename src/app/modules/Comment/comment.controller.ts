import httpStatus from 'http-status'
import { Request, Response } from "express";
import catchAsync from "../../../shared/catchAsync";
import { getAll, handlDeleteComment, handlePostComment, handleUpdateComment } from "./comment.service";
import sendResponse from "../../../shared/ApiResponse";
import prisma from '../../../shared/prisma';
import ApiError from '../../../errors/ApiError';


export const postComment = catchAsync(async (req:Request, res:Response)=>{

    const { text} = req.body
    const {photoId} = req.params
    const userId = req.user.id

    const photo = await prisma.userPhoto.findUnique({where:{id:photoId}})

    if(!photo){
        throw new ApiError(httpStatus.NOT_FOUND, "photo not found")
    }

    const comment = await handlePostComment(userId, photoId, text)

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.CREATED,
        message:"Comment posted successfully",
        data:comment
    })
})

export const deleteComment  = catchAsync(async (req:Request, res:Response)=>{

    const {commentId} = req.body

    const deletedData = await handlDeleteComment(commentId)

    sendResponse(res,{
        success:true,
        statusCode:httpStatus.OK,
        message:"Comment deleted successfully",
        data:deletedData
    })

})

export const editComment = catchAsync(async (req:Request, res:Response)=>{

    const {commentId, text} = req.body

    const editedData = await handleUpdateComment(commentId,text)

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"comment updated successfully",
        data:editedData
    })

})

export const getComments = catchAsync(async (req:Request, res:Response)=>{
    const {photoId} = req.params
    const allComments = await getAll(photoId)

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"comments fetched successfully",
        data:allComments
    })
})