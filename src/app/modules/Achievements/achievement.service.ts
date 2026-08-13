import ApiError from "../../../errors/ApiError";
import { AchievementKind, AwardTarget, AwardType, PrizeType } from "../../../prismaClient";
import prisma from "../../../shared/prisma";
import httpStatus from 'http-status'
import {
    ContestLevelBadgeValue,
    getContestLevelBadge,
    getContestLevelOrder,
    isContestLevelPrizeType,
    prizeTypes,
} from "../Awards/award.definitions";

type ProfileAchievementGroupKey = "ultimate" | "ranking";

type ProfileAchievementBadgeDefinition = {
    id: PrizeType;
    category: PrizeType;
    title: string;
    imageUrl: string;
    group: ProfileAchievementGroupKey;
    order: number;
}

type ProfileAchievementRecord = Awaited<ReturnType<typeof findProfileAchievementRecords>>[number];

const achievementBadgeImages: Record<PrizeType, string> = {
    [prizeTypes.TOP_PHOTO]: "/icons/top-photo.png",
    [prizeTypes.TOP_PHOTOGRAPHER]: "/icons/top-photographer.png",
    [prizeTypes.AMATEUR]: "/icons/award.png",
    [prizeTypes.TALENTED]: "/icons/award.png",
    [prizeTypes.SUPREME]: "/icons/award.png",
    [prizeTypes.SUPERIOR]: "/icons/award.png",
    [prizeTypes.TOP_100_PHOTO]: "/icons/top-photo.png",
    [prizeTypes.TOP_100_PHOTOGRAPHER]: "/icons/top-photographer.png",
    [prizeTypes.TOP_50_PHOTO]: "/icons/top-photo.png",
    [prizeTypes.TOP_50_PHOTOGRAPHER]: "/icons/top-photographer.png",
    [prizeTypes.TOP_20_PHOTO]: "/icons/top-photo.png",
    [prizeTypes.TOP_20_PHOTOGRAPHER]: "/icons/top-photographer.png",
    [prizeTypes.TOP_10_PHOTO]: "/icons/top-photo.png",
    [prizeTypes.TOP_10_PHOTOGRAPHER]: "/icons/top-photographer.png",
    [prizeTypes.WINNER]: "/icons/award.png",
    [prizeTypes.TOP_NOTCH]: "/icons/award.png",
};

const profileAchievementCatalog: ProfileAchievementBadgeDefinition[] = [
    { id: prizeTypes.TOP_PHOTO, category: prizeTypes.TOP_PHOTO, title: "Top Photo", imageUrl: achievementBadgeImages.TOP_PHOTO, group: "ultimate", order: 10 },
    { id: prizeTypes.TOP_PHOTOGRAPHER, category: prizeTypes.TOP_PHOTOGRAPHER, title: "Top Photographer", imageUrl: achievementBadgeImages.TOP_PHOTOGRAPHER, group: "ultimate", order: 20 },
    // { id: prizeTypes.WINNER, category: prizeTypes.WINNER, title: "Winner", imageUrl: achievementBadgeImages.WINNER, group: "ultimate", order: 30 },
    { id: prizeTypes.TOP_10_PHOTO, category: prizeTypes.TOP_10_PHOTO, title: "Top 10 Photos", imageUrl: achievementBadgeImages.TOP_10_PHOTO, group: "ranking", order: 50 },
    { id: prizeTypes.TOP_10_PHOTOGRAPHER, category: prizeTypes.TOP_10_PHOTOGRAPHER, title: "Top 10 Photographers", imageUrl: achievementBadgeImages.TOP_10_PHOTOGRAPHER, group: "ranking", order: 60 },
    { id: prizeTypes.TOP_20_PHOTO, category: prizeTypes.TOP_20_PHOTO, title: "Top 20 Photos", imageUrl: achievementBadgeImages.TOP_20_PHOTO, group: "ranking", order: 70 },
    { id: prizeTypes.TOP_20_PHOTOGRAPHER, category: prizeTypes.TOP_20_PHOTOGRAPHER, title: "Top 20 Photographers", imageUrl: achievementBadgeImages.TOP_20_PHOTOGRAPHER, group: "ranking", order: 80 },
    { id: prizeTypes.TOP_50_PHOTO, category: prizeTypes.TOP_50_PHOTO, title: "Top 50 Photos", imageUrl: achievementBadgeImages.TOP_50_PHOTO, group: "ranking", order: 90 },
    { id: prizeTypes.TOP_50_PHOTOGRAPHER, category: prizeTypes.TOP_50_PHOTOGRAPHER, title: "Top 50 Photographers", imageUrl: achievementBadgeImages.TOP_50_PHOTOGRAPHER, group: "ranking", order: 100 },
    { id: prizeTypes.TOP_100_PHOTO, category: prizeTypes.TOP_100_PHOTO, title: "Top 100 Photos", imageUrl: achievementBadgeImages.TOP_100_PHOTO, group: "ranking", order: 110 },
    { id: prizeTypes.TOP_100_PHOTOGRAPHER, category: prizeTypes.TOP_100_PHOTOGRAPHER, title: "Top 100 Photographers", imageUrl: achievementBadgeImages.TOP_100_PHOTOGRAPHER, group: "ranking", order: 120 },
];

