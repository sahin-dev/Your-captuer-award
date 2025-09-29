import catchAsync from "../../../../shared/catchAsync";
import { Request, Response } from "express";
import { getContestPrizes } from "./contestPrize.service";
import sendResponse from "../../../../shared/ApiResponse";
import httpStatus from 'http-status'


const getContestPrize = catchAsync(async (req:Request, res:Response) => {
    const {contestId} = req.params

    const prizes = await getContestPrizes(contestId)

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"contest prizes fetched successfully",
        data:prizes
    })
})

export const contestPrizeController = {
    getContestPrize
}