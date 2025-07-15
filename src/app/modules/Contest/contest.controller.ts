import { Response } from "express";
import { fileUploader } from "../../../helpers/fileUploader";
import sendResponse from "../../../shared/ApiResponse";
import { handleCreateContest } from "./contest.service";
import { ICreateContest } from "./contest.interface";



export const createContest = async (req: any, res: Response) => {
    const creatorId = req.user.id; // Assuming user ID is stored in req.user
    const body:ICreateContest = JSON.parse(req.body.data); // Parse the JSON data from the request body

    console.log("Creating contest with body:", body);



    const contest = await handleCreateContest(creatorId, body, req.file);
    
    sendResponse(res, {
        statusCode: 201,    
        success: true,
        message: "Contest created successfully",
        data: contest,
    });
}