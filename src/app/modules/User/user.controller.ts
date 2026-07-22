import catchAsync from "../../../shared/catchAsync";
import { Request, Response } from 'express'
import { userService } from "./user.service";
import sendResponse from "../../../shared/ApiResponse";
import httpstatus from 'http-status'
import ApiError from "../../../errors/ApiError";
import httpStatus from 'http-status' 




const getUsers = catchAsync(async (req: Request, res: Response) => {
    const { page, limit, search, status, role } = req.query as { page?: string, limit?: string, search?: string, status?: string, role?: string }
    const users = await userService.getUsers({ page, limit, search, status, role })
    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "users fetched successfully",
        data: users.data,
        meta: users.meta
    })
})

const updateUserProfile = catchAsync(async (req: Request, res: Response) => {

    const body = req.body
    const user = req.user

    const updatedData = await userService.updateProfile(user.id, body)

    sendResponse(res, {
        success: true,
        statusCode: httpstatus.OK,
        message: "User updated successfully",
        data: updatedData
    })
})


const updateUser = catchAsync(async (req: Request, res: Response) => {

    const body = req.body
    const user = req.user
    const { userId } = req.params


    const updatedData = await userService.updateUser(user.id, userId, body)

    sendResponse(res, {
        success: true,
        statusCode: httpstatus.OK,
        message: "User updated successfully",
        data: updatedData
    })
})
const updateAvatar = catchAsync(async (req: Request, res: Response) => {
    const file = req.file
})

const getUserDetails = catchAsync(async (req: Request, res: Response) => {
    const { userId } = req.params

    const userDetails = await userService.getUserDetails(userId)

    sendResponse(res, {
        success: true,
        statusCode: httpstatus.OK,
        message: "User details fetched successfully",
        data: userDetails
    })
})


const resetPassword = catchAsync(async (req: Request, res: Response) => {
    const { email, token, password, confirmPassword } = req.body

    const updatedUser = await userService.resetPassword(email, { password, confirmPassword }, token)

    sendResponse(res, {
        success: true,
        statusCode: httpstatus.OK,
        message: "User password changed successfully",
        data: updatedUser
    })
})



const uploadAvatar = catchAsync(async (req: Request, res: Response) => {
    const userId = req.user.id

    if (!req.file) {
        throw new ApiError(httpstatus.NOT_FOUND, "file is required")
    }

    const uploadedFilePath = await userService.updateProfilePhoto(userId, req.file)

    sendResponse(res, {
        success: true,
        statusCode: httpstatus.OK,
        message: "Avatar uploaded successfully",
        data: uploadedFilePath
    })
})


const uploadCover = catchAsync(async (req: Request, res: Response) => {
    const userId = req.user.id

    if (!req.file) {
        throw new ApiError(httpstatus.NOT_FOUND, "file is required")
    }

    const uploadedFilePath = await userService.updateCoverPhoto(userId, req.file)

    sendResponse(res, {
        success: true,
        statusCode: httpstatus.OK,
        message: "Cover Photo uploaded successfully",
        data: uploadedFilePath
    })
})

const forgetPassword = catchAsync(async (req: Request, res: Response) => {
    const { email } = req.body

    const data = await userService.forgetPassword(email)
    sendResponse(res, {
        statusCode: httpstatus.OK,
        success: true,
        message: "Otp sent successfully",
        data
    })
})

const verifyOtp = catchAsync(async (req: Request, res: Response) => {
    const { email, code } = req.body

    const data = await userService.verifyOtp(email, code)

    sendResponse(res, {
        success: true,
        statusCode: httpstatus.OK,
        message: "Otp verified successfully",
        data: data
    })
})

const changePassword = catchAsync(async (req: any, res: Response) => {
    const userId = req.user.id
    const { oldPassword, newPassword } = req.body

    const result = await userService.changePassword(userId, oldPassword, newPassword)

    sendResponse(res, {
        success: true,
        statusCode: httpstatus.OK,
        message: "Password changed successfully",
        data: null
    })

})

const getUserProgress = catchAsync(async (req: Request, res: Response) => {
    const userId = req.user.id

    const userProgress = await userService.getUserCurrentLevel(userId)
    console.log(userProgress)

    sendResponse(res, {
        success: true,
        statusCode: httpstatus.OK,
        message: "user progress fetched successfully",
        data: userProgress
    })
})

const searchUser = catchAsync(async (req: Request, res: Response) => {
    const { query, page, limit } = req.query as { query: string; page?: string; limit?: string }

    let pageNum = page ? Number(page) : undefined
    let limitNum = limit ? Number(limit) : undefined

    if (typeof pageNum === 'number' && isNaN(pageNum)) pageNum = undefined
    if (typeof limitNum === 'number' && isNaN(limitNum)) limitNum = undefined

    const currentUserId = req.user?.id
    const result = await userService.searchUserByUserName(query, pageNum, limitNum, currentUserId)
    sendResponse(res, {
        success: true,
        statusCode: httpstatus.OK,
        message: "users fetched successfully",
        data: result
    })
})

const getUserPhotoAchievements = catchAsync(async (req: Request, res: Response) => {
    const { photoId } = req.params
    const achievememnts = await userService.getPhototAchievements(photoId)

    sendResponse(res, {
        success: true,
        statusCode: httpstatus.OK,
        message: "photo achievements fetched successfully",
        data: achievememnts
    })
})

const deleteAccount = catchAsync(async (req: Request, res: Response) => {
    const userId = req.user.id
    const { password } = req.body

    const result = await userService.deleteAccount(userId, password)
    sendResponse(res, {
        success: true,
        statusCode: httpstatus.OK,
        message: "Account deleted successfully",
        data: result
    })
})


export const userController = {

    getUsers,
    uploadAvatar,
    forgetPassword,
    verifyOtp,
    updateUser,
    updateUserProfile,
    getUserDetails,
    resetPassword,
    uploadCover,
    changePassword,
    getUserProgress,
    searchUser,
    getUserPhotoAchievements,
    deleteAccount
}