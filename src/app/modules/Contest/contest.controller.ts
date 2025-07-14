import { Response } from "express";
import { fileUploader } from "../../../helpers/fileUploader";
import sendResponse from "../../../shared/ApiResponse";
import { handleCreateContest } from "./contest.service";



export const createContest = async (req: any, res: Response) => {
    const creatorId = req.user.id; // Assuming user ID is stored in req.user
    const body = req.body.data;



    const contest = await handleCreateContest(creatorId, body, req.file);
    
    sendResponse(res, {
        statusCode: 201,    
        success: true,
        message: "Contest created successfully",
        data: contest,
    });
}