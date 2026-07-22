import { Request, Response } from "express";
import catchAsync from "../../../shared/catchAsync";
import { levelService } from "./level.service";
import sendResponse from "../../../shared/ApiResponse";
import httpStatus from 'http-status'

const addLevel = catchAsync(async (req:Request, res:Response) => {

    const {order, name, requirements} = req.body

    const addedLevel = await levelService.addLevel(order, name, requirements)

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.CREATED,
        message:"level created successfully",
        data:addedLevel
    })
})

const getLevels =  catchAsync(async (req:Request, res: Response) => {
    const { page, limit } = req.query;
    const result = await levelService.getLevels(
        page ? Number(page) : undefined,
        limit ? Number(limit) : undefined
    )

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"levels fetched successfully",
        data:result.data,
        meta:result.meta
    })
})

export const levelController = {
    addLevel,
    getLevels
}