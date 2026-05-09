import ApiError from "../../../../errors/ApiError";
import prisma from "../../../../shared/prisma";
import { ContestPrize } from "./contestPrize.type";
import httpStatus from 'http-status'



export const addContestPrizes = async (contestId:string, prizes:ContestPrize[])=>{
    const contest = await prisma.contest.findUnique({where:{id:contestId}})
   
    try{
        if(!contest){
            throw new ApiError(httpStatus.NOT_FOUND, "contest not found")
        }

        // FIX: Use for loop instead of forEach to properly await async operations
        for (const prize of prizes) {
            await prisma.contestPrize.create({
                data:{
                    contestId:contestId, 
                    category:prize.category,
                    key:prize.key, 
                    boost:prize.boost, 
                    swap:prize.swap
                }
            })
        }

        const createdPrizes = await prisma.contestPrize.findMany({where:{contestId}})
        console.log(`Successfully created ${createdPrizes.length} prizes for contest ${contestId}`)
        return createdPrizes
    }catch(err){
        console.error(`Error creating contest prizes: ${err}`)
        throw err
    }
}

export const getContestPrizes = async (contestId:string)=>{
    const contestPrizes = await prisma.contestPrize.findMany({where:{contestId},omit:{id:true, contestId:true}})

    return contestPrizes
}

