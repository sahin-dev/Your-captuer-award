import ApiError from "../../../errors/ApiError";
import { PrizeType } from "../../../prismaClient";
import prisma from "../../../shared/prisma";
import httpStatus from 'http-status'


//Add achievements to the user
const addAchievement = async (userId:string,contestId:string, category:PrizeType, photoId:string)=>{

    const participant = await prisma.contestParticipant.findUnique({where:{contestId_userId:{contestId,userId}}})
    if(!participant){
        throw new ApiError(httpStatus.NOT_FOUND, "user does not exist in this contest")
    }
     const achievement = await prisma.contestAchievement.create({data:{photoId:photoId, contestId, category}})

     return achievement
}

//get the contest achievements for a specific user
const getContestAchievementsByUser = async (userId:string, contestId:string)=>{
    const achievements = await prisma.contestAchievement.findMany({where:{contestId, participant:{userId}}, include:{contest:true}})
    return achievements
}


const getContestAchievements = async (contestId:string)=>{
    const achievememnts = await prisma.contestAchievement.findMany({where:{contestId}})

    return achievememnts
}


const getAchievements = async (contestId:string)=>{
    const achievements = await prisma.contestAchievement.findMany({where:{contestId}})

    return achievements
}

const getAchievementCount = async (userId:string)=>{
    let top_photo_award_count = await prisma.contestAchievement.count({where:{participant:{userId},category:PrizeType.TOP_PHOTO}})
    let top_photographer_count = await prisma.contestAchievement.count({where:{participant:{userId},category:PrizeType.TOP_PHOTOGRAPHER}})

    return {top_photo:top_photo_award_count,top_photographer:top_photographer_count}
}

export const achievementService = {
    addAchievement,
    getContestAchievementsByUser,
    getContestAchievements,
    getAchievements,
    getAchievementCount
}