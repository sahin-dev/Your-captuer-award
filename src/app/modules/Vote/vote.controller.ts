import catchAsync from "../../../shared/catchAsync";
import { Response } from "express";
import { addOneVote, addVotes } from "./vote.service";
import sendResponse from "../../../shared/ApiResponse";

const addContestVote = catchAsync(async (req:any, res:Response)=>{

    const { photoId, photoIds} = req.body

    const {contestId} = req.params

    const user = req.user
    
    const votes = null

    if(Array.isArray(photoIds)){
        const votes = await addVotes(user.id,contestId,photoIds)

        sendResponse(res, {
            success:true,
            message:"Votes added successfully",
            statusCode:200,
            data:votes
        })

    }else{

        const vote =  await addOneVote(user.id, contestId, photoId)
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