type AchievementMetadata = {
    kind?: AchievementKind;
    type?: AwardType | null;
    target?: AwardTarget | null;
    rankLimit?: number | null;
    levelBadge?: ContestLevelBadgeValue | null;
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

const profileAchievementCategories = profileAchievementCatalog.map(item => item.category)

const profileAchievementGroupLabels: Record<ProfileAchievementGroupKey, string> = {
    ultimate: "Ultimate Achievement",
    ranking: "Top Ranking",
}

const formatAchievementDate = (date:Date) => {
    return date.toLocaleDateString("en-US", {month:"short", year:"numeric"})
}

const findProfileAchievementRecords = async (userId:string) => {
    return prisma.contestAchievement.findMany({
        where:{participant:{userId}, category:{in:profileAchievementCategories}},
        include:{
            contest:{select:{id:true, title:true, banner:true}},
            photo:{select:{id:true, photo:{select:{id:true, url:true, title:true}}}},
        },
        orderBy:{createdAt:"desc"}
    })
}

const mapAchievementCard = (achievement:ProfileAchievementRecord, title:string) => {
    const userPhoto = achievement.photo?.photo

    return {
        id:achievement.id,
        title,
        subtitle:achievement.contest?.title || userPhoto?.title || null,
        imageUrl:userPhoto?.url || achievement.contest?.banner || "",
        date:formatAchievementDate(achievement.createdAt),
        earnedAt:achievement.createdAt,
        photoId:userPhoto?.id || null,
        contestPhotoId:achievement.photo?.id || null,
        contestId:achievement.contestId,
        category:achievement.category,
        kind:achievement.kind,
        target:achievement.target,
        rankLimit:achievement.rankLimit,
    }
}

const getProfileAchievements = async (userId:string) => {
    const user = await prisma.user.findUnique({where:{id:userId}, select:{id:true}})

    if(!user){
        throw new ApiError(httpStatus.NOT_FOUND, "user not found")
    }

    const earnedAchievements = await findProfileAchievementRecords(userId)
    const collapsedAchievements = collapseLevelAchievements(earnedAchievements)
    const achievementsByCategory = new Map<PrizeType, typeof collapsedAchievements>()

    collapsedAchievements.forEach(achievement => {
        const list = achievementsByCategory.get(achievement.category) || []
        list.push(achievement)
        achievementsByCategory.set(achievement.category, list)
    })

    const groups = (["ultimate", "ranking"] as ProfileAchievementGroupKey[]).map(groupKey => ({
        key:groupKey,
        label:profileAchievementGroupLabels[groupKey],
        badges:profileAchievementCatalog
            .filter(item => item.group === groupKey)
            .sort((a,b) => a.order - b.order)
            .map(item => {
                const cards = (achievementsByCategory.get(item.category) || []).map(achievement => mapAchievementCard(achievement, item.title))

                return {
                    id:item.id,
                    category:item.category,
                    title:item.title,
                    imageUrl:item.imageUrl,
                    count:cards.length,
                    cards,
                }
            })
    }))

    return {
        totalAchievements:collapsedAchievements.length,
        groups,
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
                {category:{in:[prizeTypes.AMATEUR, prizeTypes.TALENTED, prizeTypes.SUPREME, prizeTypes.SUPERIOR, prizeTypes.TOP_NOTCH]}}
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
                    {category:{in:[prizeTypes.AMATEUR, prizeTypes.TALENTED, prizeTypes.SUPREME, prizeTypes.SUPERIOR, prizeTypes.TOP_NOTCH]}}
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
        include:{photo:{select:{photo:{select:{id:true, url:true}}}}, participant:{select:{user:{select:{id:true, fullName:true, avatar:true}}}}},
        orderBy:{createdAt:"desc"}
    })

    return paginateAchievements(collapseLevelAchievements(achievements), page, limit)
}

const getAchievementCount = async (userId:string)=>{

    const achievements = await findProfileAchievementRecords(userId)
    const collapsedAchievements = collapseLevelAchievements(achievements)

    return {
        total:collapsedAchievements.length,
        top_photo:collapsedAchievements.filter(achievement => achievement.category === PrizeType.TOP_PHOTO).length,
        top_photographer:collapsedAchievements.filter(achievement => achievement.category === PrizeType.TOP_PHOTOGRAPHER).length,
    }
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
        include:{photo:{select:{photo:{select:{id:true, url:true}}}}, participant:{select:{user:{select:{id:true, fullName:true, avatar:true}}}}},
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
    getProfileAchievements,
    getPhotoAchievements,
    getContestByAchievementsType,
    getUserPhotoAchievements,
    getAllPhotosAchievements,
    getMyAchievementsByContest
}
