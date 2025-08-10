import catchAsync from "../../../shared/catchAsync";
import { Response } from "express";
import { addOneVote, addVotes } from "./vote.service";
import sendResponse from "../../../shared/ApiResponse";

const addContestVote = catchAsync(async (req:any, res:Response)=>{
    const { photoData} = req.body
    const {contestId} = req.params
    const user = req.user
    const votes = null

    if(Array.isArray(photoData)){
        const votes = await addVotes(user.id,contestId,photoData)
        sendResponse(res, {
            success:true,
            message:"Votes added successfully",
            statusCode:200,
            data:votes
        })
    }else{

        const vote =  await addOneVote(user.id, contestId, photoData)
        sendResponse(res, {
            success:true,
            message:"Vote added successfully",
            statusCode:200,
            data:vote
        })
    }
})

export const voteController = {
    addContestVote
}