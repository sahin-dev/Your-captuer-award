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
        message:"Contest rules fetched successfully",
        data:rules
    })
})

const getContestRuleDefinitions = catchAsync(async (req:Request, res:Response) => {
    const definitions = contestRuleService.getContestRuleDefinitions()

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"Contest rule definitions fetched successfully",
        data:definitions
    })
})

export const contestRuleController = {
    getContestRules,
    getContestRuleDefinitions
}
