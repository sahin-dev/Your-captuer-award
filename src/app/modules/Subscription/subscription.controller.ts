import { Request, Response } from "express";
import catchAsync from "../../../shared/catchAsync";
import { subscriptionService } from "./subscription.service";
import sendResponse from "../../../shared/ApiResponse";
import httpStatus from 'http-status'

const getAvailablePlans = catchAsync(async (req:Request, res:Response) => {
    const plans = await subscriptionService.getAvailablePlans()

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"plans fetched successfully",
        data:plans
    })
})

export const subscriptionController = {
    getAvailablePlans
}