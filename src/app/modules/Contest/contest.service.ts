import prisma from '../../../shared/prisma';
import ApiError from '../../../errors/ApiError';
import httpstatus from 'http-status';
import { fileUploader } from '../../../helpers/fileUploader';
import { AchievementKind, ContestParticipant, ContestPhoto, ContestStatus, Prisma, PrizeType, RecurringType, YCLevel } from '../../../prismaClient';
import { IContest } from './contest.interface';
import { contestData } from './contest.type';
import { contestRuleService } from './ContestRules/contestRules.service';
import { ContestRuleConfigInput } from './ContestRules/contestRules.type';
import { profileService } from '../Profile/profile.service';
import agenda from '../Agenda';
import { validateContestDate } from '../../../helpers/validateDate';
import { userStoreService } from '../User/UserStore/userStore.service';
import { voteService } from '../Vote/vote.service';
import { achievementService } from '../Achievements/achievement.service';
import { prizeService } from '../Prize/prize.service';
import { contestRuleEngine } from './ContestRules/contestRule.engine';
import { contestFinalizationService } from './ContestFinalization/contestFinalization.service';
import { contestRankingService } from './ContestRanking/contestRanking.service';
import { supportedContestImageMimeTypes } from './ContestRules/contestRule.definitions';

const completedContestStatuses:ContestStatus[] = [ContestStatus.COMPLETED, ContestStatus.CLOSED]
const isCompletedContest = (status:ContestStatus) => completedContestStatuses.includes(status)

const resolveContestCategoryId = async (categoryId?:string, category?:string) => {
    if(!categoryId && !category){
        return undefined
    }

    const slug = category?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    const contestCategory = await prisma.contestCategory.findFirst({
        where:{
            isActive:true,
            OR:[
                ...(categoryId ? [{id:categoryId}] : []),
                ...(category ? [{name:{equals:category, mode:"insensitive" as const}}, {slug}] : [])
            ]
        }
    })

    if(!contestCategory){
        throw new ApiError(httpstatus.BAD_REQUEST, "Contest category is invalid or inactive")
    }

    return contestCategory.id
}

const shouldUseDefaultAwards = (body:contestData) =>
    body.awardPrizeIds === undefined && body.awards === undefined

const chargeContestEntryFee = async (
    tx:Prisma.TransactionClient,
    contest:{id:string; entryFeeCoins:number},
    userId:string
) => {
    if(contest.entryFeeCoins <= 0){
        return
    }

    const existingCharge = await tx.contestEntryFeeTransaction.findUnique({
        where:{contestId_userId:{contestId:contest.id, userId}}
    })
    if(existingCharge){
        return
    }

    const charged = await tx.userStore.updateMany({
        where:{userId, coin:{gte:contest.entryFeeCoins}},
        data:{coin:{decrement:contest.entryFeeCoins}}
    })
    if(charged.count !== 1){
        throw new ApiError(httpstatus.PAYMENT_REQUIRED, "Insufficient coins to enter this contest")
    }

    await tx.contestEntryFeeTransaction.create({
        data:{contestId:contest.id, userId, amount:contest.entryFeeCoins}
    })
}

const getContestCreateOptions = async () => {
    const [categories, prizes] = await Promise.all([
        prisma.contestCategory.findMany({
            where:{isActive:true},
            orderBy:[{order:"asc"}, {name:"asc"}]
        }),
        prizeService.getPrizes()
    ])

    return {
        categories,
        rules:contestRuleService.getContestRuleDefinitions(),
        prizes,
        supportedImageMimeTypes:supportedContestImageMimeTypes
    }
}




//This approach is not final yet. Currently in testing phase
/*

const createContestBuilderApproach = async (creatorId:string, body:contestData, banner:Express.Multer.File)=> {

    let contestBuilder: SimpleContestBuilder | RecurringContestBuilder | null = null

    if(body.recurring){
        contestBuilder  = ContestBuilderFactory.create("recurring", creatorId) as RecurringContestBuilder
        
        contestBuilder.recurrence(body.recurringType || RecurringType.DAILY)
    }else{
        contestBuilder = ContestBuilderFactory.create("normal", creatorId) as SimpleContestBuilder
    }

    let bannerUrl = banner? (await fileUploader.uploadToDigitalOcean(banner)).Location: null

     contestBuilder
        .title(body.title)
        .description(body.description)
        .banner(bannerUrl)
        .dates(body.startDate, body.endDate)


    if (body.isMoneyContest) {


        if(!body.minPrize || !body.maxPrize || (body.minPrize > body.maxPrize)){
            throw new ApiError(httpstatus.BAD_REQUEST, "Contest prize data is invalid")
        }  
        //Add contest prize data in builder
        contestBuilder.moneyContest(body.minPrize, body.maxPrize)
    }
    if(body.recurring){
        // return await prisma.recurringContest.create({data:contestBuilder.build() as RecurringContest})
    }

    return await prisma.contest.create({data:contestBuilder.build()})

}

*/

//Create a new contest
const createContest = async (creatorId: string, body: contestData, banner:Express.Multer.File) => {
    if(!validateContestDate(body.startDate, body.endDate)){
        throw new ApiError(httpstatus.BAD_REQUEST, "Contest dates are invalid; start must be in the future and end must be after start");
    }

    //If contest is recurring , save recurring data separately
    if(body.recurring){
       return createRecurringContest(creatorId, body, banner)
    }

    const [bannerUrl, categoryId] = await Promise.all([
        banner ? fileUploader.uploadToDigitalOcean(banner).then(upload => upload.Location) : Promise.resolve(null),
        resolveContestCategoryId(body.categoryId, body.category)
    ])

    const normalizedRules = contestRuleService.normalizeContestRules(body.rules)
    const awardRows = await prizeService.resolveAwardRows(
        body.awardPrizeIds || [],
        body.awards || [],
        shouldUseDefaultAwards(body)
    )

    const contestData:any = {
        creatorId,
        title: body.title,
        description: body.description,
        status: ContestStatus.UPCOMING,
        categoryId,
        isMoneyContest:body.isMoneyContest,
        currency:body.isMoneyContest ? body.currency : null,
        minPrize:body.isMoneyContest ? body.minPrize : 0,
        maxPrize:body.isMoneyContest ? body.maxPrize : 0,
        entryFeeCoins:body.coinRequirement === false ? 0 : (body.entryFeeCoins || 0),
        ...(bannerUrl && {banner:bannerUrl})
    }
    // If contest is money contest, add money contest data like max prize and min prize for the paerticipants
    // If isMoneyContest is not provided, it will default to false

    contestData.startDate = new Date(body.startDate)
    contestData.endDate = new Date(body.endDate)

    return prisma.$transaction(async tx => {
        const contest = await tx.contest.create({data:contestData})
        await tx.contestRuleConfig.createMany({
            data:normalizedRules.map(rule => ({
                contestId:contest.id,
                key:rule.key,
                value:rule.value,
                enabled:rule.enabled ?? true,
                order:rule.order ?? 0
            }))
        })

        await tx.contestAward.createMany({
            data:awardRows.map(award => ({contestId:contest.id, ...award}))
        })

        return {...contest, rules:normalizedRules, awards:awardRows, prizes:awardRows.filter(award => award.enabled)}
    })
};


