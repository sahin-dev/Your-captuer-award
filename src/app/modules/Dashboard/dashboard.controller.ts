import { Request, Response } from "express"
import sendResponse from "../../../shared/ApiResponse"
import catchAsync from "../../../shared/catchAsync"
import { dashboardService } from "./dashboard.service"
import httpStatus from 'http-status'
import { SubscriptionPlanStatus } from "src/prismaClient"


const getAllAPymentHistory = catchAsync(async (req: Request, res: Response) => {
    const { page, limit, search, status, method, planName } = req.query as { page?: string, limit?: string, search?: string, status?: string, method?: string, planName?: string }
    const result = await dashboardService.getAllPaymentsHistory({ page, limit, search, status, method, planName })

    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "payments fetched successfully",
        data: result.data,
        meta: result.meta
    })
})

const getProPreminumIncomeByYear = catchAsync(async (req: Request, res: Response) => {
    const { year } = req.params
    const incomeData = await dashboardService.getProPreminumIncomeByYear(year)

    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "income data fetched successfully",
        data: incomeData
    })
})

const calcIncomeDataByYear = catchAsync(async (req: Request, res: Response) => {
    const { year } = req.params
    const incomeData = await dashboardService.calcIncomeDataByYear(year)
    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "income data fetched successfully",
        data: incomeData
    })
})

const getContestStats = catchAsync(async (req: Request, res: Response) => {

    const stats = await dashboardService.getContestStats()
    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "contest stats fetched successfully",
        data: stats
    })
})

const getMemberRatio = catchAsync(async (req: Request, res: Response) => {
    const { year } = req.params
    const ratio = await dashboardService.calcMemberRatio(year)
    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "member ratio fetched successfully",
        data: ratio
    })
})


const getDashboardOverview = catchAsync(async (req: Request, res: Response) => {
    const overview = await dashboardService.getDashboardOverview()
    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "dashboard overview fetched successfully",
        data: overview
    })
})


const getAdminNotifications = catchAsync(async (req: Request, res: Response) => {
    const notifications = await dashboardService.getAdminNotifications()
    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "admin notifications fetched successfully",
        data: notifications
    })
})

const getUserStats = catchAsync(async (req: Request, res: Response) => {
    const stats = await dashboardService.getUserStats()
    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "user stats fetched successfully",
        data: stats
    })
})

const getAllUsers = catchAsync(async (req: Request, res: Response) => {
    const { page, limit, search, status, role } = req.query as { page?: string, limit?: string, search?: string, status?: string, role?: string }
    const users = await dashboardService.getAllUsers({ page, limit, search, status, role })
    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "users fetched successfully",
        data: users.data,
        meta: users.meta
    })
})

const toggleBlockStatus = catchAsync(async (req: Request, res: Response) => {
    const { userId } = req.body
    const user = await dashboardService.toggleBlockStatus(userId)
    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "user block status toggled successfully",
        data: user
    })
})

const getStoreStats = catchAsync(async (req: Request, res: Response) => {
    const stats = await dashboardService.getStoreStats()
    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "store stats fetched successfully",
        data: stats
    })
})

const getPlans = catchAsync(async (req: Request, res: Response) => {
    const { status, search } = req.query as { status?: string, search?: string }
    const plans = await dashboardService.getPlans(status as SubscriptionPlanStatus, search)
    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "plans fetched successfully",
        data: plans
    })
})

const getPlansStats = catchAsync(async (req: Request, res: Response) => {
    const stats = await dashboardService.getPlansStats()
    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "plans stats fetched successfully",
        data: stats
    })
})

const getTransactions = catchAsync(async (req: Request, res: Response) => {
    const { page, limit, search, status, method, planName } = req.query as { page?: string, limit?: string, search?: string, status?: string, method?: string, planName?: string }
    const transactions = await dashboardService.getTransactions({ page, limit, search, status, method, planName })
    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "transactions fetched successfully",
        data: transactions.data,
        meta: transactions.meta
    })
})

const getTransactionStats = catchAsync(async (req: Request, res: Response) => {
    const stats = await dashboardService.getTransactionStats()
    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "transaction stats fetched successfully",
        data: stats
    })
})

const getSubscriptionStats = catchAsync(async (req: Request, res: Response) => {
    const stats = await dashboardService.getSubscriptionStats()
    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "subscription stats fetched successfully",
        data: stats
    })
})

// ===================== Subscription Plan CRUD =====================

const createSubscriptionPlan = catchAsync(async (req: Request, res: Response) => {
    console.log(req.body)
    const result = await dashboardService.createSubscriptionPlan(req.body)
    sendResponse(res, {
        success: true,
        statusCode: httpStatus.CREATED,
        message: "Subscription plan created successfully",
        data: result
    })
})

const getAllSubscriptionPlans = catchAsync(async (req: Request, res: Response) => {
    const { page, limit, search, status } = req.query as { page?: string, limit?: string, search?: string, status?: string }
    const result = await dashboardService.getAllSubscriptionPlans({ page, limit, search, status })
    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "Subscription plans fetched successfully",
        data: result.data,
        meta: result.meta
    })
})

const getSubscriptionPlanById = catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params
    const result = await dashboardService.getSubscriptionPlanById(id)
    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "Subscription plan fetched successfully",
        data: result
    })
})

const updateSubscriptionPlan = catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params
    const result = await dashboardService.updateSubscriptionPlan(id, req.body)
    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "Subscription plan updated successfully",
        data: result
    })
})

const deleteSubscriptionPlan = catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params
    const result = await dashboardService.deleteSubscriptionPlan(id)
    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "Subscription plan deleted successfully",
        data: result
    })
})

export const dashboardController = {
    getAllAPymentHistory,
    getProPreminumIncomeByYear,
    calcIncomeDataByYear,
    getContestStats,
    getMemberRatio,
    getDashboardOverview,
    getAdminNotifications,
    getUserStats,
    getAllUsers,
    toggleBlockStatus,
    getStoreStats,
    getPlans,
    getPlansStats,
    getTransactions,
    getTransactionStats,
    getSubscriptionStats,
    createSubscriptionPlan,
    getAllSubscriptionPlans,
    getSubscriptionPlanById,
    updateSubscriptionPlan,
    deleteSubscriptionPlan,
}