import prisma from '../../../shared/prisma';
import ApiError from '../../../errors/ApiError';
import httpstatus from 'http-status';
import { fileUploader } from '../../../helpers/fileUploader';
import { AchievementKind, ContestParticipant, ContestPhoto, ContestStatus, Prisma, PrizeType, RecurringType, YCLevel } from '../../../prismaClient';
import { contestData, updateContestData } from './contest.type';
import { contestRuleService } from './ContestRules/contestRules.service';
import { ContestRuleConfigInput } from './ContestRules/contestRules.type';
import { profileService } from '../Profile/profile.service';
import agenda from '../Agenda';
import { validateContestDate } from '../../../helpers/validateDate';
import { assertValidTimeZone } from '../../../helpers/nextOccurance';
import { getTeammateUserIds } from '../../../helpers/teammate.helper';
import { userStoreService } from '../User/UserStore/userStore.service';
import { voteService } from '../Vote/vote.service';
import { getVoteWeight } from '../Vote/voteWeight.service';
import { achievementService } from '../Achievements/achievement.service';
import { prizeService } from '../Prize/prize.service';
import { contestRuleEngine } from './ContestRules/contestRule.engine';
import { contestFinalizationService } from './ContestFinalization/contestFinalization.service';
import { contestRankingService } from './ContestRanking/contestRanking.service';
import {
    ContestRuleKey,
    contestRuleDefinitions,
    getContestRuleDefinitionViews,
    isContestRuleKey,
    LevelRequirementValue,
    supportedContestImageMimeTypes,
} from './ContestRules/contestRule.definitions';
import { prizeTypes, ycLevels } from '../Awards/award.definitions';
import { paginationHelper } from '../../../helpers/paginationHelper';

const completedContestStatuses:ContestStatus[] = [ContestStatus.COMPLETED, ContestStatus.CLOSED]
const isCompletedContest = (status:ContestStatus) => completedContestStatuses.includes(status)
const contestListCreatorInclude = {omit:{password:true, accessToken:true}} as const

const createRandomSeed = () => `${Date.now()}-${Math.random()}`

const hashSeed = (seed:string) => {
    let hash = 2166136261

    for (let index = 0; index < seed.length; index++) {
        hash ^= seed.charCodeAt(index)
        hash = Math.imul(hash, 16777619)
    }

    return hash >>> 0
}

const seededRandom = (seed:string) => {
    let state = hashSeed(seed) || 1

    return () => {
        state ^= state << 13
        state ^= state >>> 17
        state ^= state << 5
        return ((state >>> 0) / 4294967296)
    }
}

const shuffleWithSeed = <T>(items:T[], seed:string) => {
    const shuffled = [...items]
    const random = seededRandom(seed)

    for (let index = shuffled.length - 1; index > 0; index--) {
        const swapIndex = Math.floor(random() * (index + 1))
        const current = shuffled[index]
        shuffled[index] = shuffled[swapIndex]
        shuffled[swapIndex] = current
    }

    return shuffled
}

const shouldUseDefaultAwards = (body:contestData) =>
    body.prizeIds === undefined && body.prizes === undefined

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
        where:{userId, coins:{gte:contest.entryFeeCoins}},
        data:{coins:{decrement:contest.entryFeeCoins}}
    })
    if(charged.count !== 1){
        throw new ApiError(httpstatus.PAYMENT_REQUIRED, "Insufficient coins to enter this contest")
    }

    await tx.contestEntryFeeTransaction.create({
        data:{contestId:contest.id, userId, amount:contest.entryFeeCoins}
    })
}