//manage recurring contest separately

const createRecurringContest  =  async (creatorId: string, body: contestData, banner:Express.Multer.File)=>{
    if(!body.recurring){
        throw new Error("Contest is not a recurring contest!")
    }

    const isDateValid = validateContestDate(body.startDate, body.endDate);

    if(!isDateValid){
        throw new ApiError(httpstatus.BAD_REQUEST, "Contest dates are invalid; start must be in the future and end must be after start");
    }
    

    const startDate = new Date(body.startDate)
    const endDate = new Date(body.endDate)

    const normalizedRules = contestRuleService.normalizeContestRules(body.rules)
    const awardRows = await prizeService.resolveAwardRows(
        body.awardPrizeIds || [],
        body.awards || [],
        shouldUseDefaultAwards(body)
    )
    const categoryId = await resolveContestCategoryId(body.categoryId, body.category)

    const contestData:any = {
        creatorId,
        title: body.title,
        description: body.description,
        startDate,
        endDate,
        categoryId,
        isMoneyContest:body.isMoneyContest,
        currency:body.isMoneyContest ? body.currency : null,
        minPrize:body.isMoneyContest ? body.minPrize : 0,
        maxPrize:body.isMoneyContest ? body.maxPrize : 0,
        entryFeeCoins:body.coinRequirement === false ? 0 : (body.entryFeeCoins || 0)

    }

    contestData.rules = normalizedRules
    let bannerUrl:string
    if (banner){
        bannerUrl = (await fileUploader.uploadToDigitalOcean(banner)).Location;
        contestData.banner = bannerUrl
    }

    contestData.recurring ={set: {
        recurringType:body.recurrence?.type || RecurringType.DAILY,
        previousOccurrence:null,
        nextOccurrence:startDate,
        duration:new Date(body.endDate).getTime() - new Date(body.startDate).getTime(),
        timezone:body.recurrence?.timezone || "UTC",
        endsAt:body.recurrence?.endsAt ? new Date(body.recurrence.endsAt) : null,
        maxOccurrences:body.recurrence?.maxOccurrences || null,
        generatedOccurrences:0
    }
    }

    return prisma.$transaction(async tx => {
        const recurringContest = await tx.recurringContest.create({data:contestData})
        await tx.recurringContestAward.createMany({
            data:awardRows.map(award => ({recurringContestId:recurringContest.id, ...award}))
        })
        return {...recurringContest, awards:awardRows}
    })
}


const updateContest = async (contestId:string, contestData:Partial<IContest>)=>{
    const contest = await prisma.contest.findUnique({where:{id:contestId}})
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }

    const lockedStatuses:ContestStatus[] = [
        ContestStatus.ACTIVE,
        ContestStatus.FINALIZING,
        ContestStatus.COMPLETED,
        ContestStatus.CLOSED
    ]
    if(lockedStatuses.includes(contest.status)){
        throw new ApiError(httpstatus.BAD_REQUEST, "Editing contest not allowed")
    }

    if(contest?.status === ContestStatus.UPCOMING || contest?.status === ContestStatus.NEW){
        const startDate = contestData.startDate ? new Date(contestData.startDate) : contest.startDate
        const endDate = contestData.endDate ? new Date(contestData.endDate) : contest.endDate
        if(!validateContestDate(startDate.toISOString(), endDate.toISOString())){
            throw new ApiError(
                httpstatus.BAD_REQUEST,
                "Contest dates are invalid; start must be in the future and end must be after start"
            )
        }

        const isMoneyContest = contestData.isMoneyContest ?? contest.isMoneyContest
        const minPrize = contestData.minPrize ?? contest.minPrize ?? 0
        const maxPrize = contestData.maxPrize ?? contest.maxPrize ?? 0
        const currency = contestData.currency === undefined ? contest.currency : contestData.currency
        if(isMoneyContest && (!currency || minPrize > maxPrize)){
            throw new ApiError(httpstatus.BAD_REQUEST, "Money contests require valid currency and prize bounds")
        }

        if(contestData.categoryId){
            await resolveContestCategoryId(contestData.categoryId)
        }

        const updatedContest = await prisma.contest.update({
            where:{id:contestId},
            data:{
                ...contestData,
                startDate,
                endDate,
                isMoneyContest,
                currency:isMoneyContest ? currency : null,
                minPrize:isMoneyContest ? minPrize : 0,
                maxPrize:isMoneyContest ? maxPrize : 0,
            }
        })

        return updatedContest
    }

}


//delete a contest by the contest id
const deleteContestByContestId =async (contestId:string)=>{
    const contest = await prisma.contest.findUnique({where:{id:contestId}})
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found!")
    }

    await prisma.contest.delete({where:{id:contestId}})
    return "contest deleted!"
}  


// add a user to the contest participant list

