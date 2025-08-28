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

        prizes.forEach(async (prize)=>{
            await prisma.contestPrize.create({data:{contestId:contestId, category:prize.category,keys:parseInt(prize.keys), trades:parseInt(prize.trades), charges:parseInt(prize.charges)}})
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

