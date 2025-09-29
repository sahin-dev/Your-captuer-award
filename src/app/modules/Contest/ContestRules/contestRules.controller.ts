import catchAsync from "../../../../shared/catchAsync";
import httpStatus from 'http-status'
import { Request, Response } from "express";
import { contestRuleService } from "./contestRules.service";
import sendResponse from "../../../../shared/ApiResponse";


const getContestRules = catchAsync(async (req:Request, res:Response) => {
    const {contestId} = req.params

    const rules = await contestRuleService.getContestRules(contestId)
    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"Contest dules fetched successfully",
        data:rules
    })
})

export const contestRuleController = {
    getContestRules
}