const joinContest = async (userId:string,contestId:string, acceptedRuleKeys?:unknown)=>{
    const contest = await prisma.contest.findUnique({where:{id:contestId}})

    if (!contest || contest.status != ContestStatus.ACTIVE){
        throw new ApiError(httpstatus.NOT_FOUND, "Contest is not available to participate")
    }

    const existingParticipant = await prisma.contestParticipant.findUnique({where:{contestId_userId:{contestId,userId}}})

    if(existingParticipant){
        return {contest_id:contestId, participant_id:existingParticipant.id}
    }

    await contestRuleEngine.validateJoinRules(contestId, userId, acceptedRuleKeys)

    const participant = await prisma.$transaction(async tx => {
        const participant = await tx.contestParticipant.findUnique({
            where:{contestId_userId:{contestId,userId}}
        })
        if(participant){
            return participant
        }

        const activeContest = await tx.contest.findFirst({
            where:{id:contestId, status:ContestStatus.ACTIVE},
            select:{id:true, entryFeeCoins:true}
        })
        if(!activeContest){
            throw new ApiError(httpstatus.BAD_REQUEST, "Contest is no longer accepting participants")
        }

        await chargeContestEntryFee(tx, activeContest, userId)
        return tx.contestParticipant.create({data:{contestId,userId}})
    })

    return {contest_id:contestId, participant_id:participant.id}

}


const getContestByUserId = async ( userId:string, contestId: string) => {
    const contest = await prisma.contest.findUnique({
        where: { id: contestId },
        include: {
            creator: {omit:{password:true, accessToken:true}},
            category:true
        }
    });
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }

    const [rules, prizes, totalVotes, finalization, awardSelections] = await Promise.all([
        contestRuleService.getContestRules(contestId),
        prizeService.getContestAwards(contestId),
        voteService.getContestTotalVotes(contestId),
        prisma.contestFinalization.findUnique({where:{contestId}}),
        contestFinalizationService.getContestAwardSelections(contestId)
    ])
    const baseContestDetails = {...contest, rules, prizes, awards:prizes, totalVotes, finalization, awardSelections}

    if(isCompletedContest(contest.status)){
        const winners = await getContestWinners(contestId)
        return {...baseContestDetails, winners};
    }

    if( (await isContestParticipantExist(userId, contestId)) && (contest.status === ContestStatus.ACTIVE)){
        const contestPhotoCount =  await prisma.contestPhoto.count({where:{contestId, photo:{userId}}})

        return {...baseContestDetails, joined:true, uploadCount:contestPhotoCount}
    }


    return {...baseContestDetails, joined:false};
}


//get the contest by it's id

const getContestById = async ( contestId: string) => {
    const contest = await prisma.contest.findUnique({
        where: { id: contestId },
        include: {
            creator: {omit:{password:true, accessToken:true}},
            category:true
        }
    });
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }

    const [rules, prizes, totalVotes, finalization, awardSelections] = await Promise.all([
        contestRuleService.getContestRules(contestId),
        prizeService.getContestAwards(contestId),
        voteService.getContestTotalVotes(contestId),
        prisma.contestFinalization.findUnique({where:{contestId}}),
        contestFinalizationService.getContestAwardSelections(contestId)
    ])
    const baseContestDetails = {...contest, rules, prizes, awards:prizes, totalVotes, finalization, awardSelections}

    if(isCompletedContest(contest.status)){
        const winners = await getContestWinners(contestId)
        return {...baseContestDetails, winners};
    }


    return baseContestDetails;
}



//Return all the contests
const getAllContests = async (page:number = 1, limit:number = 20) => {

    const skip = (page - 1) * limit

    const [contests, total] = await Promise.all([
        prisma.contest.findMany({    
        include: { creator: {omit:{password:true}}},
        skip,
        take:limit,
        orderBy:{startDate:"desc"}
    }),
    prisma.contest.count()
    ])

    return {contests, total, page,limit};
};

//Search contest by contest status
const getContestsByStatus = async (userId:string,status: ContestStatus) => {

    if(status === ContestStatus.COMPLETED){

        const completedContests =  await getMyCompletedContest(userId)

        const mappedContest = await Promise.all(completedContests.map(async contest => {
            // const achievements = await achievementService.getMyAchievementsByContest(userId, contest.id)
            const rank = (await getParticipantLevelData(contest.id, userId)).currentLevel
        
            return {...contest, rank}
        }))

       
        return mappedContest
    }

   

    // if(status === ContestStatus.CLOSED){
    //     const closedContests = await prisma.contest.findMany({where:{participants:{none:{userId}}}})

    //     closedContests.map( async contest => {
    //         const winners = await getContestWinners(contest.id)

    //         return {...contest, winners}
    //     })

        
    // }

    if(status === ContestStatus.ACTIVE){

        const contests = await prisma.contest.findMany({
            where:{status, participants:{none:{userId}}},
            include: { creator: {select:{id:true, avatar:true,fullName:true,cover:true, firstName:true, lastName:true}}}
        });

        const contestDetails = contests.map(async contest => {
            const details = getContestById(contest.id)

            return details

        })
        return await Promise.all(contestDetails);
    }

    if(status === ContestStatus.CLOSED){

        const contests = await prisma.contest.findMany({
            where:{status, participants:{none:{userId}}},
            include: { creator: {select:{id:true, avatar:true,fullName:true,cover:true, firstName:true, lastName:true}}}
        });

        const contestDetails = contests.map(async contest => {
            const details = getContestById(contest.id)

            return details

        })
        return await Promise.all(contestDetails);
    }

    
    const contests = await prisma.contest.findMany({
        where:{status},
        include: { creator: {select:{id:true, avatar:true,fullName:true,cover:true, firstName:true, lastName:true}}}
    });

    const contestDetails = contests.map(async contest => {
        const details = getContestById(contest.id)

        return details

    })

    


    return await Promise.all(contestDetails);
};


//Get all uploads of a user

const getContestUploadsByUserId = async (contestId:string, userId:string)=>{
    const userUploads = await prisma.contestPhoto.findMany({where:{contestId:contestId, photo:{userId}}, include:{photo:{select:{url:true}}}})
   const mappedPhotos  = userUploads.map(upload => {

    const {photo, ...rest} = upload

    return {...rest,url:upload.photo.url}
   })

    return mappedPhotos
}


