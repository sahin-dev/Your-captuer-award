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
const getContestAchievementsByUser = async (userId:string,type?:PrizeType | string, page: number = 1, limit: number = 10)=>{
    const { skip, limit: paginationLimit } = paginationHelper.calculatePagination({ page, limit });

    let prizeCategory: PrizeType | undefined = undefined;
    if (type) {
        const typeStr = type.toString().toUpperCase();
        if (typeStr === 'TOP_PHOTO' || typeStr === PrizeType.TOP_PHOTO) {
            prizeCategory = PrizeType.TOP_PHOTO;
        } else if (typeStr === 'TOP_PHOTOGRAPHER' || typeStr === PrizeType.TOP_PHOTOGRAPHER) {
            prizeCategory = PrizeType.TOP_PHOTOGRAPHER;
        }
    }

    const where: any = {
        participant: {
            userId: userId
        }
    };

    if (prizeCategory) {
        where.category = prizeCategory;
    }

    const achievements = await prisma.contestAchievement.findMany({
        where,
        skip,
        take: paginationLimit,
        include: {
            contest: {
                select: {
                    id: true,
                    title: true,
                    banner: true,
                    description: true,
                    startDate: true,
                    endDate: true
                }
            },
            photo: {
                include: {
                    photo: {
                        select: {
                            id: true,
                            url: true,
                            title: true,
                            description: true
                        }
                    },
                    _count: {
                        select: { votes: true }
                    }
                }
            },
            participant: {
                include: {
                    photos: {
                        include: {
                            photo: {
                                select: {
                                    id: true,
                                    url: true,
                                    title: true,
                                    description: true
                                }
                            }
                        }
                    }
                }
            }
        },
        orderBy: { createdAt: 'desc' }
    });

    const total = await prisma.contestAchievement.count({ where });
    const meta = paginationHelper.getPaginationMetaData(page, paginationLimit, total);

    const formattedData = achievements.map(ach => {
        const contestData = ach.contest;
        if (ach.category === PrizeType.TOP_PHOTOGRAPHER) {
            const uploadedPhotos = ach.participant?.photos.map(p => ({
                id: p.id,
                title: p.title,
                rank: p.rank,
                photoId: p.photoId,
                photoDetails: p.photo,
                createdAt: p.createdAt
            })) || [];

            return {
                id: ach.id,
                category: ach.category,
                contestId: ach.contestId,
                participantId: ach.participantId,
                createdAt: ach.createdAt,
                updatedAt: ach.updatedAt,
                contest: contestData,
                uploadedPhotos
            };
        } else {
            const photoDetails = ach.photo ? {
                id: ach.photo.id,
                title: ach.photo.title,
                rank: ach.photo.rank,
                photoId: ach.photo.photoId,
                photoDetails: ach.photo.photo,
                createdAt: ach.photo.createdAt
            } : null;

            const totalVotes = ach.photo?._count?.votes || 0;

            return {
                id: ach.id,
                category: ach.category,
                contestId: ach.contestId,
                participantId: ach.participantId,
                photoId: ach.photoId,
                createdAt: ach.createdAt,
                updatedAt: ach.updatedAt,
                contest: contestData,
                photo: photoDetails,
                totalVotes
            };
        }
    });

    return { data: formattedData, meta };
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