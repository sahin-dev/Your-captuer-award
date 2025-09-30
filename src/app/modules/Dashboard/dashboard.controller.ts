import { Request, Response } from "express"
import sendResponse from "../../../shared/ApiResponse"
import catchAsync from "../../../shared/catchAsync"
import { dashboardService } from "./dashboard.service"
import httpStatus from 'http-status'


const getAllAPymentHistory = catchAsync(async (req:Request, res:Response) => {
    const {page, limit} = req.query as {page:string, limit:string}
    const payments = await dashboardService.getAllPaymentsHistory({page, limit})

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"payments fetched successfully",
        data:payments
    })
})

const getProPreminumIncomeByYear = catchAsync(async (req:Request, res:Response) => {
    const {year} = req.params
    const incomeData = await dashboardService.getProPreminumIncomeByYear(year)  

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"income data fetched successfully",
        data:incomeData
})
})

const calcIncomeDataByYear = catchAsync(async (req:Request, res:Response) => {
    const {year} = req.params
    const incomeData = await dashboardService.calcIncomeDataByYear(year)    
    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"income data fetched successfully",
        data:incomeData
})
})

const getContestStats = catchAsync(async (req:Request, res:Response) => {

    const stats = await dashboardService.getContestStats()    
    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"contest stats fetched successfully",
        data:stats
})
})  

const getMemberRatio = catchAsync(async (req:Request, res:Response) => {
    const {year} = req.params
    const ratio = await dashboardService.calcMemberRatio(year)
    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"member ratio fetched successfully",
        data:ratio
})
})


const getDashboardOverview = catchAsync(async (req:Request, res:Response) => {
    const overview = await dashboardService.getDashboardOverview()    
    sendResponse(res, { 
        success:true,
        statusCode:httpStatus.OK,
        message:"dashboard overview fetched successfully",
        data:overview
})
})


const getAdminNotifications = catchAsync(async (req:Request, res:Response) => {
    const notifications = await dashboardService.getAdminNotifications()    
    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"admin notifications fetched successfully",
        data:notifications
})
})

const getUserStats = catchAsync(async (req:Request, res:Response) => {
    const stats = await dashboardService.getUserStats()    
    sendResponse(res, { 
        success:true,
        statusCode:httpStatus.OK,
        message:"user stats fetched successfully",
        data:stats
})
})

const getAllUsers = catchAsync(async (req:Request, res:Response) => {
    const {page, limit} = req.query as {page:string, limit:string}
    const users = await dashboardService.getAllUsers({page, limit})
    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,   
        message:"users fetched successfully",
        data:users
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
    getAllUsers
    
}