const getContestCreateOptions = async () => {
    const [categories, prizeDefinitions] = await Promise.all([
        prisma.contestCategory.findMany({
            where:{isActive:true},
            orderBy:[{order:"asc"}, {name:"asc"}]
        }),
        prizeService.getContestPrizeDefinitions()
    ])
    const ruleDefinitions = getContestRuleDefinitionViews()

    return {
        categories,
        ruleDefinitions,
        prizeDefinitions,
        rules:ruleDefinitions,
        prizes:prizeDefinitions,
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

    const bannerUrl = banner
        ? (await fileUploader.uploadToDigitalOcean(banner)).Location
        : null

    const normalizedRules = contestRuleService.normalizeContestRules(body.rules, body.rules === undefined)
    const awardRows = await prizeService.resolveAwardRows(
        body.prizeIds || [],
        body.prizes || [],
        shouldUseDefaultAwards(body)
    )

    const contestData:any = {
        creatorId,
        title: body.title,
        description: body.description,
        status: ContestStatus.UPCOMING,
        category:body.category,
        isMoneyContest:body.isMoneyContest,
        currency:body.isMoneyContest ? body.currency : null,
        minPrize:body.isMoneyContest ? body.minPrize : 0,
        maxPrize:body.isMoneyContest ? body.maxPrize : 0,
        entryFeeCoins:body.coinRequirement === false ? 0 : (body.entryFeeCoins || 0),
        maxUpload:contestRuleService.getSubmissionLimitFromRules(normalizedRules),
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

        return {...contest, rules:normalizedRules, prizes:awardRows.filter(prize => prize.enabled)}
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
    const timezone = body.recurrence?.timezone || "UTC";
    try{
        assertValidTimeZone(timezone);
    }catch{
        throw new ApiError(httpstatus.BAD_REQUEST, "Timezone must be a valid IANA timezone name");
    }

    const normalizedRules = contestRuleService.normalizeContestRules(body.rules, body.rules === undefined)
    const awardRows = await prizeService.resolveAwardRows(
        body.prizeIds || [],
        body.prizes || [],
        shouldUseDefaultAwards(body)
    )
    const contestData:any = {
        creatorId,
        title: body.title,
        description: body.description,
        startDate,
        endDate,
        category:body.category,
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
        timezone,
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
        return {...recurringContest, prizes:awardRows}
    })
}


const updateContest = async (contestId:string, contestData:updateContestData, banner?:Express.Multer.File)=>{
    const contest = await prisma.contest.findUnique({where:{id:contestId}})
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }

    const lockedStatuses:ContestStatus[] = [
        ContestStatus.ACTIVE,
        ContestStatus.FINALIZING,
        ContestStatus.FINALIZATION_FAILED,
        ContestStatus.COMPLETED,
        ContestStatus.CLOSED
    ]
    if(lockedStatuses.includes(contest.status) || (contest.status !== ContestStatus.UPCOMING && contest.status !== ContestStatus.NEW)){
        throw new ApiError(httpstatus.BAD_REQUEST, "Editing contest not allowed")
    }

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

    const entryFeeCoins = contestData.coinRequirement === false
        ? 0
        : (contestData.entryFeeCoins ?? contest.entryFeeCoins)
    if(contestData.coinRequirement && !entryFeeCoins){
        throw new ApiError(httpstatus.BAD_REQUEST, "A positive entryFeeCoins value is required when coinRequirement is enabled")
    }

    const { prizeIds, prizes, rules, coinRequirement, ...updatePayload } = contestData as any

    const bannerUrl = await (
        banner ? fileUploader.uploadToDigitalOcean(banner).then(upload => upload.Location) : Promise.resolve(undefined)
    )
    if(bannerUrl){
        updatePayload.banner = bannerUrl
    }

    const normalizedRules = rules !== undefined
        ? contestRuleService.normalizeContestRules(rules, false)
        : undefined
    const awardRows = (prizeIds !== undefined || prizes !== undefined)
        ? await prizeService.resolveAwardRows(
            prizeIds || [],
            prizes || [],
            (prizeIds || []).length === 0 && (prizes || []).length === 0
        )
        : undefined

    const {updatedContest, updatedRules, updatedAwards} = await prisma.$transaction(async tx => {
        const updatedContest = await tx.contest.update({
            where:{id:contestId},
            data:{
                ...updatePayload,
                startDate,
                endDate,
                isMoneyContest,
                currency:isMoneyContest ? currency : null,
                minPrize:isMoneyContest ? minPrize : 0,
                maxPrize:isMoneyContest ? maxPrize : 0,
                entryFeeCoins,
                ...(normalizedRules !== undefined && {maxUpload:contestRuleService.getSubmissionLimitFromRules(normalizedRules)}),
            }
        })

        let updatedRules
        if(normalizedRules !== undefined){
            await tx.contestRuleConfig.deleteMany({where:{contestId}})
            await tx.contestRuleConfig.createMany({
                data:normalizedRules.map(rule => ({
                    contestId,
                    key:rule.key,
                    value:rule.value,
                    enabled:rule.enabled ?? true,
                    order:rule.order ?? contestRuleDefinitions[rule.key].order
                }))
            })
            updatedRules = await tx.contestRuleConfig.findMany({
                where:{contestId},
                orderBy:{order:"asc"}
            })
        }

        let updatedAwards
        if(awardRows !== undefined){
            await tx.contestAward.deleteMany({where:{contestId}})
            if(awardRows.length > 0){
                await tx.contestAward.createMany({
                    data:awardRows.map(row => ({contestId, ...row}))
                })
            }
            updatedAwards = await tx.contestAward.findMany({
                where:{contestId, enabled:true},
                orderBy:[{order:"asc"}, {createdAt:"asc"}]
            })
        }

        return {updatedContest, updatedRules, updatedAwards}
    })

    return {
        ...updatedContest,
        ...(updatedRules !== undefined && {rules:updatedRules}),
        ...(updatedAwards !== undefined && {prizes:updatedAwards})
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
            creator: {omit:{password:true, accessToken:true}}
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
    const baseContestDetails = {...contest, rules, prizes, totalVotes, finalization, awardSelections}

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
            creator: {omit:{password:true, accessToken:true}}
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
    const baseContestDetails = {...contest, rules, prizes, totalVotes, finalization, awardSelections}

    if(isCompletedContest(contest.status)){
        const winners = await getContestWinners(contestId)
        return {...baseContestDetails, winners};
    }


    return baseContestDetails;
}



//Return all the contests
const getAllContests = async (page:number = 1, limit:number = 20, search?:string) => {

    const {skip, limit:paginationLimit, page:currentPage} = paginationHelper.calculatePagination({page, limit})
    const where = search
        ? {title:{contains:search, mode:"insensitive" as const}}
        : {}

    const [contests, total] = await Promise.all([
        prisma.contest.findMany({    
            where,
            include: { creator: {omit:{password:true, accessToken:true}}},
            skip,
            take:paginationLimit,
            orderBy:{startDate:"desc"}
        }),
        prisma.contest.count({where})
    ])

    const enrichedContests = await enrichContestListDetails(contests)

    return {
        contests:enrichedContests,
        total,
        page:currentPage,
        limit:paginationLimit,
        meta:paginationHelper.getPaginationMetaData(currentPage, paginationLimit, total)
    }
};

const getPublicContests = async (
    status?:ContestStatus,
    page:number = 1,
    limit:number = 20,
    search?:string
) => {
    const {skip, limit:paginationLimit, page:currentPage} = paginationHelper.calculatePagination({page, limit})
    const where:Prisma.ContestWhereInput = {
        ...(status && {status}),
        ...(search && {title:{contains:search, mode:"insensitive" as const}})
    }

    const [contests, total] = await Promise.all([
        prisma.contest.findMany({
            where,
            include:{creator:{omit:{password:true, accessToken:true}}},
            skip,
            take:paginationLimit,
            orderBy:{startDate:"desc"}
        }),
        prisma.contest.count({where})
    ])

    const enrichedContests = await enrichContestListDetails(contests)

    return {
        contests:enrichedContests,
        total,
        page:currentPage,
        limit:paginationLimit,
        meta:paginationHelper.getPaginationMetaData(currentPage, paginationLimit, total)
    }
}

const formatContestRuleSummaryForList = (key:ContestRuleKey, value:any) => {
    switch (key) {
        case "SUBMISSION_LIMIT":
            return `${value} photo submits per participant`;
        case "SUBMISSION_RULES": {
            if (Array.isArray(value)) {
                return value.map((item:string) => `- ${item}`).join("\n");
            }

            const lines = [
                value?.intro,
                ...(value?.disallowed || []).map((item:string) => `- ${item}`),
                value?.removalNotice,
            ].filter(Boolean);
            return lines.join("\n");
        }
        case "LEVEL_REQUIREMENTS":
            return (value as LevelRequirementValue[])
                .map((item) => `- ${item.level.replace("_", " ")} - ${item.votes} votes`)
                .join("\n");
        case "SUBMISSION_FORMAT": {
            const mimeTypes = Array.isArray(value?.mimeTypes) ? value.mimeTypes : [];
            const formats = mimeTypes
                .map((mimeType:string) => mimeType.replace("image/", "").toUpperCase())
                .join(", ");
            return `${formats}, minimum resolution of ${value?.minWidth}px x ${value?.minHeight}px, maximum size ${value?.maxSizeMB}MB`;
        }
        default:
            return value?.text || "";
    }
}

const formatContestRulesForList = (configs:any[]) => {
    return configs
        .filter((rule) => isContestRuleKey(rule.key) && rule.enabled)
        .map((rule) => {
            const definition = contestRuleDefinitions[rule.key as ContestRuleKey];

            return {
                key: definition.key,
                label: definition.label,
                name: definition.label,
                icon: definition.icon,
                inputType: definition.inputType,
                appliesTo: definition.appliesTo,
                displayOnly: definition.displayOnly,
                enabled: rule.enabled,
                order: rule.order,
                value: rule.value,
                description: formatContestRuleSummaryForList(definition.key, rule.value),
            };
        });
}

const getDefaultContestRuleConfigsForList = () => {
    return contestRuleService.normalizeContestRules().map((rule) => ({
        key: rule.key,
        value: rule.value,
        enabled: rule.enabled ?? true,
        order: rule.order ?? contestRuleDefinitions[rule.key].order,
    }))
}

const groupByContestId = <T extends {contestId:string}>(rows:T[]) => {
    const map = new Map<string, T[]>();

    rows.forEach((row) => {
        const existing = map.get(row.contestId) || [];
        existing.push(row);
        map.set(row.contestId, existing);
    });

    return map;
}

const getContestWinnerMapForList = async (contests:{id:string; status:ContestStatus}[]) => {
    const completedContestIds = contests
        .filter((contest) => isCompletedContest(contest.status))
        .map((contest) => contest.id);

    const winnersByContestId = new Map<string, any[]>();
    if(completedContestIds.length === 0){
        return winnersByContestId;
    }

    const grants = await prisma.contestAwardGrant.findMany({
        where:{
            contestId:{in:completedContestIds},
            kind:AchievementKind.CONTEST_AWARD,
            status:"COMPLETED",
        },
        orderBy:[{rank:"asc"}, {createdAt:"asc"}],
    });

    const grantsByContestId = groupByContestId(grants);
    const userIds = [...new Set(grants.map((grant) => grant.userId))];
    const photoIds = [...new Set(grants.flatMap((grant) => grant.photoId ? [grant.photoId] : []))];

    const [users, photos] = await Promise.all([
        userIds.length
            ? prisma.user.findMany({
                where:{id:{in:userIds}},
                select:{id:true, avatar:true, fullName:true, firstName:true, lastName:true},
            })
            : Promise.resolve([]),
        photoIds.length
            ? prisma.contestPhoto.findMany({
                where:{id:{in:photoIds}},
                include:{photo:{select:{id:true, url:true, title:true}}},
            })
            : Promise.resolve([]),
    ]);

    const userById = new Map(users.map((user) => [user.id, user] as const));
    const photoById = new Map(photos.map((photo) => [photo.id, photo] as const));

    grantsByContestId.forEach((contestGrants, contestId) => {
        winnersByContestId.set(contestId, contestGrants.map((grant) => ({
            ...grant,
            user:userById.get(grant.userId),
            photo:grant.photoId ? photoById.get(grant.photoId) : null,
        })));
    });

    const achievementContestIds = completedContestIds.filter((contestId) => !winnersByContestId.has(contestId));
    if(achievementContestIds.length){
        const achievements = await prisma.contestAchievement.findMany({
            where:{contestId:{in:achievementContestIds}, kind:AchievementKind.CONTEST_AWARD},
            include:{participant:{include:{user:{select:{avatar:true, fullName:true, firstName:true, lastName:true}}}}},
        });

        const achievementsByContestId = groupByContestId(achievements);
        achievementContestIds.forEach((contestId) => {
            winnersByContestId.set(contestId, achievementsByContestId.get(contestId) || []);
        });
    }

    return winnersByContestId;
}

const enrichContestListDetails = async (contests:any[]) => {
    const contestIds = contests.map((contest) => contest.id);

    if(contestIds.length === 0){
        return [];
    }

    const [
        ruleConfigs,
        prizes,
        votes,
        finalizations,
        awardSelections,
        winnersByContestId,
    ] = await Promise.all([
        prisma.contestRuleConfig.findMany({
            where:{contestId:{in:contestIds}},
            orderBy:{order:"asc"},
        }),
        prisma.contestAward.findMany({
            where:{contestId:{in:contestIds}, enabled:true},
            orderBy:[{order:"asc"}, {createdAt:"asc"}],
        }),
        prisma.vote.findMany({
            where:{contestId:{in:contestIds}},
            select:{contestId:true, weight:true, power:true},
        }),
        prisma.contestFinalization.findMany({
            where:{contestId:{in:contestIds}},
        }),
        prisma.contestAwardSelection.findMany({
            where:{contestId:{in:contestIds}},
            orderBy:{createdAt:"asc"},
        }),
        getContestWinnerMapForList(contests),
    ]);

    const rulesByContestId = groupByContestId(ruleConfigs);
    const prizesByContestId = groupByContestId(prizes);
    const votesByContestId = groupByContestId(votes);
    const finalizationByContestId = new Map(finalizations.map((finalization) => [finalization.contestId, finalization]));
    const selectionsByContestId = groupByContestId(awardSelections);

    return contests.map((contest) => {
        const configuredRules = rulesByContestId.get(contest.id);
        const rules = formatContestRulesForList(configuredRules?.length ? configuredRules : getDefaultContestRuleConfigsForList());
        const baseContestDetails = {
            ...contest,
            rules,
            prizes:prizesByContestId.get(contest.id) || [],
            totalVotes:(votesByContestId.get(contest.id) || []).reduce((total, vote) => total + getVoteWeight(vote), 0),
            finalization:finalizationByContestId.get(contest.id) || null,
            awardSelections:selectionsByContestId.get(contest.id) || [],
        };

        if(isCompletedContest(contest.status)){
            return {...baseContestDetails, winners:winnersByContestId.get(contest.id) || []};
        }

        return baseContestDetails;
    });
}

//Search contest by contest status
const getContestsByStatus = async (userId:string,status: ContestStatus) => {
    if(status && !Object.values(ContestStatus).includes(status)){
        throw new ApiError(httpstatus.BAD_REQUEST, "Invalid contest status")
    }

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
            include: { creator: contestListCreatorInclude },
            orderBy:{startDate:"desc"}
        });

        return enrichContestListDetails(contests);
    }

    if(status === ContestStatus.CLOSED){

        const contests = await prisma.contest.findMany({
            where:{status: ContestStatus.COMPLETED, participants:{none:{userId}}},
            include: { creator: contestListCreatorInclude },
            orderBy:{startDate:"desc"}
        });

        return enrichContestListDetails(contests);
    }

    
    const contests = await prisma.contest.findMany({
        where:{status},
        include: { creator: contestListCreatorInclude },
        orderBy:{startDate:"desc"}
    });

    return enrichContestListDetails(contests);
};


