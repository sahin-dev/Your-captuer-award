import ApiError from "../../../../errors/ApiError";
import { ContestRule } from "./contestRules.type";
import prisma from "../../../../shared/prisma";
import httpStatus from 'http-status'


const addContestRules = async (contestId:string,rules:ContestRule[])=>{  
    const contest = prisma.contest.findUnique({where:{id:contestId}})

    if(!contest){
        throw new ApiError(httpStatus.NOT_FOUND, "Contest not found")
    }

    
    await prisma.contestRule.createMany({data: rules.map (r => ({...r, contestId}))})
    const createdRules = await prisma.contestRule.findMany({
        where: { contestId },
        orderBy: { createdAt: 'desc' }, 
    });
        

    return createdRules
}

const getContestRules = async (contestId:string)=>{
    const contestRules = await prisma.contestRule.findMany({where:{contestId}, omit:{id:true,contestId:true, createdAt:true,updatedAt:true}})

    return contestRules
}

export const contestRuleService = {
    addContestRules,
    getContestRules
}