import { Request, Response } from "express";
import catchAsync from "../../../shared/catchAsync";
import { storeService } from "./store.service";
import sendResponse from "../../../shared/ApiResponse";
import httpStatus from 'http-status'
import { ProductType } from "../../../prismaClient";


const addStoreProduct = catchAsync(async (req:Request, res:Response) => {
    const {type,title, quantity, amount} = req.body
    const userId = req.user.id

    const addedProduct = await storeService.addProduct(title,type,quantity,amount)

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.CREATED,
        message:"product created successfully",
        data:addedProduct
    })
})

const getAllProducts = catchAsync(async (req:Request, res:Response) => {

    const {type, page, limit} = req.query as {type?:ProductType, page?: string, limit?: string}
    const products = await storeService.getAllProduct(type, Number(page), Number(limit))

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"store products fetched successfully",
        data:products
   
})
})

export const storeController =  {
    addStoreProduct,
    getAllProducts
}