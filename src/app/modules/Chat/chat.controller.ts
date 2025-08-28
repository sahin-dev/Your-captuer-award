import catchAsync from "../../../shared/catchAsync";
import {Request, Response} from 'express'
import { chatService } from "./chat.service";

const getAllChats =  catchAsync(async (req:Request, res:Response)=>{
    const user = req.user
    const {teamId} = req.params

    const chats = await chatService.getAllChats(user.id,teamId)
})

export const chatController = {
    getAllChats
}