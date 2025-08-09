import { Response } from "express";
import sendResponse from "../../../shared/ApiResponse";
import {contestService} from "./contest.service";
import { IContest } from "./contest.interface";
import catchAsync from "../../../shared/catchAsync";
import { contestData } from "./contest.type";




export const createContest = catchAsync( async (req: any, res: Response) => {
    const creatorId = req.user.id; // Assuming user ID is stored in req.user
    const banner = req.file
    const body:contestData = req.body; // Parse the JSON data from the request body
    const contest = await contestService.createContest(creatorId, body, req.file);
    
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
    const userId =req.user.identifyWinner
    const {contestId, photoId} = req.body

    const uploadedPhotoData = await contestService.uploadPhotoToContest(contestId, userId, photoId)

     sendResponse(res, {
        statusCode:200,
        success:true,
        message:"photo submit to contest successfully",
        data:uploadedPhotoData
    })
})

export const contestController = {
    uploadPhoto,
    getUploadedPhotos
}