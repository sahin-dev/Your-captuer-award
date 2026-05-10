import { Request, Response } from "express";
import httpStatus from 'http-status'
import { PaymentService, paymentService } from "./payment.service";
import sendResponse from "../../../shared/ApiResponse";
import catchAsync from "../../../shared/catchAsync";
import ApiError from "../../../errors/ApiError";

export class PaymentController {

    private paymentService:PaymentService

    constructor (){
        this.paymentService = paymentService
    }

    /**
     * Initiate payment for product or subscription
     */
    pay = catchAsync(async (req:Request, res:Response)=>{
        const {productId, planId, mode, success_url, cancel_url} = req.body
        const {id} = req.user
        const paymentData = await this.paymentService.pay(id, productId, planId, mode, success_url, cancel_url)
        sendResponse(res, {
            success:true,
            statusCode:httpStatus.OK,
            message:"Payment initiated successfully",
            data:paymentData
        })
    })

    /**
     * Get user's payment history with pagination
     */
    getUserPayments = catchAsync(async (req:Request, res:Response)=>{
        const userId = req.user.id
        const {page = 1, limit = 10} = req.query
        const payments = await this.paymentService.getUserPayments(userId, Number(page), Number(limit))
        sendResponse(res, {
            success:true,
            statusCode:httpStatus.OK,
            message:"Payment history fetched successfully",
            data:payments
        })
    })

    /**
     * Get specific payment details
     */
    getPaymentDetails = catchAsync(async (req:Request, res:Response)=>{
        const {paymentId} = req.params
        const payment = await this.paymentService.getPaymentDetails(paymentId)
        sendResponse(res, {
            success:true,
            statusCode:httpStatus.OK,
            message:"Payment details fetched successfully",
            data:payment
        })
    })

    /**
     * Cancel a payment
     */
    cancelPayment = catchAsync(async (req:Request, res:Response)=>{
        const {paymentId} = req.params
        const payment = await this.paymentService.cancelPayment(paymentId)
        sendResponse(res, {
            success:true,
            statusCode:httpStatus.OK,
            message:"Payment cancelled successfully",
            data:payment
        })
    })

    /**
     * Refund a payment (admin only)
     */
    refundPayment = catchAsync(async (req:Request, res:Response)=>{
        const {paymentId} = req.params
        const {amount} = req.body

        if (!amount || amount <= 0) {
            throw new ApiError(httpStatus.BAD_REQUEST, "Valid refund amount is required")
        }

        const refund = await this.paymentService.refund("STRIPE", paymentId, amount)
        sendResponse(res, {
            success:true,
            statusCode:httpStatus.OK,
            message:"Refund processed successfully",
            data:refund
        })
    })

    /**
     * Capture a payment (admin only)
     */
    capturePayment = catchAsync(async (req:Request, res:Response)=>{
        const {paymentId} = req.params
        const capture = await this.paymentService.capture("STRIPE", paymentId)
        sendResponse(res, {
            success:true,
            statusCode:httpStatus.OK,
            message:"Payment captured successfully",
            data:capture
        })
    })
}


export const paymentController = new PaymentController()