import catchAsync from "../../../shared/catchAsync";
import {Request, Response} from 'express'
import { userService } from "./user.service";
import sendResponse from "../../../shared/ApiResponse";
import httpstatus from 'http-status'
import ApiError from "../../../errors/ApiError";


const registerUser = catchAsync(async (req:Request, res:Response)=>{
    const body = req.body

    const registerData = await userService.register(body)
    res.cookie("token", registerData.token, {
      httpOnly: true,
      secure: true,
      maxAge: 365 * 24 * 60 * 60 * 1000,
    });

    sendResponse(res, {
        success:true,
        statusCode:httpstatus.CREATED,
        message:"user registered successfully",
        data:registerData
    })
})

const uploadAvatar = catchAsync(async (req:Request, res:Response)=>{
    if (!req.file){
        throw new ApiError(httpstatus.NOT_FOUND, "file is required")
    }

    const uploadedFilePath = await userService.uploadAvatar(req.file)

    sendResponse(res, {
        success:true,
        statusCode:httpstatus.OK,
        message:"Photo uploaded successfully",
        data:uploadedFilePath
    })
})
export const userController = {
    registerUser,
    uploadAvatar
}