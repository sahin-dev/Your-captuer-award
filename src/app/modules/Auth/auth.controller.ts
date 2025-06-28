import catchAsync from "../../../shared/catchAsync";
import {Request, Response} from 'express'
import { getAutheticatedUser, handleSignIn, handleSignout } from "./auth.service";
import sendResponse from "../../../shared/ApiResponse";
import httpstatus from 'http-status'


export const SignIn = catchAsync(async (req:Request,res:Response)=>{
    const body = req.body

    const data = await handleSignIn(body)

      res.cookie("token", data.token, {
      httpOnly: true,
      secure: true,
      maxAge: 365 * 24 * 60 * 60 * 1000,
    });

    sendResponse(res, {
        success:true,
        statusCode:httpstatus.OK,
        message:'User sign in successfully',
        data
    })

})

export const SignOut = catchAsync (async (req:Request, res:Response)=>{
    const user = req.user

    await handleSignout(user.id)

    res.cookie("token",null, {expires:new Date()})

    sendResponse (res, {
        success:true,
        statusCode:httpstatus.OK,
        message:"User sign out successfully",
        data:{}
    })
})

export const getAuthenticatedUser = catchAsync(async (req:Request, res:Response)=>{
    const user = req.user

    const authenticateduser = await getAutheticatedUser(user.id)

    sendResponse(res, {
        success:true,
        statusCode:httpstatus.OK,
        message:"Authenticated user fetched successfully",
        data:authenticateduser
    })
})