const deleteContestUploadById = async (contestId:string, userId:string, photoId:string)=>{  

    const contestUpload = await prisma.contestPhoto.findUnique({where:{id:photoId, contestId}, include:{participant:true}})
    if(!contestUpload){
        throw new ApiError(httpstatus.NOT_FOUND, "Contest upload not found")
    }
    if (contestUpload.participant.userId !== userId){
        throw new ApiError(httpstatus.FORBIDDEN, "You are not allowed to delete this contest upload")
    }
    await prisma.contestPhoto.delete({where:{id:photoId}})
    return "Contest upload deleted successfully"    
 }




// Get all the contests
// This will be used to display all the contests in the contest page

const getMyActiveContests = async (userId:string) => {

    

    const contests = await prisma.contest.findMany({
        where:{status:ContestStatus.ACTIVE, participants:{some:{userId}}},
        include: { creator: {select:{id:true, avatar:true,fullName:true,cover:true, firstName:true, lastName:true}},}
    });

    const contestDetails = contests.map (async (contest) => {
        const levelData = await getParticipantLevelData(contest.id, userId)
        const photos = await getContestUploadsByUserId(contest.id,userId)
        
        
        return {...contest, level_data:levelData, photos}
    })

    return await Promise.all(contestDetails);
};

const getUpcomingContest = async () => {
    const contests = await prisma.contest.findMany({
        where: { status: ContestStatus.UPCOMING },
        include: { creator: {select:{id:true, avatar:true,fullName:true,cover:true, firstName:true, lastName:true}}}
    });
    return contests;
};

//Get my contests which are completed

const getMyCompletedContest = async (userId:string) => {

    if (!userId){
        throw new ApiError(httpstatus.BAD_REQUEST, "User id is not provided")
    }
    const user = await prisma.user.findUnique({where:{id:userId}})

    if (!user){
        throw new ApiError(httpstatus.NOT_FOUND, "User not found")
    }

    const myParticipatedContest = await prisma.contest.findMany({where:{status:{in:completedContestStatuses}, participants:{some:{userId}}}})

    const mappetdCompletedContest =await Promise.all( myParticipatedContest.map(async contest => {
        const details = await getContestById(contest.id)
        const participantPhotos = await getContestUploadsByUserId(contest.id, userId)
        const photos = await Promise.all(participantPhotos.map(async photo => ({
            ...photo,
            voteCount:await voteService.getVoteCount(photo.id)
        })))
        const achievements = await achievementService.getMyAchievementsByContest(userId, contest.id)
        const totalVotes =  photos.reduce((pre, photo) => photo.voteCount + pre, 0)
        return {...details, photos, totalVotes, achievements}
    }))

 

    // const myCompletedContests = await prisma.contest.findMany({where:{status:ContestStatus.COMPLETED, participants:{some:{userId}}},include:{_count:{select:{votes:true}}}})
    
    return mappetdCompletedContest
}



const getContestPrizes = async (contestId:string) => prizeService.getContestAwards(contestId)

const getContestWinners = async (contestId:string) => {
    const contest = await prisma.contest.findFirst({where:{id:contestId, status:{in:completedContestStatuses}}})

    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }

    const grants = await contestFinalizationService.getContestAwardResults(contestId)
    if(grants.length > 0){
        const [users, photos] = await Promise.all([
            prisma.user.findMany({
                where:{id:{in:[...new Set(grants.map(grant => grant.userId))]}},
                select:{id:true, avatar:true, fullName:true, firstName:true, lastName:true}
            }),
            prisma.contestPhoto.findMany({
                where:{id:{in:grants.flatMap(grant => grant.photoId ? [grant.photoId] : [])}},
                include:{photo:{select:{id:true, url:true, title:true}}}
            })
        ])
        const userById = new Map(users.map(user => [user.id,user]))
        const photoById = new Map(photos.map(photo => [photo.id,photo]))
        return grants.map(grant => ({
            ...grant,
            user:userById.get(grant.userId),
            photo:grant.photoId ? photoById.get(grant.photoId) : null
        }))
    }

    return prisma.contestAchievement.findMany({
        where:{contestId:contest.id, kind:AchievementKind.CONTEST_AWARD},
        include:{participant:{include:{user:{select:{avatar:true, fullName:true, firstName:true, lastName:true}}}}}
    })
}


// Fetch completed contest details with winner
const getClosedContestsWithWinner = async () => {
    const contests = await prisma.contest.findMany({
        where: { status: {in:completedContestStatuses} },
        include: {
            creator: true,
            participants: {
                include: {
                    user: true,
                }
            },
        }
    });

    return Promise.all(contests.map(async contest => {
        const winners = await getContestWinners(contest.id)
        return {
            ...contest,
            winner:winners[0] || null,
            winners
        }
    }))
};

// Identify the winner after contest ended

const identifyWinner = async (contestId:string)=>{
    return contestFinalizationService.finalizeContest(contestId)
}

const selectAwardPhoto = async (contestId:string, awardId:string, photoId:string, selectedById:string) => {
    return contestFinalizationService.selectAwardPhoto(contestId, awardId, photoId, selectedById)
}

const getContestAwardSelections = async (contestId:string) => {
    return contestFinalizationService.getContestAwardSelections(contestId)
}

const getRemainingPhotos = async (userId:string, contestId:string)=>{

    const contest = await prisma.contest.findUnique({where:{id:contestId}})
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "conetest not found")
    }
    
    const contestUploads = await prisma.contestPhoto.findMany({where:{contestId, participant:{userId}}})
    const userPhotos = await prisma.userPhoto.findMany({where:{userId, contestUpload:{none:{contestId}}}, select:{id:true, url:true}})
    
    return userPhotos
}

// const rankingParticipant = async (participantId:string, contestId:string)=>{
//     const contest =  await prisma.contest.findUnique({where:{id:contestId}})

//     if(!contest){
//         return
//     }

//     const lastParticipant = await prisma.contestParticipant.findFirst({where:{contestId},select:{rank:true}, orderBy:{createdAt:"desc"}});
    
//     if (lastParticipant && lastParticipant.rank){
//         return lastParticipant.rank + 1
//     }

