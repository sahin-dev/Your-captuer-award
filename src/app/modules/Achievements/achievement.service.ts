import ApiError from "../../../errors/ApiError";
import { AchievementKind, AwardTarget, AwardType, ContestLevelBadge, PrizeType } from "../../../prismaClient";
import prisma from "../../../shared/prisma";
import httpStatus from 'http-status'
import {
    getContestLevelBadge,
    getContestLevelOrder,
    isContestLevelPrizeType,
} from "../Awards/award.definitions";

type AchievementMetadata = {
    kind?: AchievementKind;
    type?: AwardType | null;
    target?: AwardTarget | null;
    rankLimit?: number | null;
    levelBadge?: ContestLevelBadge | null;
    levelOrder?: number | null;
}

type AchievementRecord = {
    category: PrizeType;
    kind?: AchievementKind | null;
    levelOrder?: number | null;
    participantId?: string | null;
    contestId: string;
}

const getLevelOrderFromAchievement = (achievement: AchievementRecord) => {
    return achievement.levelOrder || getContestLevelOrder(achievement.category) || 0
}

const collapseLevelAchievements = <T extends AchievementRecord>(achievements:T[]) => {
    const levelByParticipantContest = new Map<string, T>()
    const results:T[] = []

    achievements.forEach(achievement => {
        const isLevelAchievement = achievement.kind === AchievementKind.CONTEST_LEVEL || isContestLevelPrizeType(achievement.category)

        if(!isLevelAchievement){
            results.push(achievement)
            return
        }

        const key = `${achievement.participantId || "NONE"}:${achievement.contestId}`
        const saved = levelByParticipantContest.get(key)

        if(!saved || getLevelOrderFromAchievement(achievement) > getLevelOrderFromAchievement(saved)){
            levelByParticipantContest.set(key, achievement)
        }
    })

    return [...results, ...levelByParticipantContest.values()]
}

const paginateAchievements = <T>(records:T[], page = 1, limit = 20) => {
    const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 20
    const start = (safePage - 1) * safeLimit

    return {
        data:records.slice(start, start + safeLimit),
        meta:{page:safePage, limit:safeLimit, total:records.length}
    }
}


//Add achievements to the user
const addAchievement = async (userId:string,contestId:string, category:PrizeType, photoId:string)=>{

    const participant = await prisma.contestParticipant.findUnique({where:{contestId_userId:{contestId,userId}}})
    if(!participant){
        throw new ApiError(httpStatus.NOT_FOUND, "user does not exist in this contest")
    }
     const achievement = await addContestAchievement(participant.id, contestId, category, photoId)

     return achievement
}

const addContestAchievement = async (
    participantId:string,
    contestId:string,
    category:PrizeType,
    photoId?:string | null,
    metadata:AchievementMetadata = {}
) => {
    const existingAchievement = await prisma.contestAchievement.findFirst({
        where:{
            participantId,
            contestId,
            category,
            photoId:photoId || null,
            ...(metadata.kind && {kind:metadata.kind}),
            ...(metadata.target && {target:metadata.target}),
            ...(metadata.rankLimit !== undefined && {rankLimit:metadata.rankLimit})
        }
    })

    if(existingAchievement){
        return existingAchievement
    }

    return prisma.contestAchievement.create({
        data:{
            participantId,
            contestId,
            category,
            kind:metadata.kind || AchievementKind.CONTEST_AWARD,
            type:metadata.type || null,
            target:metadata.target || null,
            rankLimit:metadata.rankLimit ?? null,
            levelBadge:metadata.levelBadge || null,
            levelOrder:metadata.levelOrder ?? null,
            ...(photoId && {photoId})
        }
    })
}

const upsertContestLevelAchievement = async (participantId:string, contestId:string, category:PrizeType) => {
    const levelBadge = getContestLevelBadge(category)
    const levelOrder = getContestLevelOrder(category)

    if(!levelBadge || !levelOrder){
        throw new ApiError(httpStatus.BAD_REQUEST, "Invalid contest level achievement")
    }

    const existingLevelAchievements = await prisma.contestAchievement.findMany({
        where:{
            participantId,
            contestId,
            OR:[
                {kind:AchievementKind.CONTEST_LEVEL},
                {category:{in:[PrizeType.AMATEUR, PrizeType.TALENTED, PrizeType.SUPREME, PrizeType.SUPERIOR, PrizeType.TOP_NOTCH]}}
            ]
        }
    })

    const highestExistingOrder = Math.max(
        0,
        ...existingLevelAchievements.map(achievement => achievement.levelOrder || getContestLevelOrder(achievement.category) || 0)
    )

    if(highestExistingOrder >= levelOrder){
        return existingLevelAchievements.find(achievement => {
            const order = achievement.levelOrder || getContestLevelOrder(achievement.category)
            return order === highestExistingOrder
        })
    }

    return prisma.$transaction(async tx => {
        await tx.contestAchievement.deleteMany({
            where:{
                participantId,
                contestId,
                OR:[
                    {kind:AchievementKind.CONTEST_LEVEL},
                    {category:{in:[PrizeType.AMATEUR, PrizeType.TALENTED, PrizeType.SUPREME, PrizeType.SUPERIOR, PrizeType.TOP_NOTCH]}}
                ]
            }
        })

        return tx.contestAchievement.create({
            data:{
                participantId,
                contestId,
                category,
                kind:AchievementKind.CONTEST_LEVEL,
                levelBadge,
                levelOrder,
            }
        })
    })
}

