import ApiError from "../../../../errors/ApiError";
import { ContestRule } from "./conetstRules.type";
import prisma from "../../../../shared/prisma";
import httpStatus from 'http-status'


const addContestRules = async (contestId:string,rules:ContestRule[])=>{  
    const contest = prisma.contest.findUnique({where:{id:contestId}})

    if(!contest){
        throw new ApiError(httpStatus.NOT_FOUND, "Contest not found")
    }

    
    await prisma.contestRule.createMany({data: rules.map (r => ({...r, contestId}))})
    

    return "Contest rules added"
}

const getContestRules = async (contestId:string)=>{
    const contestRules = await prisma.contestRule.findMany({where:{contestId}, omit:{id:true, createdAt:true,updatedAt:true}})

    return contestRules
}

export const contestRuleService = {
    addContestRules,
    getContestRules
}