//Get all uploads of a user

const getContestUploadsByUserId = async (contestId:string, userId:string)=>{
    const userUploads = await prisma.contestPhoto.findMany({where:{contestId:contestId, photo:{userId}}, include:{photo:{select:{id:true, url:true}}}})
   const mappedPhotos  = await Promise.all(userUploads.flatMap(upload => {

    const {photo, ...rest} = upload

    return photo ? [async () => {
        const voteCount = await voteService.getVoteCount(upload.id)
        const totalVotes = voteCount + (upload.initialVotes || 0)
        const traded = upload.updatedAt.getTime() > upload.createdAt.getTime() && !upload.promoted

        return {
            ...rest,
            userPhotoId:photo.id,
            url:photo.url,
            voteCount,
            totalVotes,
            votes:totalVotes,
            vote_count:voteCount,
            total_votes:totalVotes,
            traded
        }
    }] : []
   }).map(getUpload => getUpload()))

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

    const enrichedContests = await enrichContestListDetails(contests)

    const contestDetails = enrichedContests.map (async (contest) => {
        const levelData = await getParticipantLevelData(contest.id, userId)
        const photos = await getContestUploadsByUserId(contest.id,userId)
        
        
        return {...contest, level_data:levelData, photos, uploadCount:photos.length}
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

const getContestUploadsToVote = async (userId:string, contestId:string, page?:number, limit?:number, seed?:string)=> {
     const contest = await prisma.contest.findUnique({where:{id:contestId}})
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }
    const participant = await isContestParticipantExist(userId, contestId)

    if( !participant){
        throw new ApiError(httpstatus.NOT_FOUND, "user is not in the participation list")
    }

    const teammateUserIds = await getTeammateUserIds(userId)
    const excludedUserIds = [userId, ...teammateUserIds]
    const {skip, limit:paginationLimit, page:currentPage} = paginationHelper.calculatePagination({page, limit})
    const randomSeed = seed?.trim() || createRandomSeed()
    const where:Prisma.ContestPhotoWhereInput = {
        contestId,
        photoId:{not:null},
        participant:{userId:{notIn:excludedUserIds}},
        votes:{none:{providerId:participant.userId}}
    }

    const contestUploads = await prisma.contestPhoto.findMany({
        where,
        orderBy:[{createdAt:"desc"}],
        include:{photo:{select:{id:true, url:true}}}
    })
    const promotedUploads = contest.status === ContestStatus.ACTIVE
        ? contestUploads.filter(upload => upload.promoted)
        : []
    const regularUploads = contest.status === ContestStatus.ACTIVE
        ? contestUploads.filter(upload => !upload.promoted)
        : contestUploads
    const randomizedUploads = [
        ...shuffleWithSeed(promotedUploads, `${randomSeed}:promoted`),
        ...shuffleWithSeed(regularUploads, `${randomSeed}:regular`)
    ]
    const paginatedUploads = randomizedUploads.slice(skip, skip + paginationLimit)

    const data = await Promise.all(paginatedUploads.flatMap(upload => {
        if(!upload.photo){
            return []
        }
        const photo = upload.photo
        return [async () => {
            const voteCount = await voteService.getVoteCount(upload.id)

            return {id:upload.id, url:photo.url, voteCount}
        }]
    }).map(getUpload => getUpload()))

    return {
        data,
        meta:{
            ...paginationHelper.getPaginationMetaData(currentPage, paginationLimit, contestUploads.length),
            seed:randomSeed
        }
    }
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
    return contestUploads.flatMap(upload => upload.photo ? [{url:upload.photo.url, id:upload.id}] : [])
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
    const uploads =  await Promise.all(contestUploads.flatMap(upload => {
        if(!upload.photo){
            return []
        }
        const photo = upload.photo
        return [async () => {
        const voteCount = await voteService.getVoteCount(upload.id)

        return {id:photo.id, url:photo.url, voteCount}
        }]
    }).map(getUpload => getUpload()))

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
            select:{coins:true}
        })
        if(!store || store.coins < contest.entryFeeCoins){
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
       
        ycLevels.AMATEUR,
        ycLevels.TALENTED,
        ycLevels.SUPREME,
        ycLevels.SUPERIOR,
        ycLevels.TOP_NOTCH
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
    let currentLevel = ycLevels.NEW.toString()
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

    let replacementPhotoId = photoId
    if(!replacementPhotoId){
        if(!file){
            throw new ApiError(httpstatus.BAD_REQUEST, "file is required to replace contest photo")
        }
        const uploadedPhoto = await profileService.uploadUserPhoto(userId, file)
        replacementPhotoId = uploadedPhoto.id
    }

    const replacedPhoto = await prisma.$transaction(async trx => {
        const store = await trx.userStore.findUnique({where:{userId}})
        if (!store || store.swap <= 0){
            throw new ApiError(httpstatus.BAD_REQUEST, "you does not have enough trade")
        }

        const currentContestPhoto = await trx.contestPhoto.findUnique({
            where:{id:contestPhotoId, contestId},
            include:{participant:true}
        })
        if(!currentContestPhoto){
            throw new ApiError(httpstatus.NOT_FOUND, "contest photo not found")
        }
        if(currentContestPhoto.participant.userId !== userId){
            throw new ApiError(httpstatus.FORBIDDEN, "You are not allowed to trade this contest photo")
        }

        const replacementPhoto = await trx.userPhoto.findUnique({where:{id:replacementPhotoId, userId}})
        if(!replacementPhoto){
            throw new ApiError(httpstatus.BAD_REQUEST, "One or more photos do not belong to this user")
        }

        await trx.userStore.update({
            where:{userId},
            data:{swap:{decrement:1}}
        })

        return trx.contestPhoto.update({
            where:{id:contestPhotoId},
            data:{photoId:replacementPhotoId}
        })
    })

    return replacedPhoto
    
}

const replaceContestPhoto = async (userId:string, contestId:string, contestPhotoId:string,userPhotoId:string, file:Express.Multer.File) => {
    const contestPhoto = await prisma.contestPhoto.findUnique({where:{id:contestPhotoId, participant:{userId}},include:{participant:true}})
    if(!contestPhoto){
        throw new ApiError(httpstatus.NOT_FOUND, "contest photo not found")
    }

    if(userPhotoId){
        return await replaceContestPhotoWithUserPhoto(userId, contestId, contestPhotoId, userPhotoId)
    }

    if(!file){
        throw new ApiError(httpstatus.BAD_REQUEST, "file is required to replace contest photo")
    }

    const uploadedPhoto = await profileService.uploadUserPhoto(userId, file)
    
    return await replaceContestPhotoWithUserPhoto(userId, contestId, contestPhotoId, uploadedPhoto.id)

}

const replaceContestPhotoWithUserPhoto = async (userId:string, contestId:string, contestPhotoId:string, userPhotoId:string) => {
    const contestPhoto = await prisma.contestPhoto.findUnique({where:{id:contestPhotoId, participant:{userId}},include:{participant:true}})
    if(!contestPhoto){
        throw new ApiError(httpstatus.NOT_FOUND, "contest photo not found")
    }

    const updatedContestPhoto = await prisma.contestPhoto.update({where:{id:contestPhotoId}, data:{photoId:userPhotoId}})

    return updatedContestPhoto
}


const chargePhoto = async (userId:string, contestId:string) => {
    const contest = await prisma.contest.findUnique({where:{id:contestId, status:ContestStatus.ACTIVE}})

    if (!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "Contest not found")
    }

    const participant = await prisma.contestParticipant.findUnique({where:{contestId_userId:{contestId,userId}}})
    if(!participant){
        throw new ApiError(httpstatus.NOT_FOUND, "You have not joined this contest")
    }

    const userStore = await userStoreService.getStoreData(userId)

    if(!userStore || userStore.key <= 0){
        throw new ApiError(httpstatus.NOT_FOUND, "You don't have enough charges")
    }

    await prisma.$transaction(async trx => {
        const store = await trx.userStore.findUnique({where:{userId}})
        if(!store || store.key <= 0){
            throw new ApiError(httpstatus.NOT_FOUND, "You don't have enough charges")
        }

        await trx.userStore.update({
            where:{userId},
            data:{key:{decrement:1}}
        })

        await trx.contestParticipant.update({
            where:{id:participant.id},
            data:{exposure_bonus:100}
        })
    })

    // Exposure decays per contest photo, so reset every photo's decay clock for this entry
    const contestPhotos = await prisma.contestPhoto.findMany({where:{participantId:participant.id}})
    await Promise.all(contestPhotos.map(async (photo) => {
        await agenda.cancel({name: "exposure:watcher", "data.contestPhotoId": photo.id})
        await agenda.every("1 minute", "exposure:watcher", {contestPhotoId: photo.id})
    }))

    return await prisma.contestParticipant.findUnique({where:{id:participant.id}})
}