//get the contest achievements for a specific user
const getContestAchievementsByUser = async (userId:string,type?:PrizeType, page = 1, limit = 20)=>{
    
    const participantCount = await prisma.contestParticipant.count({where:{userId}})
    if (participantCount <= 0){
        throw new ApiError(httpStatus.NOT_FOUND, "participant not found")
    }
    const achievements = await prisma.contestAchievement.findMany({
        where:{participant:{userId}, ...(type && {category:type})},
        include:{contest:{select:{id:true, title:true, banner:true}}},
        orderBy:{createdAt:"desc"}
    })
    return paginateAchievements(collapseLevelAchievements(achievements), page, limit)
}


//get all the achievements for a specific photo
const getPhotoAchievements = async (photoId:string)=>{

    if(!photoId){
        throw new ApiError(httpStatus.BAD_REQUEST, "photo id is not valid")
    }
    const achievements = await prisma.contestAchievement.findMany({where:{photoId}})

    return collapseLevelAchievements(achievements)
}


const getContestAchievements = async (contestId:string)=>{
    const achievememnts = await prisma.contestAchievement.findMany({where:{contestId}})

    return collapseLevelAchievements(achievememnts)
}


const getAchievements = async (contestId:string, page = 1, limit = 20)=>{
    const achievements = await prisma.contestAchievement.findMany({
        where:{contestId},
        include:{photo:{select:{photo:{select:{id:true, url:true}}}}, participant:{select:{user:true}}},
        orderBy:{createdAt:"desc"}
    })

    return paginateAchievements(collapseLevelAchievements(achievements), page, limit)
}

const getAchievementCount = async (userId:string)=>{

    let top_photo_award_count = await prisma.contestAchievement.count({where:{participant:{userId},category:PrizeType.TOP_PHOTO}})
    let top_photographer_count = await prisma.contestAchievement.count({where:{participant:{userId},category:PrizeType.TOP_PHOTOGRAPHER}})

    return {top_photo:top_photo_award_count,top_photographer:top_photographer_count}
}

const getContestByAchievementsType = async (userId:string,type:PrizeType, page = 1, limit = 20)=>{
    const participantCount = await prisma.contestParticipant.count({where:{userId}})
    if(participantCount <= 0){
        throw new ApiError(httpStatus.NOT_FOUND, "participant not found")
    }
    const achievements = await prisma.contestAchievement.findMany({
        where:{participant:{userId}, category:type},
        include:{contest:{select:{banner:true, title:true}}},
        orderBy:{createdAt:"desc"}
    })

    return paginateAchievements(collapseLevelAchievements(achievements), page, limit)
}

const getUserPhotoAchievements = async (userId:string, photoId:string) => {

    const achievements = await prisma.contestAchievement.findMany({where:{photo:{photoId}, participant:{userId}}})

    return collapseLevelAchievements(achievements)
}

const getAllPhotosAchievements = async (page = 1, limit = 20) => {
    const achievements = await prisma.contestAchievement.findMany({
        where:{photoId:{not:null}},
        include:{
            contest:{select:{id:true, title:true, banner:true}},
            photo:{select:{id:true, photo:{select:{id:true, url:true, title:true}}}},
            participant:{select:{user:{select:{id:true, fullName:true, avatar:true}}}}
        },
        orderBy:{createdAt:"desc"}
    })

    return paginateAchievements(collapseLevelAchievements(achievements), page, limit)
}

const getMyAchievementsByContest = async (userId:string, contestId:string) => {
    const achievements = await prisma.contestAchievement.findMany({
        where:{contestId, participant:{userId}},
        include:{photo:{select:{photo:{select:{id:true, url:true}}}}, participant:{select:{user:true}}},
        orderBy:{createdAt:"desc"}
    })

    return collapseLevelAchievements(achievements)
    
}

// const getContestAchievements

export const achievementService = {
    addAchievement,
    addContestAchievement,
    upsertContestLevelAchievement,
    getContestAchievementsByUser,
    getContestAchievements,
    getAchievements,
    getAchievementCount,
    getPhotoAchievements,
    getContestByAchievementsType,
    getUserPhotoAchievements,
    getAllPhotosAchievements,
    getMyAchievementsByContest
}
