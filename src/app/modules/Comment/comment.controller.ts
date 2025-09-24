import httpStatus from 'http-status'
import { Request, Response } from "express";
import catchAsync from "../../../shared/catchAsync";
import { handlDeleteComment, handleGetUserComments, handlePostComment, handleUpdateComment } from "./comment.service";
import sendResponse from "../../../shared/ApiResponse";



export const replyComment = catchAsync (async (req:Request, res:Response)=>{
    const { text} = req.body
    const {commentId:replyTo} = req.params
    const userId = req.user.id

    const comment = await handlePostComment(userId, text,undefined, replyTo)

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.CREATED,
        message:"Comment posted successfully",
        data:comment
    })
})

export const postComment = catchAsync(async (req:Request, res:Response)=>{

    const { text} = req.body
    const {photoId} = req.params
    const userId = req.user.id

    const comment = await handlePostComment(userId, text, photoId)

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.CREATED,
        message:"Comment posted successfully",
        data:comment
    })
})

export const deleteComment  = catchAsync(async (req:Request, res:Response)=>{
    console.log(req.params)
    const {commentId} = req.params
    const userId = req.user.id

    const deletedData = await handlDeleteComment(userId,commentId as string)

    sendResponse(res,{
        success:true,
        statusCode:httpStatus.OK,
        message:"Comment deleted successfully",
        data:deletedData
    })

})

export const editComment = catchAsync(async (req:Request, res:Response)=>{
    const {commentId} = req.params
    const { text} = req.body

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
    const allComments = await handleGetUserComments(photoId)

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"comments fetched successfully",
        data:allComments
    })
})