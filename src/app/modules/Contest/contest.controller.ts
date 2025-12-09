import { Request, Response } from "express";
import sendResponse from "../../../shared/ApiResponse";
import {contestService} from "./contest.service";
import { IContest } from "./contest.interface";
import catchAsync from "../../../shared/catchAsync";
import { contestData } from "./contest.type";
import { ContestStatus } from "../../../prismaClient";
import httpStatus from 'http-status'





const createContest = catchAsync( async (req: any, res: Response) => {
    const creatorId = req.user.id; // Assuming user ID is stored in req.user
    const banner = req.file
    const body:contestData = req.body; // Parse the JSON data from the request body
    const contest = await contestService.createContest(creatorId, body, banner);

    
    sendResponse(res, {
        statusCode: 201,    
        success: true,
        message: "Contest created successfully",
        data: contest,
    });
})


const getAllContests = catchAsync(async (req:any, res:Response)=>{

    const {page, limit} = req.query  as {page:string, limit:string}
    const pageNum = Number(page) || 1
    const limitNum = Number(limit) || 20

    
    const contests = await contestService.getAllContests(pageNum, limitNum)

    sendResponse(res, {
        statusCode:200,
        success:true,
        message:"All contests fetched successfully",
        data:contests
    })
})

const getContestById = catchAsync(async (req:any, res:Response)=>{
    const {contestId} = req.params
    const userId = req.user.id

    const contest = await contestService.getContestByUserId(userId, contestId)

    sendResponse(res, {
        statusCode:200,
        success:true,
        message:"Contest fetched successfully",
        data:contest
    })
})

const updateContestDetails = catchAsync(async (req:any, res:Response)=>{
    const {contestId} = req.params
    const contestData:Partial<IContest> = req.body

    const contest = await contestService.updateContest(contestId, contestData)

    sendResponse(res, {
        statusCode:200,
        success:true,
        message:"contest updated successfully",
        data:contest
    })
})

const joinContest = catchAsync(async (req:any, res:Response)=>{
    const userId = req.user.id
    const {contestId} = req.params

    const joinData = await contestService.joinContest(userId, contestId)

    sendResponse(res, {
        statusCode:200,
        success:true,
        message:"user joined a contest successfully",
        data:joinData
    })
})

const getUploadedPhotos =  catchAsync(async  (req:any, res: Response)=>{
    const {contestId} = req.params
    const user = req.user

    const uploadedPhotos = await contestService.getContestUploads(user.id,contestId)

     sendResponse(res, {
        statusCode:200,
        success:true,
        message:"photos fetched successfully",
        data:uploadedPhotos
    })
})

const getUploadedPhotosToVote =  catchAsync(async  (req:any, res: Response)=>{
    const {contestId} = req.params
    const user = req.user

    const uploadedPhotos = await contestService.getContestUploadsToVote(user.id,contestId)

     sendResponse(res, {
        statusCode:200,
        success:true,
        message:"photos fetched successfully",
        data:uploadedPhotos
    })
})



const uploadPhoto = catchAsync(async (req:any, res:Response)=>{
    const user = req.user
    const { photoIds} = req.body
    const {contestId} = req.params

    const file = req.file as Express.Multer.File

    const uploadedPhoto = await contestService.uploadPhotoToContest(contestId, user.id, photoIds, file)

     sendResponse(res, {
        statusCode:200,
        success:true,
        message:"photo submit to contest successfully",
        data:uploadedPhoto
    })
})

const deleteContest = catchAsync(async (req:any, res:Response)=>{

    const {contestId} = req.params
    await contestService.deleteContestByContestId(contestId)

    sendResponse(res, {
        statusCode:200,
        success:true,
        message:"Contest deleted successfully",
        data:null
    })
})

const getContestsByStatus = catchAsync (async (req:Request, res:Response) => {
    const {status} = req.query as {status:ContestStatus}
    const userId = req.user.id

    const contests = await contestService.getContestsByStatus(userId,status)

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:`contests fetched successfully`,
        data:contests
    })
})

const getMyActiveContests = catchAsync(async (req:Request, res:Response) => {
    const userId = req.user.id
    console.log(userId)
    const contests = await contestService.getMyActiveContests(userId)

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"user active contest fetched successfully",
        data:contests
    })
})

const deleteContestPhoto = catchAsync(async (req:Request, res:Response) => {
    const {contestId, photoId} = req.params
    const userId = req.user.id
    const result = await contestService.deleteContestUploadById(contestId, userId, photoId)

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"photo deleted successfully",
        data:result
    })
})

const promotePhoto = catchAsync(async (req:Request, res:Response) => {
    const {contestId,photoId} = req.body
    const userId = req.user.id
    const result = await contestService.promoteContestPhoto(contestId,photoId, userId)

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"photo promoted successfully",
        data:result
    })
})

const getWinners = catchAsync(async (req:Request, res:Response) => {
    const {contestId} = req.params
    const userId = req.user.id

    const winners = await contestService.getContestWinners(contestId)

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"contest winners fetched successfully",
        data:winners
    })
})


const getUserRemainingPhotos = catchAsync(async (req:Request, res:Response) => {
    const {contestId} = req.params
    const userId = req.user.id

    const remainingPhotos = await contestService.getRemainingPhotos(userId, contestId)

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"remaining photos found successfully",
        data:remainingPhotos
    })
})

const tradePhoto = catchAsync(async (req:Request, res:Response) => {

    const {contestId, contestPhotoId, newPhotoId} = req.body
    const file = req.file as Express.Multer.File
    const userId = req.user.id

    const result =  await contestService.tradePhoto(userId,contestId,contestPhotoId,newPhotoId,file)

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"trade a photo successfully",
        data:result
    })
})

const chargePhoto = catchAsync(async (req:Request, res:Response) => {
    const {contestId, contestPhotoId} = req.body
    const userId = req.user.id

    const chargedPhoto = await contestService.chargePhoto(userId,contestId,contestPhotoId)

    sendResponse(res, {
        success:true,
        statusCode:httpStatus.OK,
        message:"photo charged successfully",
        data:chargedPhoto
    })
})

const getContestPhotosSortedByVote = catchAsync(async (req:Request, res:Response)=> {

    const {contestId} = req.params
    const {page, limit} = req.query as {page:string, limit:string}
    const photos = await contestService.getContestPhotosSortedByVote(contestId, parseInt(page), parseInt(limit))

    sendResponse(res, {
        statusCode:200,
        success:true,
        message:'photos fetched successfully',
        data:photos
    })
})



const getContestPhotographers = catchAsync(async (req:Request, res:Response)=> {

    const {contestId} = req.params
    const {page =1, limit = 20} = req.query as {page:string, limit:string}
    const photos = await contestService.getContestTopPhotographers(contestId, Number(page), Number(limit))

    sendResponse(res, {
        statusCode:200,
        success:true,
        message:'photographer fetched successfully',
        data:photos
    })
})
export const contestController = {
    createContest,
    uploadPhoto,
    getUploadedPhotos,
    deleteContest,
    getContestsByStatus,
    getMyActiveContests,
    joinContest,
    updateContestDetails,
    getContestById,
    getAllContests,
    promotePhoto,
    getWinners,
    getUserRemainingPhotos,
    tradePhoto,
    chargePhoto,
    deleteContestPhoto,
    getContestPhotosSortedByVote,
    getContestPhotographers,
    getUploadedPhotosToVote

}