//     return 1
// }


const isContestParticipantExist = async (userId:string, contestId:string)=>{
    const participantData =  await prisma.contestParticipant.findUnique({where:{contestId_userId:{contestId,userId}}})

    return participantData? participantData: false;
}

const getContestUploadsToVote = async (userId:string, contestId:string)=> {
     const contest = await prisma.contest.findUnique({where:{id:contestId}})
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }
    const participant = await isContestParticipantExist(userId, contestId)

    if( !participant){
        throw new ApiError(httpstatus.NOT_FOUND, "user is not in the participation list")
    }


    const contestUploads = await prisma.contestPhoto.findMany({where:{contestId, participant:{NOT:{userId}}, votes:{none:{providerId:participant.userId}}}, include:{photo:{select:{id:true, url:true}}}})

    if(contest.status === ContestStatus.ACTIVE){
        contestUploads.sort((a: ContestPhoto, b: ContestPhoto) => {
            
            if (a.promoted && !b.promoted) return -1;
            if (!a.promoted && b.promoted) return 1;
            
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        })
    }
    return contestUploads.map(upload => ({url:upload.photo.url, id:upload.id}))
}


//Get completed contest uploaded images

const getCompletedContestUploads = async (userId:string,contestId:string)=>{

    const contest = await prisma.contest.findUnique({where:{id:contestId}})
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }
    const participant = await isContestParticipantExist(userId, contestId)

    if( !participant){
        throw new ApiError(httpstatus.NOT_FOUND, "user is not in the participation list")
    }


    const contestUploads = await prisma.contestPhoto.findMany({where:{contestId, votes:{none:{providerId:participant.userId}}}, include:{photo:{select:{id:true, url:true}}}})

    if(contest.status === ContestStatus.ACTIVE){
        contestUploads.sort((a: ContestPhoto, b: ContestPhoto) => {
            
            if (a.promoted && !b.promoted) return -1;
            if (!a.promoted && b.promoted) return 1;
            
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        })
    }
    return contestUploads.map(upload => ({url:upload.photo.url, id:upload.id}))
}   

//Get all contest uploaded images

const getContestUploads = async (userId:string,contestId:string)=>{

    const contest = await prisma.contest.findUnique({where:{id:contestId}})
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }
    const participant = await isContestParticipantExist(userId, contestId)

    if( !participant){
        throw new ApiError(httpstatus.NOT_FOUND, "user is not in the participation list")
    }


    const contestUploads = await prisma.contestPhoto.findMany({where:{contestId, votes:{none:{providerId:participant.userId}}}, include:{photo:{select:{id:true, url:true}}}})

    if(contest.status === ContestStatus.ACTIVE){
        contestUploads.sort((a: ContestPhoto, b: ContestPhoto) => {
            
            if (a.promoted && !b.promoted) return -1;
            if (!a.promoted && b.promoted) return 1;
            
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        })
    }
    const uploads =  await Promise.all(contestUploads.map(async upload => {
        const voteCount = await voteService.getVoteCount(upload.id)

        return {id:upload.photo.id, url:upload.photo.url, voteCount}
    }))

    return uploads
}   




//Upload photo to a contest, user can upload photo from pforile or can upload directly from computer

const uploadPhotoToContest = async (contestId:string,userId:string, photoIds:string[], file:Express.Multer.File, acceptedRuleKeys?:unknown)=>{

    if(!contestId){
        throw new ApiError(httpstatus.BAD_REQUEST, "contest id is required")
    }
    const contest = await prisma.contest.findUnique({where:{id:contestId, status:ContestStatus.ACTIVE}})

    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found or contest closed")
    }

    let user = await prisma.user.findUnique({where:{id:userId}})

    if(!user){
        throw new ApiError(httpstatus.NOT_FOUND, "user not found")
    }

    const contestParticipant = await prisma.contestParticipant.findUnique({where:{contestId_userId:{contestId,userId}}})
    const isJoiningThroughUpload = !contestParticipant
    const parsedPhotoIds = Array.isArray(photoIds)
        ? photoIds
        : typeof photoIds === "string"
            ? [photoIds]
            : []

    await contestRuleEngine.validateUploadRules({
        contestId,
        userId,
        participantId:contestParticipant?.id,
        file,
        photoIds:parsedPhotoIds,
        acceptedRuleKeys,
        isJoiningThroughUpload
    })

    if(isJoiningThroughUpload && contest.entryFeeCoins > 0){
        const store = await prisma.userStore.findUnique({
            where:{userId},
            select:{coin:true}
        })
        if(!store || store.coin < contest.entryFeeCoins){
            throw new ApiError(httpstatus.PAYMENT_REQUIRED, "Insufficient coins to enter this contest")
        }
    }

    let selectedPhotoIds:string[] = []
    if(file){
        const uploadedPhoto = await profileService.uploadUserPhoto(userId, file)
        selectedPhotoIds = [uploadedPhoto.id]
    }else{
        if(parsedPhotoIds.length <= 0){
            throw new ApiError(httpstatus.BAD_REQUEST,"photoIds is empty or missing")
        }

        const userPhotos = await prisma.userPhoto.findMany({where:{id:{in:parsedPhotoIds}, userId}})
        if(userPhotos.length !== parsedPhotoIds.length){
            throw new ApiError(httpstatus.BAD_REQUEST, "One or more photos do not belong to this user")
        }
        selectedPhotoIds = userPhotos.map(userPhoto => userPhoto.id)
    }

    const submissionLimit = await contestRuleService.getEnabledRuleValue<number>(contestId, "SUBMISSION_LIMIT")
    const images = await prisma.$transaction(async tx => {
        const activeContest = await tx.contest.findFirst({where:{id:contestId, status:ContestStatus.ACTIVE}})
        if(!activeContest){
            throw new ApiError(httpstatus.BAD_REQUEST, "Contest is no longer accepting submissions")
        }

        let participant = await tx.contestParticipant.findUnique({
            where:{contestId_userId:{contestId,userId}}
        })
        if(!participant){
            await chargeContestEntryFee(tx, {
                id:activeContest.id,
                entryFeeCoins:activeContest.entryFeeCoins
            }, userId)
            participant = await tx.contestParticipant.create({data:{contestId,userId}})
        }
        if(submissionLimit !== null){
            const existingUploadCount = await tx.contestPhoto.count({where:{contestId,participantId:participant.id}})
            if(existingUploadCount + selectedPhotoIds.length > submissionLimit){
                throw new ApiError(httpstatus.BAD_REQUEST, "Maximum upload limit exceeded")
            }
        }

        const createdPhotos:ContestPhoto[] = []
        for(const photoId of selectedPhotoIds){
            createdPhotos.push(await tx.contestPhoto.create({
                data:{contestId,participantId:participant.id,photoId},
                include:{photo:true}
            }))
        }
        return createdPhotos
    })

    await Promise.all(images.map(image => agenda.every("1 minute", "exposure:watcher", {contestPhotoId:image.id})))

    return images
}


