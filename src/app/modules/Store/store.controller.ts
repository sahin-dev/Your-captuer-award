import { Request, Response } from "express";
import catchAsync from "../../../shared/catchAsync";
import { storeService } from "./store.service";
import sendResponse from "../../../shared/ApiResponse";
import httpStatus from 'http-status'
import { ProductType } from "../../../prismaClient";


const addStoreProduct = catchAsync(async (req:Request, res:Response) => {
    const {productType,title, quantity, amount, description} = req.body
    const userId = req.user.id

    const addedProduct = await storeService.addProduct(req.body)

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

const getProductDetails = catchAsync(async (req:Request, res:Response) => {
    const { productId } = req.params
    const product = await storeService.getProductDetails(productId)

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"product details fetched successfully",
        data:product
    })
})

const updateStoreProduct = catchAsync(async (req:Request, res:Response) => {
    const { productId } = req.params
    const updateData = req.body
    


    const updatedProduct = await storeService.updateProduct(productId, updateData)

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"product updated successfully",
        data:updatedProduct
    })
})

const deleteStoreProduct = catchAsync(async (req:Request, res:Response) => {
    const { productId } = req.params
    const deletedProduct = await storeService.deleteProduct(productId)

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"product deleted successfully",
        data:deletedProduct
    })
})

export const storeController =  {
    addStoreProduct,
    getAllProducts,
    getProductDetails,
    updateStoreProduct,
    deleteStoreProduct
}