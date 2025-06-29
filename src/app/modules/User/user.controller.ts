import catchAsync from "../../../shared/catchAsync";
import {Request, Response} from 'express'
import { userService } from "./user.service";
import sendResponse from "../../../shared/ApiResponse";
import httpstatus from 'http-status'
import ApiError from "../../../errors/ApiError";
import parseData from "../../../helpers/parseData";


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

const getUsers = catchAsync(async (req:Request, res:Response)=>{
    const users = await userService.getUsers()

    sendResponse(res,{
        success:true,
        statusCode:httpstatus.OK,
        message:"Users fetched successfully",
        data:users
    })
})

const updateUser = catchAsync(async (req:Request, res:Response)=>{

    const file = req.file
    const body = JSON.parse(req.body.data)
    const user = req.user

    const updatedData = await userService.updateUser(user.id,body, file)

    sendResponse(res, {
        success:true,
        statusCode:httpstatus.OK,
        message:"User updated successfully",
        data:updatedData
    })
})


const getUserDetails = catchAsync(async (req:Request, res:Response)=>{
    const {userId} = req.params

    const userDetails=  await userService.getUserDetails(userId)

    sendResponse(res, {
        success:true,
        statusCode:httpstatus.OK,
        message:"User details fetched successfully",
        data:userDetails
    })
})


const resetPassword = catchAsync(async (req:Request, res:Response)=>{
    const {email,token,password,confirmPassword} = req.body

    const updatedUser = await userService.resetPassword(email,{password,confirmPassword}, token)

    sendResponse(res, {
        success:true,
        statusCode:httpstatus.OK,
        message:"User passwoird changed successfully",
        data:updateUser
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

const forgetPassword = catchAsync(async (req:Request, res:Response)=>{
    const {email} = req.body

    await userService.forgetPassword(email)
    sendResponse(res, {
        statusCode:httpstatus.OK,
        success:true,
        message:"Otp sent successfully",
        data:{}
    }) 
})



const verifyOtp = catchAsync(async (req:Request, res:Response)=>{
    const {email, otp} = req.body

    const data = await userService.verifyOtp(email, otp)

    sendResponse(res, {
        success:true,
        statusCode:httpstatus.OK,
        message:"Otp verified successfully",
        data:data
    })
})

export const userController = {
    registerUser,
    getUsers,
    uploadAvatar,
    forgetPassword,
    verifyOtp,
    updateUser,
    getUserDetails
}