const rankLevelTabs = ['AMATEUR', 'TALENTED', 'SUPREME', 'SUPERIOR', 'TOP_NOTCH'] as const
type RankLevelTab = typeof rankLevelTabs[number]

const normalizeRankLevel = (level?: string): RankLevelTab => {
    const normalizedLevel = level?.toUpperCase().replace(/-/g, '_') as RankLevelTab
    return rankLevelTabs.includes(normalizedLevel) ? normalizedLevel : 'AMATEUR'
}

const getDesignLevelFromYCLevel = (level?: YCLevel | null): RankLevelTab => {
    const levelMap:Record<YCLevel, RankLevelTab> = {
        [ycLevels.NEW]:'AMATEUR',
        [ycLevels.AMATEUR]:'AMATEUR',
        [ycLevels.TALENTED]:'TALENTED',
        [ycLevels.SUPREME]:'SUPREME',
        [ycLevels.SUPERIOR]:'SUPERIOR',
        [ycLevels.TOP_NOTCH]:'TOP_NOTCH'
    }

    return level ? levelMap[level] : 'AMATEUR'
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
                    user:{select:{id:true, avatar:true, country:true, fullName:true, username:true}}
                }
            },
            photo:{select:{id:true, url:true, title:true}}
        }
    })
    const uploadById = new Map(contestUploads.map(upload => [upload.id,upload]))
    const sortedUploads = ranking.photos
        .map(photo => {
            const upload = uploadById.get(photo.photoId)
            if(!upload || !upload.photo){
                return null
            }
            return {
                contestPhotoId:upload.id,
                userPhotoId:upload.photo.id,
                url:upload.photo.url,
                title:upload.photo.title,
                voteCount:photo.voteCount,
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
const getContestTopPhotographers = async (
    contestId: string,
    currentUserId?: string,
    page?: number,
    limit?: number,
    level?: string
) => {
    const contest = await prisma.contest.findUnique({
        where: { id: contestId }
    })

    if (!contest) {
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }

    const activeLevel = normalizeRankLevel(level)

    const ranking = await contestRankingService.buildContestRanking(contestId)

    const contestParticipants = await prisma.contestParticipant.findMany({
        where: {
            id: {
                in: ranking.photographers.map(
                    photographer => photographer.participantId
                )
            }
        },
        include: {
            photos: {
                select: {
                    photo: {
                        select: {
                            id: true,
                            url: true,
                            title: true
                        }
                    },
                    id: true
                }
            },
            user: {
                select: {
                    id: true,
                    avatar: true,
                    country: true,
                    fullName: true,
                    username: true
                }
            }
        }
    })

    const participantById = new Map(
        contestParticipants.map(participant => [
            participant.id,
            participant
        ])
    )

    const photoVoteCountById = new Map(
        ranking.photos.map(photo => [
            photo.photoId,
            photo.voteCount
        ])
    )

    const participantWithVote = ranking.photographers.flatMap(
        photographer => {
            const participant = participantById.get(
                photographer.participantId
            )

            if (!participant) {
                return []
            }

            return [
                {
                    participantId: participant.id,
                    rank: photographer.rank,
                    level: getDesignLevelFromYCLevel(photographer.level),
                    user: participant.user,
                    photos: participant.photos
                        .flatMap(photo =>
                            photo.photo
                                ? [
                                      {
                                          contestPhotoId: photo.id,
                                          userPhotoId: photo.photo.id,
                                          url: photo.photo.url,
                                          title: photo.photo.title,
                                          voteCount:
                                              photoVoteCountById.get(
                                                  photo.id
                                              ) || 0
                                      }
                                  ]
                                : []
                        )
                        .sort((a, b) => b.voteCount - a.voteCount),
                    totalVotes: photographer.voteCount
                }
            ]
        }
    )

    const contestTotalVotes = ranking.photographers.reduce(
        (total, participant) => total + participant.voteCount,
        0
    )

    // Only fetch following information when a user is logged in
    const followingIds = currentUserId
        ? await getFollowedUserIds(
              currentUserId,
              participantWithVote.map(participant => participant.user.id)
          )
        : new Set<string>()

    const sortedParticipant = participantWithVote
        .filter(participant => participant.level === activeLevel)
        .map((participant, idx) => ({
            ...participant,
            levelRank: idx + 1,
            user: {
                ...participant.user,
                isFollowing: currentUserId
                    ? followingIds.has(participant.user.id)
                    : false
            }
        }))

    const paginatedParticipants = paginateRankedData(
        sortedParticipant,
        page,
        limit
    )

    return {
        contestTotalVotes,
        levelTabs: rankLevelTabs,
        activeLevel,
        participants: paginatedParticipants.data,
        meta: paginatedParticipants.meta
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
    getPublicContests,
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
    getContestByUserId,
    getContestUploadsToVote,
    getContestPhotoCount,
    getContestCreateOptions,
    getContestPrizes

}