// const uploadPhotoFromComputer = async (contestId:string, userId:string, file:Express.Multer.File)=>{
//     if(!file){
//         throw new ApiError(httpstatus.BAD_REQUEST, "file is required to upload")
//     }

//     const uploadedUserPhoto = await profileService.uploadUserPhoto(userId,file)

//     return uploadedUserPhoto
// }

// const getContestDetails = async (contestId:string)=>{
    
//     return (await prisma.contest.findUnique({where:{id:contestId},include:{votes:true, participants:true}}))
// }


//Get currently active contest data like total vote and level
// const getContestSummary = async (contestId:string, userId:string)=>{

//     const contestData = await prisma.contest.findUnique({where:{id:contestId},include:{participants:{where:{userId}}}})

//     const participant = contestData?.participants[0]
//     if(!participant){
//         throw new ApiError(httpstatus.NOT_FOUND, "Participant not found")
//     }

//     const totalVoteCount = await getParticipantTotalVotes(contestId, participant.id)

//     return {level:participant?.level, votes:totalVoteCount}

// }


const getParticipantTotalVotes =  async(contestId:string, participantId:string)=>{

    const votes = await voteService.totalVotesOfParticipant(participantId, contestId)
    
    return votes
}

// const getParticipantLevelRank = async (contestId:string, participantId:string, participantLevel:YCLevel)=>{

//     const participant = await prisma.contestParticipant.findUnique({where:{id:participantId}})
   

//     if(!participant){
//         return new ApiError(httpstatus.NOT_FOUND, "participant not found")
//     }
//     const targetVoteCount = await getParticipantTotalVotes(contestId, participant.id)
//     const otherParticipantsInSameLevel = await prisma.contestParticipant.findMany({where:{contestId, level:participant.level}})
//     const totalInSameLevel = otherParticipantsInSameLevel.length
// }


const getYCLevelByOrder = ()=>{

    return [
       
        YCLevel.AMATEUR,
        YCLevel.TALENTED,
        YCLevel.SUPREME,
        YCLevel.SUPERIOR,
        YCLevel.TOP_NOTCH
    ]
    
}

const getContestLevelRequirements = async (contestId:string)=>{
    const contest = await prisma.contest.findUnique({where:{id:contestId}})
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }
    let ycLevels = getYCLevelByOrder()
    const configuredLevels = await contestRuleEngine.getLevelRequirements(contestId)

    let levels = configuredLevels.map((level, idx) => ({levelName:ycLevels[idx], point: level.votes, displayLevel: level.level}))

    return levels
}

const getParticipantLevelData = async (contestId:string,userId:string)=>{

    const participant = await prisma.contestParticipant.findFirst({where:{userId, contestId,}})

    if (!participant){
        throw new Error("Participant not found")
    }

    const totalVotes = await getParticipantTotalVotes(contestId, participant.id)
    const contestLevelRequirement = await getContestLevelRequirements(contestId)
    let currentLevel = YCLevel.NEW.toString()
    let currentIdx = -1
    
    contestLevelRequirement.forEach( (contestLevel,idx) => {
        if(contestLevel.point <= totalVotes){
            currentLevel = contestLevel.levelName.toString()
            currentIdx = idx
        }else {
            return
        }
    })
    

    return {currentLevel, totalVotes, nextLevel:contestLevelRequirement[currentIdx+1], exposure_bonus: participant.exposure_bonus}

}

const promoteContestPhoto = async (contestId:string, photoId:string, userId:string)=>{

     const contest = await prisma.contest.findUnique({where:{id:contestId, status:ContestStatus.ACTIVE}})

    if (!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "Contest not found")
    }
    const contestPhoto = await prisma.contestPhoto.findUnique({where:{id:photoId},include:{participant:true}})
    
    if(!contestPhoto){
        throw new ApiError(httpstatus.NOT_FOUND, "Contest photo not found")
    }

    if (contestPhoto.promoted){
        throw new ApiError(httpstatus.BAD_REQUEST, "Contest photo is already promoted")
    }

   

    if (contestPhoto.participant.userId !== userId){
        throw new ApiError(httpstatus.FORBIDDEN, "You are not allowed to promote this contest photo")
    }

    const promotionExpiresAt = new Date(Date.now() + 30 * 60 * 1000) //30 minutes from now
    const userStore = await userStoreService.getStoreData(userId)

    if ( !userStore || userStore.boost <= 0){
        throw new ApiError(httpstatus.BAD_REQUEST, "You don't have enough promotes")
    }
    await prisma.$transaction(async (tx) => {
        // Decrement the user's promotes count
        await tx.userStore.update({
            where: { userId },
            data: { boost: { decrement: 1 } }
        });

        // Update the contest photo to mark it as promoted
        await tx.contestPhoto.update({
            where: { id: photoId },
            data: { promoted: true, promotionExpiresAt }
        });
    });


    // Shcedule a job to remove promotion after 30 minutes
    agenda.schedule('in 30 minutes', 'promotion:remove', {
        photoId: photoId
    });

    console.log(`Contest photo with ID ${photoId} has been promoted until ${promotionExpiresAt}`);

    return { message: `Contest photo with ID ${photoId} has been promoted until ${promotionExpiresAt}` };
}

