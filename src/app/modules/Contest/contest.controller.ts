import { Response } from "express";
import sendResponse from "../../../shared/ApiResponse";
import { handleCreateContest, handleGetAllContests, handleGetContestById, handleJoinContest, handleUpdateContest } from "./contest.service";
import { IContest } from "./contest.interface";
import catchAsync from "../../../shared/catchAsync";




export const createContest = catchAsync( async (req: any, res: Response) => {
    const creatorId = req.user.id; // Assuming user ID is stored in req.user

    const body:IContest = req.body; // Parse the JSON data from the request body
    
    console.log("Creating contest with body:", body);
   


    const contest = await handleCreateContest(creatorId, body, req.file);
    
    sendResponse(res, {
        statusCode: 201,    
        success: true,
        message: "Contest created successfully",
        data: contest,
    });
})

export const getContests = catchAsync(async (req:any, res:Response)=>{
    const contests = await handleGetAllContests()

    sendResponse(res, {
        statusCode:200,
        success:true,
        message:"All contests fetched successfully",
        data:contests
    })
})

export const getContestById = catchAsync(async (req:any, res:Response)=>{
    const {contestId} = req.params
    const contest = await handleGetContestById(contestId)

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

    const contest = await handleUpdateContest(contestId, contestData)

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

    const joinData = await handleJoinContest(userId, contestId)

    sendResponse(res, {
        statusCode:200,
        success:true,
        message:"user joined a contest successfully",
        data:joinData
    })
})