import ApiError from "../../../../errors/ApiError";
import prisma from "../../../../shared/prisma";
import { ContestPrize } from "./contestPrize.type";
import httpStatus from 'http-status'
import { prizeService } from "../../Prize/prize.service";



export const addContestPrizes = async (contestId:string, prizes:ContestPrize[])=>{
    const contest = await prisma.contest.findUnique({where:{id:contestId}})
   
    try{
        

        if(!contest){
            throw new ApiError(httpStatus.NOT_FOUND, "contest not found")
        }

        await Promise.all(prizes.map((prize)=>
            prisma.contestPrize.create({data:{contestId:contestId, category:prize.category,key:prize.key, boost:prize.boost, swap:prize.swap, coin:prize.coin || 0}})
        ))

        return await prisma.contestPrize.findMany({where:{contestId}, })
    }catch(err){
        throw err
    }
   
    
}

export const getContestPrizes = async (contestId:string)=>{
    const contestAwards = await prizeService.getContestAwards(contestId)

    if(contestAwards.length > 0){
        return contestAwards
    }

    const contestPrizes = await prisma.contestPrize.findMany({where:{contestId},omit:{id:true, contestId:true}})

    return contestPrizes
}