// const getContestPhotoToVote = async (contestId:string)=>{
//     const contestPhoto = await prisma.contestPhoto.findMany({where:{contestId}})

//     let start = 0;
//     let length = contestPhoto.length;
//     let idx = 1

//     while(idx < length){

//         let photo = contestPhoto[idx]
//         if (photo.promoted && photo.promotionExpiresAt && photo.promotionExpiresAt > new Date()){
//             continue
//         }
//         idx++;
//     }

// }


const getContestParticipants = async (contestId:string)=>{
    const contest = await prisma.contest.findUnique({where:{id:contestId}})

    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "Contest not found")
    }

    return await prisma.contestParticipant.findMany({where:{contestId}})

}


const identifyContestTopPhoto = async (contestId:string)=>{

    const contest = await prisma.contest.findUnique({where:{id:contestId}})
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }

    const contestVote = await prisma.contestPhoto.count({where:{contestId}})

}


const tradePhoto = async (userId:string,contestId:string, contestPhotoId:string, photoId:string, file:Express.Multer.File) => {
    const contestPhoto = await prisma.contestPhoto.findUnique({
        where:{id:contestPhotoId, contestId},
        include:{photo:true, participant:true}
    })
    

    if(!contestPhoto){
        throw new ApiError(httpstatus.NOT_FOUND, "contest photo not found")
    }
    if(contestPhoto.participant.userId !== userId){
        throw new ApiError(httpstatus.FORBIDDEN, "You are not allowed to trade this contest photo")
    }

    const userStore = await userStoreService.getStoreData(userId)
    if (!userStore || userStore.swap <= 0 ){
        throw new ApiError(httpstatus.BAD_REQUEST, "you does not have enough trade")
    }
    const vote = await voteService.getVoteCount(contestPhoto.id)
    await prisma.contestPhoto.delete({where:{id:contestPhoto.id}})

    const uploadedPhoto = await uploadPhotoToContest(contestId,userId,[photoId], file)
    //decrease trade by 1
    await userStoreService.updateStoreData(userId,{swap:-1})

    return await prisma.contestPhoto.update({where:{id:uploadedPhoto[0].id}, data:{initialVotes:vote}})
    
}

const chargePhoto = async (userId:string, contestId:string, contestPhotoId:string) => {
    const contestPhoto = await prisma.contestPhoto.findUnique({where:{id:contestPhotoId},include:{participant:true}})

    if(!contestPhoto){
        throw new ApiError(httpstatus.NOT_FOUND, "contest photo not found")
    }
    if(contestPhoto.participant.userId !== userId){
        throw new ApiError(httpstatus.FORBIDDEN, "You are not allowed to charge this contest photo")
    }

    const userStore = await userStoreService.getStoreData(userId)

    if(!userStore || userStore.key <= 0){
        throw new ApiError(httpstatus.NOT_FOUND, "you does not have enough charge")
    }
    const participant = await prisma.contestParticipant.findUnique({where:{id:contestPhoto.participant.id}})
    if(!participant){
        throw new ApiError(httpstatus.NOT_FOUND, "participant not found")
    }

    const newContestPhoto = await prisma.contestParticipant.update({where:{id:participant.id}, data:{exposure_bonus:100}})

   
    agenda.every("1 minute", "exposure:watcher",{contestPhotoId:contestPhoto.id})
    
    await userStoreService.updateStoreData(userId, {key:-1})
    return newContestPhoto
}

const rankLevelTabs = ['POPULAR', 'SKILLED', 'PREMIER', 'ELITE', 'ALL_STAR'] as const
type RankLevelTab = typeof rankLevelTabs[number]

const normalizeRankLevel = (level?: string): RankLevelTab => {
    const normalizedLevel = level?.toUpperCase().replace(/-/g, '_') as RankLevelTab
    return rankLevelTabs.includes(normalizedLevel) ? normalizedLevel : 'POPULAR'
}

const getDesignLevelFromYCLevel = (level?: YCLevel | null): RankLevelTab => {
    const levelMap:Record<YCLevel, RankLevelTab> = {
        [YCLevel.NEW]:'POPULAR',
        [YCLevel.AMATEUR]:'POPULAR',
        [YCLevel.TALENTED]:'SKILLED',
        [YCLevel.SUPREME]:'PREMIER',
        [YCLevel.SUPERIOR]:'ELITE',
        [YCLevel.TOP_NOTCH]:'ALL_STAR'
    }

    return level ? levelMap[level] : 'POPULAR'
}

const getPagination = (page?:number, limit?:number) => {
    const safePage = page && page > 0 ? page : 1
    const safeLimit = limit && limit > 0 ? limit : 20
    const skip = (safePage - 1) * safeLimit

    return {page:safePage, limit:safeLimit, skip}
}

const paginateRankedData = <T>(data:T[], page?:number, limit?:number) => {
    const pagination = getPagination(page, limit)
    const paginatedData = data.slice(pagination.skip, pagination.skip + pagination.limit)

    return {
        data:paginatedData,
        meta:{
            page:pagination.page,
            limit:pagination.limit,
            total:data.length
        }
    }
}

const getContestPhotoVoteScore = async (contestPhoto:{id:string; initialVotes?:number | null}) => {
    const voteCount = await voteService.getVoteCount(contestPhoto.id)
    return voteCount + (contestPhoto.initialVotes || 0)
}

const getFollowedUserIds = async (currentUserId:string, followingIds:string[]) => {
    if(!currentUserId || followingIds.length <= 0){
        return new Set<string>()
    }

    const follows = await prisma.follow.findMany({
        where:{
            followerId:currentUserId,
            followingId:{in:followingIds}
        },
        select:{followingId:true}
    })

    return new Set(follows.map(follow => follow.followingId))
}

