import { Response } from "express";
import sendResponse from "../../../shared/ApiResponse";
import {contestService} from "./contest.service";
import { IContest } from "./contest.interface";
import catchAsync from "../../../shared/catchAsync";
import { contestData } from "./contest.type";
import { profileService } from "../Profile/profile.service";




export const createContest = catchAsync( async (req: any, res: Response) => {
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

export const getContests = catchAsync(async (req:any, res:Response)=>{
    const contests = await contestService.getAllContests()

    sendResponse(res, {
        statusCode:200,
        success:true,
        message:"All contests fetched successfully",
        data:contests
    })
})

export const getContestById = catchAsync(async (req:any, res:Response)=>{
    const {contestId} = req.params
    const contest = await contestService.getContestById(contestId)

    sendResponse(res, {
        statusCode:200,
        success:true,
        message:"Contest fetched successfully",
        data:contest
    })
})

export const updateContestDetails = catchAsync(async (req:any, res:Response)=>{
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

export const joinContest = catchAsync(async (req:any, res:Response)=>{
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

    const uploadedPhotos = await contestService.getContestUploads(contestId)

     sendResponse(res, {
        statusCode:200,
        success:true,
        message:"photos fetched successfully",
        data:uploadedPhotos
    })
})



const uploadPhoto = catchAsync(async (req:any, res:Response)=>{
    const user = req.user
    const {contestId, photoId} = req.body

    const file = req.file as Express.Multer.File

    const uploadedPhoto = await contestService.uploadPhotoToContest(contestId, user.id, photoId, file)

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

export const contestController = {
    uploadPhoto,
    getUploadedPhotos,
    deleteContest
}