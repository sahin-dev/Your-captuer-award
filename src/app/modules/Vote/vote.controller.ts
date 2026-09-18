import catchAsync from "../../../shared/catchAsync";
import { Response } from "express";
import { addOneVote, addVotes, voteService } from "./vote.service";
import sendResponse from "../../../shared/ApiResponse";

const addContestVote = catchAsync(async (req:any, res:Response)=>{

    const { contestPhotoId, contestPhotoIds } = req.body

    const {contestId} = req.params

    const user = req.user
    
    if(Array.isArray(contestPhotoIds)){
        const votes = await addVotes(user.id, contestId, contestPhotoIds)

        sendResponse(res, {
            success:true,
            message:"Votes added successfully",
            statusCode:200,
            data:votes
        })

    }else{

        const vote = await addOneVote(user.id, contestId, contestPhotoId)
        sendResponse(res, {
            success:true,
            message:"Vote added successfully",
            statusCode:200,
            data:vote
        })
    }
})

const getVoteCounts = catchAsync(async (req:any, res:Response)=>{
    const { contestPhotoIds } = req.body

    const counts = await voteService.getVoteCountsByPhotoIds(contestPhotoIds)

    sendResponse(res, {
        success:true,
        message:"Vote counts fetched successfully",
        statusCode:200,
        data:counts
    })
})

export const voteController = {
    addContestVote,
    getVoteCounts
}