const getContestPhotosSortedByVote = async (contestId:string, page?:number, limit?:number) => {

    const contest = await prisma.contest.findUnique({where:{id:contestId}})

    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, 'Contest not found')
    }
    const ranking = await contestRankingService.buildContestRanking(contestId)
    const contestUploads = await prisma.contestPhoto.findMany({
        where:{id:{in:ranking.photos.map(photo => photo.photoId)}},
        include:{
            participant:{
                include:{
                    user:{select:{id:true, avatar:true, country:true, fullName:true}}
                }
            },
            photo:{select:{id:true, url:true, title:true}}
        }
    })
    const uploadById = new Map(contestUploads.map(upload => [upload.id,upload]))
    const sortedUploads = ranking.photos
        .map(photo => {
            const upload = uploadById.get(photo.photoId)
            if(!upload){
                return null
            }
            return {
                contestPhotoId:upload.id,
                userPhotoId:upload.photo.id,
                url:upload.photo.url,
                title:upload.photo.title,
                voteCount:photo.score,
                rank:photo.rank,
                photographer:upload.participant.user
            }
        })
        .filter((upload): upload is NonNullable<typeof upload> => Boolean(upload))

    const paginatedPhotos = paginateRankedData(sortedUploads, page, limit)
    return {
        photos:paginatedPhotos.data,
        meta:paginatedPhotos.meta
    }
}

const getContestTopPhotographers =  async (contestId:string, currentUserId:string, page?:number, limit?:number, level?:string)=>{

    const contest = await prisma.contest.findUnique({where:{id:contestId}})

    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }

    const activeLevel = normalizeRankLevel(level)
    const ranking = await contestRankingService.buildContestRanking(contestId)
    const contestParticipants = await prisma.contestParticipant.findMany({
        where:{id:{in:ranking.photographers.map(photographer => photographer.participantId)}},
        include:{
            photos:{select:{photo:{select:{id:true, url:true, title:true}}, id:true}},
            user:{select:{id:true, avatar:true, country:true, fullName:true}}
        }
    })
    const participantById = new Map(contestParticipants.map(participant => [participant.id,participant]))
    const photoScoreById = new Map(ranking.photos.map(photo => [photo.photoId,photo.score]))
    const participantWithVote = ranking.photographers.flatMap(photographer => {
        const participant = participantById.get(photographer.participantId)
        if(!participant){
            return []
        }
        return [{
            participantId:participant.id,
            rank:photographer.rank,
            level:getDesignLevelFromYCLevel(photographer.level),
            user:participant.user,
            photos:participant.photos.map(photo => ({
                contestPhotoId:photo.id,
                userPhotoId:photo.photo.id,
                url:photo.photo.url,
                title:photo.photo.title,
                voteCount:photoScoreById.get(photo.id) || 0
            })).sort((a,b) => b.voteCount - a.voteCount),
            totalVotes:photographer.score
        }]
    })

    const contesttotalVotes = ranking.photographers.reduce((total, participant) => total + participant.score, 0)
    const followingIds = await getFollowedUserIds(currentUserId, participantWithVote.map(participant => participant.user.id))
    const sortedParticipant = participantWithVote
        .filter(participant => participant.level === activeLevel)
        .map((participant, idx) => ({
            ...participant,
            levelRank:idx + 1,
            user:{
                ...participant.user,
                isFollowing:followingIds.has(participant.user.id)
            }
        }))

    const paginatedParticipants = paginateRankedData(sortedParticipant, page, limit)

    return {
        contestTotalVotes:contesttotalVotes,
        levelTabs:rankLevelTabs,
        activeLevel,
        participants: paginatedParticipants.data,
        meta:paginatedParticipants.meta
    }

}

const getContestYCTopPicks = async (contestId:string, page?:number, limit?:number) => {
    const contest = await prisma.contest.findUnique({where:{id:contestId}})

    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }

    const ycPickAchievements = await prisma.contestAchievement.findMany({
        where:{contestId, category:PrizeType.YC_PICK, photoId:{not:null}},
        include:{
            photo:{
                include:{
                    photo:{select:{id:true, url:true, title:true}},
                    participant:{include:{user:{select:{id:true, avatar:true, country:true, fullName:true}}}}
                }
            }
        }
    })

    if(ycPickAchievements.length <= 0){
        const rankedPhotos = await getContestPhotosSortedByVote(contestId, page, limit)
        return {
            ...rankedPhotos,
            selectionType:'VOTE_RANKED_FALLBACK'
        }
    }

    const ycPicks = await Promise.all(ycPickAchievements.map(async achievement => {
        if(!achievement.photo){
            return null
        }

        const voteCount = await getContestPhotoVoteScore(achievement.photo)

        return {
            contestPhotoId:achievement.photo.id,
            userPhotoId:achievement.photo.photo.id,
            url:achievement.photo.photo.url,
            title:achievement.photo.photo.title,
            voteCount,
            photographer:achievement.photo.participant.user,
            pickedAt:achievement.createdAt
        }
    }))

    const sortedPicks = ycPicks
        .filter((pick): pick is NonNullable<typeof pick> => Boolean(pick))
        .sort((a,b) => b.voteCount - a.voteCount)
        .map((pick, idx) => ({rank:idx + 1, ...pick}))

    const paginatedPicks = paginateRankedData(sortedPicks, page, limit)

    return {
        selectionType:'YC_PICK',
        photos:paginatedPicks.data,
        meta:paginatedPicks.meta
    }
}

const getContestPhotoCount = async (contestId:string) => {
    const photoCount = await prisma.contestPhoto.count({where:{contestId:contestId}})

    return photoCount
}




export const contestService = {
    createContest,
    updateContest,
    joinContest,
    getContestById,
    getAllContests,
    getMyActiveContests,
    getContestsByStatus,
    getUpcomingContest,
    getMyCompletedContest,
    getClosedContestsWithWinner,
    getContestUploads,
    uploadPhotoToContest,
    deleteContestByContestId,
    getContestUploadsByUserId,
    promoteContestPhoto,
    getParticipantLevelData,
    identifyWinner,
    getContestWinners,
    selectAwardPhoto,
    getContestAwardSelections,
    getRemainingPhotos,
    tradePhoto,
    chargePhoto,
    deleteContestUploadById,
    getContestPhotosSortedByVote,
    getContestTopPhotographers,
    getContestYCTopPicks,
    getContestByUserId,
    getContestUploadsToVote,
    getContestPhotoCount,
    getContestCreateOptions,
    getContestPrizes

}
