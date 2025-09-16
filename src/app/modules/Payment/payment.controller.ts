import { Request, Response } from "express";
import httpStatus from 'http-status'
import { PaymentService, paymentSrevice } from "./payment.service";
import sendResponse from "../../../shared/ApiResponse";
import catchAsync from "../../../shared/catchAsync";

export class PaymentController {

    private paymentService:PaymentService

    constructor (){
        this.paymentService = paymentSrevice
    }

     pay = catchAsync(async (req:Request, res:Response)=>{
        const {amount, currency, mehtod, productId,} = req.body
        const {id} = req.user
        const paymentData = await this.paymentService.pay(id,'STRIPE', amount,currency,mehtod, productId)
        sendResponse(res, {
            success:true,
            statusCode:httpStatus.OK,
            message:"Payment created successfully",
            data:paymentData
        })
    })
}


export const paymentController = new PaymentController()