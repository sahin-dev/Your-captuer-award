import ApiError from "../../../errors/ApiError";
import { PrizeType } from "../../../prismaClient";
import prisma from "../../../shared/prisma";
import httpStatus from 'http-status'
import { paginationHelper } from "../../../helpers/paginationHelper";


//Add achievements to the user
const addAchievement = async (userId:string,contestId:string, category:PrizeType, photoId:string)=>{

    const participant = await prisma.contestParticipant.findUnique({where:{contestId_userId:{contestId,userId}}})
    if(!participant){
        throw new ApiError(httpStatus.NOT_FOUND, "user does not exist in this contest")
    }
    
    // FIX: Include participantId when creating achievement record
    const achievement = await prisma.contestAchievement.create({
        data:{
            photoId: photoId || null,
            participantId: participant.id,
            contestId, 
            category
        }
    })

    console.log(`Achievement created for user ${userId}: ${category} in contest ${contestId}`)
    return achievement
}

//get the contest achievements for a specific user
const getContestAchievementsByUser = async (userId:string,type?:PrizeType, page: number = 1, limit: number = 10)=>{
    
    const contestParticipant =  await prisma.contestParticipant.findFirst({where:{userId}})
    
    if (!contestParticipant){
        throw new ApiError(httpStatus.NOT_FOUND, "participant not found")
    }

    const { skip, limit: paginationLimit } = paginationHelper.calculatePagination({ page, limit });

    if(type){
        const achievements = await prisma.contestAchievement.findMany({
            where:{participantId:contestParticipant.id, category:type}, 
            skip,
            take: paginationLimit,
            include:{contest:{select:{id:true,title:true, banner:true}}},
            orderBy: { createdAt: 'desc' }
        });
        
        const total = await prisma.contestAchievement.count({where:{participantId:contestParticipant.id, category:type}});
        const meta = paginationHelper.getPaginationMetaData(page, paginationLimit, total);
        
        return { data: achievements, meta };
    }

    const achievements = await prisma.contestAchievement.findMany({
        where:{participantId:contestParticipant.id}, 
        skip,
        take: paginationLimit,
        include:{contest:{select:{id:true, title:true, banner:true}}},
        orderBy: { createdAt: 'desc' }
    });
    
    const total = await prisma.contestAchievement.count({where:{participantId:contestParticipant.id}});
    const meta = paginationHelper.getPaginationMetaData(page, paginationLimit, total);
    
    return { data: achievements };
}


//get all the achievements for a specific photo
const getPhotoAchievements = async (photoId:string)=>{

    if(!photoId){
        throw new ApiError(httpStatus.BAD_REQUEST, "photo id is not valid")
    }
    const achievements = await prisma.contestAchievement.findMany({where:{photoId}})

    return achievements
}


const getContestAchievements = async (contestId:string)=>{
    const achievememnts = await prisma.contestAchievement.findMany({where:{contestId}})

    return achievememnts
}


const getAchievements = async (contestId:string, page: number = 1, limit: number = 10)=>{
    const { skip, limit: paginationLimit } = paginationHelper.calculatePagination({ page, limit });

    const achievements = await prisma.contestAchievement.findMany({
        where:{contestId}, 
        skip,
        take: paginationLimit,
        include:{photo:{select:{photo:{select:{id:true, url:true}}}}, 
        participant:{select:{user:{omit:{password:true, accessToken:true}}, photos:{select:{photo:{select:{id:true, url:true}}}}}}},
        orderBy: { createdAt: 'desc' }
    })

    const total = await prisma.contestAchievement.count({where:{contestId}});
    const meta = paginationHelper.getPaginationMetaData(page, paginationLimit, total);

    return { data: achievements };
}

const getAchievementCount = async (userId:string)=>{

    let top_photo_award_count = await prisma.contestAchievement.count({where:{participant:{userId},category:PrizeType.TOP_PHOTO}})
    let top_photographer_count = await prisma.contestAchievement.count({where:{participant:{userId},category:PrizeType.TOP_PHOTOGRAPHER}})

    return {top_photo:top_photo_award_count,top_photographer:top_photographer_count}
}

const getContestByAchievementsType = async (userId:string,type:PrizeType, page: number = 1, limit: number = 10)=>{
    const contestParticipant = await prisma.contestParticipant.findFirst({where:{userId}})
    if(!contestParticipant){
        throw new ApiError(httpStatus.NOT_FOUND, "participant not found")
    }

    const { skip, limit: paginationLimit } = paginationHelper.calculatePagination({ page, limit });

    const achievements = await prisma.contestAchievement.findMany({
        where:{participantId:contestParticipant.id,category:type}, 
        skip,
        take: paginationLimit,
        include:{contest:{select:{banner:true, title:true}}},
        orderBy: { createdAt: 'desc' }
    })

    const total = await prisma.contestAchievement.count({where:{participantId:contestParticipant.id,category:type}});
    const meta = paginationHelper.getPaginationMetaData(page, paginationLimit, total);

    return { data: achievements, meta };
}

const getUserPhotoAchievements = async (userId:string, photoId:string) => {

    const achievements = await prisma.contestAchievement.findMany({where:{photo:{photoId}, participantId:userId}})

    return achievements
}

const getMyAchievementsByContest = async (userId:string, contestId:string) => {
    const participant = await prisma.contestParticipant.findUnique({
        where: { contestId_userId: { contestId, userId } }
    })

    if (!participant) {
        return []
    }

    const achievements = await prisma.contestAchievement.findMany({
        where: { contestId, participantId: participant.id },
        include: {
            photo: { select: { photo: { select: { id: true, url: true } } } },
            participant: { select: { user: {
                omit: { password: true, accessToken: true }
            } } }
        },
        orderBy: { createdAt: 'desc' }
    })

    return achievements
}

const getAllPhotosAchievements = async (page: number = 1, limit: number = 10) => {
    const { skip, limit: paginationLimit } = paginationHelper.calculatePagination({ page, limit });

    const achievements = await prisma.contestAchievement.findMany({
        where:{category:PrizeType.TOP_PHOTO},
        skip,
        take: paginationLimit,
        include: {
            photo: { select: { id:true, photo: { select: { id: true, url: true, likes:true, views:true } } } },
            participant: { select: { user: {
                omit: { password: true, accessToken: true }
            } } }
        },
        orderBy: { createdAt: 'desc' }
    });
    
    const mappedAchievements = await Promise.all(achievements.map(async (achievement) => {
        if (achievement.photo) {
            const photo = achievement.photo;

            const voteCount = await prisma.vote.count({ where: { photoId: photo.photo.id } });
            return {
                ...achievement,
                voteCount
            };
        }
        return achievement;
    }));

    const total = await prisma.contestAchievement.count({where:{category:PrizeType.TOP_PHOTO}});
    const meta = paginationHelper.getPaginationMetaData(page, paginationLimit, total);
   

    return { data: mappedAchievements, meta };
}

// const getContestAchievements

export const achievementService = {
    addAchievement,
    getContestAchievementsByUser,
    getContestAchievements,
    getAchievements,
    getAchievementCount,
    getPhotoAchievements,
    getContestByAchievementsType,
    getUserPhotoAchievements,
    getMyAchievementsByContest,
    getAllPhotosAchievements
}