import ApiError from "../../../../errors/ApiError";
import prisma from "../../../../shared/prisma";
import { ContestPrize } from "./contestPrize.type";
import httpStatus from 'http-status'
import { prizeService } from "../../Prize/prize.service";
import { getAwardSlotKey, normalizeAwardIdentity } from "../../Awards/award.definitions";



export const addContestPrizes = async (contestId:string, prizes:ContestPrize[])=>{
    const contest = await prisma.contest.findUnique({where:{id:contestId}})
   
    try{
        

        if(!contest){
            throw new ApiError(httpStatus.NOT_FOUND, "contest not found")
        }

        const seenAwards = new Set<string>()
        const normalizedPrizes = prizes.map((prize) => {
            const identity = normalizeAwardIdentity(prize)
            const key = getAwardSlotKey(identity)

            if(seenAwards.has(key)){
                throw new ApiError(httpStatus.BAD_REQUEST, "Only one award threshold can be selected per award type and target")
            }

            seenAwards.add(key)
            return {...prize, ...identity}
        })

        await prisma.contestPrize.createMany({
            data:normalizedPrizes.map((prize) => ({
                contestId,
                category:prize.category,
                type:prize.type,
                target:prize.target,
                rankLimit:prize.rankLimit,
                key:prize.key,
                boost:prize.boost,
                swap:prize.swap,
                coin:prize.coin || 0
            }))
        })

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

