import catchAsync from "../../../../shared/catchAsync";
import { Response } from "express";
import { userStoreService } from "./userStore.service";
import sendResponse from "../../../../shared/ApiResponse";

const getStoreData = catchAsync(async (req:any, res: Response)=>{
    const user = req.user
    const storeData = await userStoreService.getStoreData(user.id)

    sendResponse(res, {
        success:true,
        statusCode:200, 
        message:"store data found",
        data:storeData
    })
})

export const userStoreController = {
    getStoreData
}