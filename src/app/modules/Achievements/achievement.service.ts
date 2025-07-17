import { AchievementsType } from "@prisma/client";
import prisma from "../../../shared/prisma";


export const addAchievement = async (userId:string,contestId:string, type:AchievementsType, awardedId:string)=>{
    let achievement;

    if (type === AchievementsType.TOP_PHOTOGRAPHER){
        achievement = await prisma.contestAchievement.create({data:{participantId:awardedId,contestId,type}})
        return achievement
    }

     achievement = await prisma.contestAchievement.create({data:{photoId:awardedId, contestId, type}})

     return achievement

}


const getTotalAchievements = async (userId:string)=>{

}

export const getAchievements = async (contestId:string)=>{
    const achievements = await prisma.contestAchievement.findMany({where:{contestId}})

    return achievements
}

const getAchievementCount = async (userId:string)=>{
    let count = await prisma.contestAchievement.count({where:{OR:[{participantId:userId}, {photo:{participantId:userId}}]}})

    return count
}