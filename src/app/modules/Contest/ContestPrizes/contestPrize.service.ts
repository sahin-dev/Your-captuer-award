import ApiError from "../../../../errors/ApiError";
import prisma from "../../../../shared/prisma";
import { ContestPrizeData } from "./contestPrize.type";
import httpStatus from 'http-status'


export const addContestPrizes = async (contestId:string, prizes:string)=>{
    const contest = await prisma.contest.findUnique({where:{id:contestId}})
    try{
         const parsedPrizes:ContestPrizeData[] = JSON.parse(prizes)

        if(!contest){
            throw new ApiError(httpStatus.NOT_FOUND, "contest not found")
        }

        parsedPrizes.forEach(async (prize)=>{
            await prisma.contestPrize.create({data:{contestId:contestId, category:prize.category,keys:prize.keys, trades:prize.trades, charges:prize.charges}})
        })

        return "Contest prizes added successfully"
    }catch(err){
        throw err
    }
   
    
}

export const getContestPrizes = async (contestId:string)=>{
    const contestPrizes = await prisma.contestPrize.findMany({where:{contestId}})

    return contestPrizes
}

