import { Request, Response } from "express";
import catchAsync from "../../../shared/catchAsync";
import { subscriptionService } from "./subscription.service";
import sendResponse from "../../../shared/ApiResponse";
import httpStatus from 'http-status'
import ApiError from "../../../errors/ApiError";

/**
 * Get all available subscription plans
 */
const getAvailablePlans = catchAsync(async (req:Request, res:Response) => {
    const { page, limit } = req.query;
    const result = await subscriptionService.getAvailablePlans(
        page ? Number(page) : undefined,
        limit ? Number(limit) : undefined
    )

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"Plans fetched successfully",
        data:result.data,
        meta:result.meta
    })
})

/**
 * Get specific subscription plan by ID
 */
const getPlan = catchAsync(async (req:Request, res:Response) => {
    const {planId} = req.params
    const plan = await subscriptionService.getPlan(planId)

    if (!plan) {
        throw new ApiError(httpStatus.NOT_FOUND, "Subscription plan not found")
    }

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"Plan fetched successfully",
        data:plan
    })
})

/**
 * Get user's active subscription
 */
const getUserActiveSubscription = catchAsync(async (req:Request, res:Response) => {
    const userId = req.user.id
    const subscription = await subscriptionService.getUserActiveSubscription(userId)

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"Active subscription fetched successfully",
        data:subscription
    })
})

/**
 * Get all user subscriptions
 */
const getUserSubscriptions = catchAsync(async (req:Request, res:Response) => {
    const userId = req.user.id
    const { page, limit } = req.query;
    const result = await subscriptionService.getUserSubscriptions(
        userId,
        page ? Number(page) : undefined,
        limit ? Number(limit) : undefined
    )

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"User subscriptions fetched successfully",
        data:result.data,
        meta:result.meta
    })
})

/**
 * Get user subscription status
 */
const getUserSubscriptionStatus = catchAsync(async (req:Request, res:Response) => {
    const userId = req.user.id
    const status = await subscriptionService.getUserSubscriptionStatus(userId)

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"Subscription status fetched successfully",
        data:status
    })
})

/**
 * Cancel user subscription
 */
const cancelSubscription = catchAsync(async (req:Request, res:Response) => {
    const {subscriptionId} = req.params
    const {reason} = req.body
    const subscription = await subscriptionService.cancelSubscription(subscriptionId, reason)

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"Subscription cancelled successfully",
        data:subscription
    })
})

/**
 * Renew user subscription
 */
const renewSubscription = catchAsync(async (req:Request, res:Response) => {
    const {subscriptionId} = req.params
    const {planId} = req.body

    if (!planId) {
        throw new ApiError(httpStatus.BAD_REQUEST, "Plan ID is required")
    }

    const subscription = await subscriptionService.renewSubscription(subscriptionId, planId)

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"Subscription renewed successfully",
        data:subscription
    })
})

/**
 * Check if subscription is valid
 */
const isSubscriptionValid = catchAsync(async (req:Request, res:Response) => {
    const userId = req.user.id
    const isValid = await subscriptionService.isSubscriptionValid(userId)

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"Subscription validity checked",
        data:{isValid}
    })
})

export const subscriptionController = {
    getAvailablePlans,
    getPlan,
    getUserActiveSubscription,
    getUserSubscriptions,
    getUserSubscriptionStatus,
    cancelSubscription,
    renewSubscription,
    isSubscriptionValid
}