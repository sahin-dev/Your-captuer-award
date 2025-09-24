import catchAsync from "../../../shared/catchAsync";
import {Request, Response} from 'express'
import { chatService } from "./chat.service";
import sendResponse from "../../../shared/ApiResponse";
import httpStatus from 'http-status'

const getAllChats =  catchAsync(async (req:Request, res:Response)=>{
    const user = req.user
    const {teamId} = req.params

    const chats = await chatService.getAllChats(user.id,teamId)

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"chats fetched successfully",
        data:chats
    })
})

export const chatController = {
    getAllChats
}