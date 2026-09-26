import prisma from '../../../shared/prisma';
import ApiError from '../../../errors/ApiError';
import httpstatus from 'http-status';
import { fileUploader } from '../../../helpers/fileUploader';
import { AchievementKind, ContestOccurrenceStatus, ContestParticipant, ContestParticipantStatus, ContestPhoto, ContestStatus, PaymentStatus, PaymentType, Prisma, PrizeType, RecurringContest, RecurringContestStatus, RecurringType, TeamMemberStatus, YCLevel } from '../../../prismaClient';
import { contestData, updateContestData } from './contest.type';
import { contestRuleService } from './ContestRules/contestRules.service';
import { ContestRuleConfigInput } from './ContestRules/contestRules.type';
import { profileService } from '../Profile/profile.service';
import agenda from '../Agenda';
import { validateContestDate } from '../../../helpers/validateDate';
import { assertValidTimeZone, calculateNextOccurance } from '../../../helpers/nextOccurance';
import { getAwardSlotKey } from '../Awards/award.definitions';
import { getTeammateUserIds } from '../../../helpers/teammate.helper';
import { userStoreService } from '../User/UserStore/userStore.service';
import { voteService } from '../Vote/vote.service';
import { getContestUploadFiles, parseContestPhotoIds } from './contestPhotoInput';
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
import { sendMail } from '../../../shared/mailSender';
import { notificationOrchestrator } from '../Notification/notificationOrchestrator';
import { reportService } from '../Report/report.service';
import { activeContestWhere } from './contestLifecycle';
import { contestCache } from './contest.cache';
import logger from "../../../shared/logger";
import { hasLabel } from "../../../shared/labels";

const completedContestStatuses:ContestStatus[] = [ContestStatus.COMPLETED, ContestStatus.CLOSED]
const isCompletedContest = (status:ContestStatus) => completedContestStatuses.includes(status)
const contestListCreatorInclude = {omit:{password:true, accessToken:true}} as const
const contestBannerUploaderInclude = {select:{id:true, fullName:true, username:true, avatar:true, firstName:true, lastName:true}} as const
const editableContestStatuses:ContestStatus[] = [ContestStatus.NEW, ContestStatus.UPCOMING]
// Once finalization starts the photo set is frozen: rankings, grants and award
// selections all reference it.
const finalizedContestStatuses:ContestStatus[] = [ContestStatus.FINALIZING, ContestStatus.COMPLETED, ContestStatus.CLOSED]
const PROMOTION_DURATION_MS = 24 * 60 * 60 * 1000 // promoted photos stay boosted for ~24 hours
const EXPOSURE_BOOST_DURATION_MS = 60 * 60 * 1000 // a fresh submission/trade stays spotlighted for 1 hour
const EXPOSURE_BOOST_WEIGHT_MULTIPLIER = 20 // how much more likely a spotlighted photo is to surface vs. its participant-level weight alone
const EXPOSURE_MAX = 100
const EXPOSURE_DECAY_INTERVAL_MS = 60 * 1000
const EXPOSURE_DECAY_AMOUNT = 1
// "Active" tab = anything not yet concluded; "Ended" tab = finished (successfully or not).
const activeTabStatuses:ContestStatus[] = [ContestStatus.NEW, ContestStatus.UPCOMING, ContestStatus.OPEN, ContestStatus.JOINED, ContestStatus.ACTIVE, ContestStatus.FINALIZING]
const endedTabStatuses:ContestStatus[] = [ContestStatus.COMPLETED, ContestStatus.CLOSED, ContestStatus.FINALIZATION_FAILED]
type ContestTab = "active" | "ended"
// Mongo docs created before `deletedAt` existed have the field missing entirely
// (not null) - Prisma's {deletedAt: null} filter does not match "missing" on this
// connector/version, so it must also accept isSet:false or every pre-existing
// contest gets silently excluded from every list.
const notDeleted:Prisma.ContestWhereInput = {OR:[{deletedAt:null}, {deletedAt:{isSet:false}}]}

// Called after a user newly joins a contest. If they belong to a team that's
// waiting for the minimum member count before searching for a team-match
// opponent (see Team/team.service.ts), this may advance that wait into an
// active opponent search. Dynamic import avoids a static require cycle, since
// team.service.ts already statically imports contestService.
const notifyTeamMatchQueueOfContestJoin = async (userId: string, contestId: string) => {
    try {
        const membership = await prisma.teamMember.findUnique({ where: { memberId: userId } })
        if (!membership || membership.status !== TeamMemberStatus.ACTIVE) {
            return
        }

        const { teamService } = await import('../Team/team.service.js')
        await teamService.checkAndAdvanceWaitingQueue(membership.teamId, contestId)
    } catch (error) {
        logger.error({ err: error, userId, contestId }, "Failed to advance team match queue after contest join")
    }
}

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

// Randomized order for vote-serving, biased by each photo's exposure_bonus: a
// higher-exposure photo is more likely (not guaranteed) to sort earlier. Uses
// the standard "weighted reservoir" sampling key (random() ** (1/weight)) so it
// stays a true shuffle - not a strict exposure-descending sort - while still
// giving higher-exposure photos meaningfully better odds of early placement.
// getWeight defaults to a flat 1 (a plain unweighted shuffle) for callers that
// don't care about exposure.
const shuffleWithSeed = <T>(items:T[], seed:string, getWeight:(item:T) => number = () => 1) => {
    const random = seededRandom(seed)

    return items
        .map(item => {
            const weight = Math.max(getWeight(item), 1)
            const key = Math.pow(random(), 1 / weight)
            return {item, key}
        })
        .sort((a, b) => b.key - a.key)
        .map(entry => entry.item)
}

const shouldUseDefaultAwards = (body:contestData) =>
    body.prizeIds === undefined && body.prizes === undefined

const getUserDisplayName = (user?:{
    fullName?:string | null;
    username?:string | null;
    firstName?:string | null;
    lastName?:string | null;
} | null) => {
    if(!user){
        return null
    }

    return [user.firstName, user.lastName]
        .map(name => name?.trim())
        .filter(Boolean)
        .join(" ")
        || user.fullName
        || user.username
        || null
}

const getContestCardAttribution = (contest:any) => {
    const user = contest.creator
    if(!user){
        return null
    }

    return {
        source:"creator",
        displayName:getUserDisplayName(user),
        user
    }
}

// When the admin picks an existing user-submitted photo as the banner instead of
// uploading a fresh image, resolve its URL and credit the uploading user so the
// website can show attribution on the contest card.
const resolveBannerFromUserPhoto = async (userPhotoId?:string) => {
    if(!userPhotoId){
        return null
    }
    const userPhoto = await prisma.userPhoto.findUnique({
        where:{id:userPhotoId},
        select:{url:true, userId:true}
    })
    if(!userPhoto){
        throw new ApiError(httpstatus.NOT_FOUND, "Selected user photo not found")
    }
    return {banner:userPhoto.url, bannerUploaderId:userPhoto.userId}
}

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

// Lists user-submitted photos for the admin banner picker (dashboard: "choose from
// submissions" instead of uploading a fresh image).
const getBannerCandidates = async (page:number = 1, limit:number = 20, search?:string) => {
    const {skip, limit:paginationLimit, page:currentPage} = paginationHelper.calculatePagination({page, limit})
    const searchTerm = search?.trim()
    const matchingUserIds = searchTerm
        ? (await prisma.user.findMany({
            where:{
                OR:[
                    {fullName:{contains:searchTerm, mode:"insensitive" as const}},
                    {username:{contains:searchTerm, mode:"insensitive" as const}}
                ]
            },
            select:{id:true}
        })).map(user => user.id)
        : []

    const where:Prisma.UserPhotoWhereInput = {adult:false}
    if(searchTerm){
        const searchConditions:Prisma.UserPhotoWhereInput[] = [
            {title:{contains:searchTerm, mode:"insensitive" as const}}
        ]
        if(matchingUserIds.length > 0){
            searchConditions.push({userId:{in:matchingUserIds}})
        }
        where.OR = searchConditions
    }

    const [photoRows, total] = await Promise.all([
        prisma.userPhoto.findMany({
            where,
            select:{
                id:true,
                url:true,
                title:true,
                createdAt:true,
                userId:true
            },
            skip,
            take:paginationLimit,
            orderBy:{createdAt:"desc"}
        }),
        prisma.userPhoto.count({where})
    ])
    const userIds = [...new Set(photoRows.map(photo => photo.userId))]
    const users = userIds.length > 0
        ? await prisma.user.findMany({
            where:{id:{in:userIds}},
            select:{id:true, fullName:true, username:true, avatar:true}
        })
        : []
    const usersById = new Map(users.map(user => [user.id, user]))
    const photos = photoRows.map(({userId, ...photo}) => ({
        ...photo,
        user:usersById.get(userId) || null
    }))

    return {
        photos,
        total,
        page:currentPage,
        limit:paginationLimit,
        meta:paginationHelper.getPaginationMetaData(currentPage, paginationLimit, total)
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

    const bannerFromUserPhoto = await resolveBannerFromUserPhoto(body.bannerUserPhotoId)
    const bannerUrl = !bannerFromUserPhoto && banner
        ? (await fileUploader.uploadToDigitalOcean(banner)).Location
        : null

    const normalizedRules = contestRuleService.normalizeContestRules(body.rules, body.rules === undefined)
    const awardRows = await prizeService.resolveAwardRows(
        body.prizeIds || [],
        body.prizes || [],
        shouldUseDefaultAwards(body)
    )
    const levelAwards = body.levelAwards || []

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
        entryFeeAmount:body.entryFeeAmount || 0,
        entryFeeCoins:body.coinRequirement === false ? 0 : (body.entryFeeCoins || 0),
        maxUpload:contestRuleService.getSubmissionLimitFromRules(normalizedRules),
        ...(bannerFromUserPhoto
            ? {banner:bannerFromUserPhoto.banner, bannerUploaderId:bannerFromUserPhoto.bannerUploaderId}
            : (bannerUrl && {banner:bannerUrl}))
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

        if(levelAwards.length > 0){
            await tx.contestLevelAward.createMany({
                data:levelAwards.map(award => ({contestId:contest.id, ...award}))
            })
        }

        return {...contest, rules:normalizedRules, prizes:awardRows.filter(prize => prize.enabled), levelAwards}
    })
};


//manage recurring contest separately

// Materializes a recurring contest template's next occurrence into a real Contest row.
// Normally gated on the *currently active* instance's own progress: the next occurrence
// only appears (as Upcoming) once the active instance has burned through 80% of its
// runtime (i.e. 20% remains before it closes) - pass force:true to bypass that gate
// (used for the very first occurrence, which materializes immediately on creation so
// the admin sees an Upcoming contest right away instead of waiting on the cron window).
// Idempotent either way via the RecurringContestOccurrence claim below, so calling this
// and then letting the normal cron run too is always safe.
const materializeRecurringOccurrence = async (rContest:RecurringContest, options?:{force?:boolean}) => {
    const nextOccurrence = rContest.recurring.nextOccurrence;
    const generatedOccurrences = rContest.recurring.generatedOccurrences || 0
    if(
        (rContest.recurring.endsAt && nextOccurrence > rContest.recurring.endsAt) ||
        (rContest.recurring.maxOccurrences && generatedOccurrences >= rContest.recurring.maxOccurrences)
    ){
        await prisma.recurringContest.update({
            where:{id:rContest.id},
            data:{status:RecurringContestStatus.ENDED}
        })
        return
    }

    if(!options?.force){
        const previousInstance = rContest.lastGeneratedContestId
            ? await prisma.contest.findUnique({
                where:{id:rContest.lastGeneratedContestId},
                select:{startDate:true, endDate:true, status:true}
            })
            : null

        if(previousInstance?.status === ContestStatus.UPCOMING){
            // Previous occurrence hasn't even started yet - nothing to do.
            return
        }
        if(previousInstance?.status === ContestStatus.ACTIVE){
            const duration = previousInstance.endDate.getTime() - previousInstance.startDate.getTime()
            const readyAt = previousInstance.startDate.getTime() + duration * 0.8
            if(Date.now() < readyAt){
                return
            }
        }
        // Any other status (CLOSED/COMPLETED/FINALIZING/FINALIZATION_FAILED), or no
        // previous instance at all, means it's already past due - proceed below.
    }

    const occurrenceKey = `${rContest.id}:${nextOccurrence.toISOString()}`
    const occurrence = await prisma.recurringContestOccurrence.upsert({
        where:{occurrenceKey},
        update:{},
        create:{occurrenceKey, recurringContestId:rContest.id, scheduledAt:nextOccurrence}
    })

    if(occurrence.status === ContestOccurrenceStatus.MATERIALIZED){
        return
    }

    const staleBefore = new Date(Date.now() - 15 * 60 * 1000)
    const claimed = await prisma.recurringContestOccurrence.updateMany({
        where:{
            occurrenceKey,
            OR:[
                {status:{in:[ContestOccurrenceStatus.PENDING, ContestOccurrenceStatus.FAILED]}},
                {status:ContestOccurrenceStatus.MATERIALIZING, startedAt:{lte:staleBefore}}
            ]
        },
        data:{status:ContestOccurrenceStatus.MATERIALIZING, startedAt:new Date(), error:null}
    })
    if(claimed.count !== 1){
        return
    }

    try{
        const duration = rContest.recurring.duration || (rContest.endDate.getTime() - rContest.startDate.getTime())
        const endDate = new Date(nextOccurrence.getTime() + duration)
        const initialStatus = nextOccurrence <= new Date() ? ContestStatus.ACTIVE : ContestStatus.UPCOMING
        const rawRules = typeof rContest.rules === "string"
            ? JSON.parse(rContest.rules) as ContestRuleConfigInput[]
            : rContest.rules as ContestRuleConfigInput[]
        const rules = contestRuleService.normalizeContestRules(rawRules)
        const awards = await prisma.recurringContestAward.findMany({where:{recurringContestId:rContest.id}})
        const levelAwards = await prisma.recurringContestLevelAward.findMany({where:{recurringContestId:rContest.id}})
        const next = calculateNextOccurance(
            nextOccurrence,
            rContest.recurring.recurringType,
            rContest.recurring.timezone
        )

        const newContest = await prisma.$transaction(async tx => {
            const contest = await tx.contest.create({
                data:{
                    title:rContest.title,
                    banner:rContest.banner,
                    bannerUploaderId:rContest.bannerUploaderId,
                    isMoneyContest:rContest.isMoneyContest,
                    maxPrize:rContest.maxPrize,
                    minPrize:rContest.minPrize,
                    currency:rContest.currency,
                    entryFeeAmount:rContest.entryFeeAmount,
                    entryFeeCoins:rContest.entryFeeCoins,
                    category:rContest.category,
                    description:rContest.description,
                    creatorId:rContest.creatorId,
                    recurringContestId:rContest.id,
                    startDate:nextOccurrence,
                    endDate,
                    status:initialStatus,
                    maxUpload:contestRuleService.getSubmissionLimitFromRules(rules),
                    ...(initialStatus === ContestStatus.ACTIVE && {startedAt:new Date()})
                }
            })

            await tx.contestRuleConfig.createMany({
                data:rules.map(rule => ({
                    contestId:contest.id,
                    key:rule.key,
                    value:rule.value,
                    enabled:rule.enabled ?? true,
                    order:rule.order ?? 0
                }))
            })

            if(awards.length > 0){
                await tx.contestAward.createMany({
                    data:awards.map(award => ({
                        contestId:contest.id,
                        prizeId:award.prizeId,
                        category:award.category,
                        type:award.type,
                        target:award.target,
                        rankLimit:award.rankLimit,
                        slotKey:award.slotKey || getAwardSlotKey(award),
                        title:award.title,
                        description:award.description,
                        icon:award.icon,
                        key:award.key,
                        boost:award.boost,
                        swap:award.swap,
                        coin:award.coin,
                        enabled:award.enabled,
                        order:award.order
                    }))
                })
            }

            if(levelAwards.length > 0){
                await tx.contestLevelAward.createMany({
                    data:levelAwards.map(award => ({
                        contestId:contest.id,
                        level:award.level,
                        boost:award.boost,
                        swap:award.swap,
                        key:award.key,
                        coin:award.coin
                    }))
                })
            }

            await tx.recurringContestOccurrence.update({
                where:{occurrenceKey},
                data:{status:ContestOccurrenceStatus.MATERIALIZED, contestId:contest.id, error:null}
            })
            await tx.recurringContest.update({
                where:{id:rContest.id},
                data:{
                    lastGeneratedContestId:contest.id,
                    status:(
                        (rContest.recurring.endsAt && next > rContest.recurring.endsAt) ||
                        (rContest.recurring.maxOccurrences && generatedOccurrences + 1 >= rContest.recurring.maxOccurrences)
                    ) ? RecurringContestStatus.ENDED : RecurringContestStatus.ACTIVE,
                    recurring:{set:{
                        ...rContest.recurring,
                        previousOccurrence:nextOccurrence,
                        nextOccurrence:next,
                        generatedOccurrences:generatedOccurrences + 1
                    }}
                }
            })

            return contest
        })

        if(initialStatus === ContestStatus.ACTIVE){
            // Materialization is already committed. A scheduler outage must not
            // mark the occurrence failed and create a duplicate on retry; the
            // periodic contest watcher remains a recovery path.
            await agenda.schedule(endDate, "contest:watcher", {contestId:newContest.id}).catch(error => {
                logger.error({ err: error, contestId: newContest.id }, "Failed to schedule watcher for recurring contest")
            })
        }
        logger.info({ contestId: newContest.id, recurringContestId: rContest.id }, "Generated recurring contest instance")
        return newContest
    }catch(error){
        await prisma.recurringContestOccurrence.update({
            where:{occurrenceKey},
            data:{status:ContestOccurrenceStatus.FAILED, error:error instanceof Error ? error.message : String(error)}
        })
        throw error
    }
}

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
    const levelAwards = body.levelAwards || []
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
        entryFeeAmount:body.entryFeeAmount || 0,
        entryFeeCoins:body.coinRequirement === false ? 0 : (body.entryFeeCoins || 0)

    }

    contestData.rules = normalizedRules
    const bannerFromUserPhoto = await resolveBannerFromUserPhoto(body.bannerUserPhotoId)
    if(bannerFromUserPhoto){
        contestData.banner = bannerFromUserPhoto.banner
        contestData.bannerUploaderId = bannerFromUserPhoto.bannerUploaderId
    }else if(banner){
        contestData.banner = (await fileUploader.uploadToDigitalOcean(banner)).Location
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

    const created = await prisma.$transaction(async tx => {
        const recurringContest = await tx.recurringContest.create({data:contestData})
        await tx.recurringContestAward.createMany({
            data:awardRows.map(award => ({recurringContestId:recurringContest.id, ...award}))
        })

        if(levelAwards.length > 0){
            await tx.recurringContestLevelAward.createMany({
                data:levelAwards.map(award => ({recurringContestId:recurringContest.id, ...award}))
            })
        }

        return recurringContest
    })

    // Always materialize the first occurrence immediately, regardless of how far out
    // startDate is, so the admin sees it as Upcoming (or Active) right away. Every
    // later occurrence follows the normal cron-driven, active-instance-relative schedule.
    try{
        await materializeRecurringOccurrence(created, {force:true})
    }catch(error){
        logger.error({ err: error, recurringContestId: created.id }, "Failed to materialize first occurrence of recurring contest")
    }

    return {...created, prizes:awardRows, levelAwards}
}


const updateContest = async (contestId:string, contestData:updateContestData, banner?:Express.Multer.File)=>{
    const contest = await prisma.contest.findUnique({where:{id:contestId}})
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }
    if(contest.deletedAt){
        throw new ApiError(httpstatus.BAD_REQUEST, "Archived contests cannot be edited")
    }

    const lockedStatuses:ContestStatus[] = [
        ContestStatus.ACTIVE,
        ContestStatus.FINALIZING,
        ContestStatus.FINALIZATION_FAILED,
        ContestStatus.COMPLETED,
        ContestStatus.CLOSED
    ]
    if(lockedStatuses.includes(contest.status) || !editableContestStatuses.includes(contest.status)){
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
    const entryFeeAmount = contestData.entryFeeAmount ?? contest.entryFeeAmount ?? 0
    if(isMoneyContest && (!currency || minPrize > maxPrize)){
        throw new ApiError(httpstatus.BAD_REQUEST, "Money contests require valid currency and prize bounds")
    }

    const entryFeeCoins = contestData.coinRequirement === false
        ? 0
        : (contestData.entryFeeCoins ?? contest.entryFeeCoins)
    if(contestData.coinRequirement && !entryFeeCoins){
        throw new ApiError(httpstatus.BAD_REQUEST, "A positive entryFeeCoins value is required when coinRequirement is enabled")
    }

    const { prizeIds, prizes, levelAwards, rules, coinRequirement, bannerUserPhotoId, ...updatePayload } = contestData as any

    const bannerFromUserPhoto = await resolveBannerFromUserPhoto(bannerUserPhotoId)
    const bannerUrl = await (
        !bannerFromUserPhoto && banner
            ? fileUploader.uploadToDigitalOcean(banner).then(upload => upload.Location)
            : Promise.resolve(undefined)
    )
    if(bannerFromUserPhoto){
        updatePayload.banner = bannerFromUserPhoto.banner
        updatePayload.bannerUploaderId = bannerFromUserPhoto.bannerUploaderId
    }else if(bannerUrl){
        updatePayload.banner = bannerUrl
        updatePayload.bannerUploaderId = null
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

    const {updatedContest, updatedRules, updatedAwards, updatedLevelAwards} = await prisma.$transaction(async tx => {
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
                entryFeeAmount,
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

        let updatedLevelAwards
        if(levelAwards !== undefined){
            await tx.contestLevelAward.deleteMany({where:{contestId}})
            if(levelAwards.length > 0){
                await tx.contestLevelAward.createMany({
                    data:levelAwards.map((award:any) => ({contestId, ...award}))
                })
            }
            updatedLevelAwards = await tx.contestLevelAward.findMany({where:{contestId}})
        }

        return {updatedContest, updatedRules, updatedAwards, updatedLevelAwards}
    })
    await contestCache.invalidateContest(contestId)

    return {
        ...updatedContest,
        ...(updatedRules !== undefined && {rules:updatedRules}),
        ...(updatedAwards !== undefined && {prizes:updatedAwards}),
        ...(updatedLevelAwards !== undefined && {levelAwards:updatedLevelAwards})
    }
}


//soft-delete a contest by the contest id, keeping it for historical/admin records
const deleteContestByContestId =async (contestId:string)=>{
    const contest = await prisma.contest.findUnique({where:{id:contestId}})
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found!")
    }
    if(contest.deletedAt){
        throw new ApiError(httpstatus.BAD_REQUEST, "contest already deleted!")
    }
    if(!editableContestStatuses.includes(contest.status)){
        throw new ApiError(httpstatus.BAD_REQUEST, "Only upcoming contests can be deleted")
    }

    const [
        participantCount,
        photoCount,
        voteCount,
        teamParticipationCount,
        teamMatchCount,
        teamMatchQueueCount
    ] = await Promise.all([
        prisma.contestParticipant.count({where:{contestId}}),
        prisma.contestPhoto.count({where:{contestId}}),
        prisma.vote.count({where:{contestId}}),
        prisma.teamParticipation.count({where:{contestId}}),
        prisma.teamMatch.count({where:{contestId}}),
        prisma.teamMatchQueue.count({where:{contestId}})
    ])

    if(
        participantCount > 0 ||
        photoCount > 0 ||
        voteCount > 0 ||
        teamParticipationCount > 0 ||
        teamMatchCount > 0 ||
        teamMatchQueueCount > 0
    ){
        throw new ApiError(httpstatus.BAD_REQUEST, "Contest cannot be deleted after participation has started")
    }

    const deleted = await prisma.contest.updateMany({
        where:{id:contestId, status:{in:editableContestStatuses}, ...notDeleted},
        data:{deletedAt:new Date()}
    })
    if(deleted.count !== 1){
        throw new ApiError(httpstatus.BAD_REQUEST, "Contest can no longer be deleted")
    }
    return "contest deleted!"
}


// add a user to the contest participant list

const joinContest = async (userId:string,contestId:string, acceptedRuleKeys?:unknown)=>{
    const contest = await prisma.contest.findFirst({where:{id:contestId, ...activeContestWhere()}})

    if (!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "Contest is not available to participate")
    }

    const existingParticipant = await prisma.contestParticipant.findUnique({where:{contestId_userId:{contestId,userId}}})

    if(existingParticipant){
        return {contest_id:contestId, participant_id:existingParticipant.id}
    }

    await contestRuleEngine.validateJoinRules(contestId, userId, acceptedRuleKeys)

    if(contest.entryFeeAmount > 0){
        throw new ApiError(httpstatus.PAYMENT_REQUIRED, "Stripe payment is required to enter this contest")
    }

    const participant = await prisma.$transaction(async tx => {
        const participant = await tx.contestParticipant.findUnique({
            where:{contestId_userId:{contestId,userId}}
        })
        if(participant){
            return participant
        }

        const activeContest = await tx.contest.findFirst({
            where:{id:contestId, ...activeContestWhere()},
            select:{id:true, entryFeeCoins:true}
        })
        if(!activeContest){
            throw new ApiError(httpstatus.BAD_REQUEST, "Contest is no longer accepting participants")
        }

        await chargeContestEntryFee(tx, activeContest, userId)
        return tx.contestParticipant.create({
            data:{contestId, userId, exposure_bonus:0, exposureUpdatedAt:new Date()}
        })
    })

    await notifyTeamMatchQueueOfContestJoin(userId, contestId)

    return {contest_id:contestId, participant_id:participant.id}

}

const completePaidContestJoin = async (
    userId:string,
    contestId:string,
    paymentId:string,
    stripePaymentId?:string
) => {
    const completion = await prisma.$transaction(async tx => {
        const payment = await tx.payment.findUnique({where:{id:paymentId}})
        if(!payment){
            throw new ApiError(httpstatus.NOT_FOUND, "Payment not found")
        }
        if(payment.userId !== userId || payment.contestId !== contestId){
            throw new ApiError(httpstatus.BAD_REQUEST, "Payment does not match this contest entry")
        }
        if(payment.type !== PaymentType.CONTEST){
            throw new ApiError(httpstatus.BAD_REQUEST, "Payment is not a contest entry payment")
        }
        if(payment.status !== PaymentStatus.PENDING && payment.status !== PaymentStatus.SUCCEEDED){
            throw new ApiError(httpstatus.BAD_REQUEST, "Contest entry payment is not eligible for completion")
        }

        const contest = await tx.contest.findUnique({
            where:{id:contestId},
            select:{id:true, status:true, entryFeeAmount:true, currency:true, entryFeeCoins:true}
        })
        if(!contest || contest.status !== ContestStatus.ACTIVE){
            throw new ApiError(httpstatus.BAD_REQUEST, "Contest is no longer accepting participants")
        }
        if(contest.entryFeeAmount <= 0){
            throw new ApiError(httpstatus.BAD_REQUEST, "This contest does not require Stripe entry payment")
        }
        if(payment.amount !== contest.entryFeeAmount){
            throw new ApiError(httpstatus.BAD_REQUEST, "Payment amount does not match the contest entry fee")
        }

        const alreadyCompleted = payment.status === PaymentStatus.SUCCEEDED
        if(!alreadyCompleted){
            const transitioned = await tx.payment.updateMany({
                where:{id:paymentId, status:PaymentStatus.PENDING},
                data:{
                    status:PaymentStatus.SUCCEEDED,
                    ...(stripePaymentId ? {stripe_payment_id:stripePaymentId} : {})
                }
            })
            if(transitioned.count !== 1){
                throw new ApiError(httpstatus.CONFLICT, "Contest entry payment is already being completed")
            }
        }

        await chargeContestEntryFee(tx, contest, userId)

        const existingParticipant = await tx.contestParticipant.findUnique({
            where:{contestId_userId:{contestId,userId}}
        })
        if(existingParticipant){
            return {participant:existingParticipant, alreadyCompleted, participantCreated:false}
        }

        const participant = await tx.contestParticipant.create({
            data:{contestId, userId, exposure_bonus:0, exposureUpdatedAt:new Date()}
        })
        return {participant, alreadyCompleted, participantCreated:true}
    })

    if(completion.participantCreated){
        await notifyTeamMatchQueueOfContestJoin(userId, contestId)
    }

    return {
        contest_id:contestId,
        participant_id:completion.participant.id,
        alreadyCompleted:completion.alreadyCompleted
    }
}


// Everything on the contest detail page except the contest row and the vote
// total. Cached in Redis per contest (see contest.cache.ts); the writers of
// these tables call contestCache.invalidateContest.
const loadContestDetailExtras = async (contest:{id:string; status:string}) => {
    const [rules, prizes, levelAwards, finalization, awardSelections, winners] = await Promise.all([
        contestRuleService.getContestRules(contest.id),
        prizeService.getContestAwards(contest.id),
        prisma.contestLevelAward.findMany({where:{contestId:contest.id}}),
        prisma.contestFinalization.findUnique({where:{contestId:contest.id}}),
        contestFinalizationService.getContestAwardSelections(contest.id),
        isCompletedContest(contest.status as ContestStatus) ? loadContestWinners(contest.id) : Promise.resolve(undefined)
    ])
    return {rules, prizes, levelAwards, finalization, awardSelections, winners}
}

const buildContestDetails = async <T extends {id:string; status:ContestStatus}>(contest:T) => {
    const [{winners, ...extras}, totalVotes] = await Promise.all([
        contestCache.getOne("detail", contest, loadContestDetailExtras),
        voteService.getContestTotalVotes(contest.id)
    ])
    const baseContestDetails = {...contest, cardAttribution:getContestCardAttribution(contest), ...extras, totalVotes}

    return isCompletedContest(contest.status) ? {...baseContestDetails, winners} : baseContestDetails
}

const getContestByUserId = async ( userId:string, contestId: string) => {
    const contest = await prisma.contest.findFirst({
        where: { id: contestId, ...notDeleted },
        include: {
            creator: {omit:{password:true, accessToken:true}},
            bannerUploader: contestBannerUploaderInclude
        }
    });
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }

    const contestDetails = await buildContestDetails(contest)

    if(isCompletedContest(contest.status)){
        return contestDetails;
    }

    if( (await isContestParticipantExist(userId, contestId)) && (contest.status === ContestStatus.ACTIVE)){
        const contestPhotoCount =  await prisma.contestPhoto.count({where:{contestId, photo:{userId}}})

        return {...contestDetails, joined:true, uploadCount:contestPhotoCount}
    }


    return {...contestDetails, joined:false};
}


//get the contest by it's id

const getContestById = async ( contestId: string) => {
    const contest = await prisma.contest.findUnique({
        where: { id: contestId },
        include: {
            creator: {omit:{password:true, accessToken:true}},
            bannerUploader: contestBannerUploaderInclude
        }
    });
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }

    return buildContestDetails(contest)
}



//Return all the contests
const getAllContests = async (
    page:number = 1,
    limit:number = 20,
    search?:string,
    status?:ContestStatus,
    includeArchived = false,
    tab?:ContestTab
) => {

    const {skip, limit:paginationLimit, page:currentPage} = paginationHelper.calculatePagination({page, limit})
    const where:Prisma.ContestWhereInput = {
        ...(status && {status}),
        ...(tab && {status:{in: tab === "active" ? activeTabStatuses : endedTabStatuses}}),
        ...(search && {title:{contains:search, mode:"insensitive" as const}}),
        ...(includeArchived ? {} : notDeleted)
    }

    const [contests, total] = await Promise.all([
        prisma.contest.findMany({    
            where,
            include: { creator: {omit:{password:true, accessToken:true}}, bannerUploader: contestBannerUploaderInclude},
            skip,
            take:paginationLimit,
            orderBy:[{startDate:"desc"}, {id:"desc"}]
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
        ...(search && {title:{contains:search, mode:"insensitive" as const}}),
        ...notDeleted
    }

    // Running contests are ranked by the one ending soonest, upcoming ones by the
    // one starting soonest - both mirror the countdown shown on the contest card.
    const orderBy:Prisma.ContestOrderByWithRelationInput[] = status === ContestStatus.ACTIVE
        ? [{endDate:"asc"}, {id:"asc"}]
        : status === ContestStatus.UPCOMING
            ? [{startDate:"asc"}, {id:"asc"}]
            : [{startDate:"desc"}, {id:"desc"}]

    const [contests, total] = await Promise.all([
        prisma.contest.findMany({
            where,
            include:{creator:{omit:{password:true, accessToken:true}}, bannerUploader:contestBannerUploaderInclude},
            skip,
            take:paginationLimit,
            orderBy
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

// Per-contest list-card data except the vote total. Loaded in one batch for
// every contest the Redis cache missed.
const loadContestListExtras = async (contests:{id:string; status:string}[]) => {
    const contestIds = contests.map((contest) => contest.id);

    const [
        ruleConfigs,
        prizes,
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
        prisma.contestFinalization.findMany({
            where:{contestId:{in:contestIds}},
        }),
        prisma.contestAwardSelection.findMany({
            where:{contestId:{in:contestIds}},
            orderBy:{createdAt:"asc"},
        }),
        getContestWinnerMapForList(contests as {id:string; status:ContestStatus}[]),
    ]);

    const rulesByContestId = groupByContestId(ruleConfigs);
    const prizesByContestId = groupByContestId(prizes);
    const finalizationByContestId = new Map(finalizations.map((finalization) => [finalization.contestId, finalization]));
    const selectionsByContestId = groupByContestId(awardSelections);

    return new Map(contests.map((contest) => {
        const configuredRules = rulesByContestId.get(contest.id);
        return [contest.id, {
            rules:formatContestRulesForList(configuredRules?.length ? configuredRules : getDefaultContestRuleConfigsForList()),
            prizes:prizesByContestId.get(contest.id) || [],
            finalization:finalizationByContestId.get(contest.id) || null,
            awardSelections:selectionsByContestId.get(contest.id) || [],
            winners:winnersByContestId.get(contest.id) || [],
        }];
    }));
}

const enrichContestListDetails = async (contests:any[]) => {
    const contestIds = contests.map((contest) => contest.id);

    if(contestIds.length === 0){
        return [];
    }

    // The contest rows come from the caller's live query, so status, dates and
    // membership filters are always current; only the per-contest extras are
    // cached, and vote totals are always counted live.
    const [extrasByContestId, voteGroups] = await Promise.all([
        contestCache.getMany("list", contests, loadContestListExtras),
        // Votes counted with voting power, like every other vote total.
        prisma.vote.groupBy({
            by:["contestId"],
            where:{contestId:{in:contestIds}},
            _sum:{power:true},
        }),
    ]);
    const voteCountByContestId = new Map(voteGroups.map(group => [group.contestId, group._sum.power ?? 0]));

    return contests.map((contest) => {
        const {winners, ...extras} = extrasByContestId.get(contest.id)!;
        const baseContestDetails = {
            ...contest,
            cardAttribution:getContestCardAttribution(contest),
            rules:extras.rules,
            prizes:extras.prizes,
            totalVotes:voteCountByContestId.get(contest.id) || 0,
            finalization:extras.finalization,
            awardSelections:extras.awardSelections,
        };

        if(isCompletedContest(contest.status)){
            return {...baseContestDetails, winners};
        }

        return baseContestDetails;
    });
}

//Search contest by contest status
const getContestsByStatus = async (userId:string, status:ContestStatus, page:number = 1, limit:number = 20) => {
    if(status && !Object.values(ContestStatus).includes(status)){
        throw new ApiError(httpstatus.BAD_REQUEST, "Invalid contest status")
    }

    const {skip, limit:paginationLimit, page:currentPage} = paginationHelper.calculatePagination({page, limit})
    const paginated = <T>(contests:T[], total:number) => ({
        contests,
        total,
        page:currentPage,
        limit:paginationLimit,
        meta:paginationHelper.getPaginationMetaData(currentPage, paginationLimit, total)
    })

    if(status === ContestStatus.COMPLETED){
        const {contests:completedContests, total} = await getMyCompletedContest(userId, skip, paginationLimit)

        return paginated(completedContests, total)
    }

    // Every order ends on id so pages never overlap or skip contests that
    // share the same start/end date.
    const {where, orderBy} = ((): {where:Prisma.ContestWhereInput; orderBy:Prisma.ContestOrderByWithRelationInput[]} => {
        switch(status){
            case ContestStatus.ACTIVE:
                // Running contests are ranked by urgency - the one closing soonest
                // sits first, matching the "time left" countdown on the open cards.
                return {
                    where:{status, participants:{none:{userId}}, ...notDeleted},
                    orderBy:[{endDate:"asc"}, {id:"asc"}]
                }
            case ContestStatus.CLOSED:
                return {
                    where:{status:ContestStatus.COMPLETED, participants:{none:{userId}}, ...notDeleted},
                    orderBy:[{endDate:"desc"}, {id:"desc"}]
                }
            case ContestStatus.UPCOMING:
                return {
                    where:{status, participants:{none:{userId}}, ...notDeleted},
                    orderBy:[{startDate:"asc"}, {id:"asc"}]
                }
            default:
                return {
                    where:{status, ...notDeleted},
                    orderBy:[{startDate:"desc"}, {id:"desc"}]
                }
        }
    })()

    const [contests, total] = await Promise.all([
        prisma.contest.findMany({
            where,
            include: { creator: contestListCreatorInclude, bannerUploader: contestBannerUploaderInclude },
            orderBy,
            skip,
            take:paginationLimit
        }),
        prisma.contest.count({where})
    ])

    return paginated(await enrichContestListDetails(contests), total)
};

//Get all uploads of a user

const sortByVotesThenUploadSequence = <T extends {id:string; createdAt:Date; votes?:number; totalVotes?:number; voteCount?:number}>(uploads:T[]) => {
    return uploads.sort((left, right) => {
        const leftVotes = left.votes ?? left.totalVotes ?? left.voteCount ?? 0
        const rightVotes = right.votes ?? right.totalVotes ?? right.voteCount ?? 0

        if(rightVotes !== leftVotes){
            return rightVotes - leftVotes
        }

        return left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id)
    })
}

const getContestUploadsByUserId = async (contestId:string, userId:string)=>{
    const [userUploads, ranking] = await Promise.all([
        prisma.contestPhoto.findMany({where:{contestId:contestId, photo:{userId}}, orderBy:[{createdAt:"asc"}, {id:"asc"}], include:{photo:{select:{id:true, url:true}}}}),
        // One ranking read rather than two queries per uploaded photo, and the
        // totals shown here are the same ones the leaderboard uses.
        contestRankingService.buildContestRanking(contestId)
    ])
    const rankedPhotoById = new Map(ranking.photos.map(photo => [photo.photoId, photo] as const))

    const mappedPhotos = userUploads.flatMap(upload => {

        const {photo, ...rest} = upload
        if(!photo){
            return []
        }

        // initialVotes is a baseline for the photo this slot originally launched with -
        // it shouldn't follow a later swapped-in photo (see originalPhotoId/photoRefId).
        const stillOriginalPhoto = !upload.originalPhotoId || upload.originalPhotoId === upload.photoId
        const initialVotes = stillOriginalPhoto ? (upload.initialVotes || 0) : 0
        const totalVotes = rankedPhotoById.get(upload.id)?.score ?? 0
        const voteCount = Math.max(totalVotes - initialVotes, 0)
        const traded = upload.updatedAt.getTime() > upload.createdAt.getTime() && !upload.promoted

        return [{
            ...rest,
            userPhotoId:photo.id,
            url:photo.url,
            voteCount,
            totalVotes,
            votes:totalVotes,
            vote_count:voteCount,
            total_votes:totalVotes,
            traded
        }]
    })

    return sortByVotesThenUploadSequence(mappedPhotos)
}


const deleteContestUploadById = async (contestId:string, userId:string, photoId:string)=>{

    const contest = await prisma.contest.findFirst({where:{id:contestId, ...activeContestWhere()}})
    if(!contest){
        throw new ApiError(httpstatus.CONFLICT, "Contest submissions can no longer be changed")
    }
    const contestUpload = await prisma.contestPhoto.findFirst({where:{id:photoId, contestId, photoId:{not:null}}, include:{participant:true}})
    if(!contestUpload){
        throw new ApiError(httpstatus.NOT_FOUND, "Contest upload not found")
    }
    if (contestUpload.participant.userId !== userId){
        throw new ApiError(httpstatus.FORBIDDEN, "You are not allowed to delete this contest upload")
    }
    await prisma.$transaction(async tx => {
        const guard = await tx.contest.updateMany({
            where:{id:contestId, ...activeContestWhere()},
            data:{updatedAt:new Date()}
        })
        if(guard.count !== 1){
            throw new ApiError(httpstatus.CONFLICT, "Contest submissions can no longer be changed")
        }
        // Keep the slot as a tombstone so existing votes, comments and audit
        // records remain valid. Rankings already ignore slots without a photo.
        await tx.contestPhoto.update({
            where:{id:photoId},
            data:{photoId:null, promoted:false, promotionExpiresAt:null, exposureBoostExpiresAt:null}
        })
    })
    contestRankingService.invalidateContestRanking(contestId)
    return "Contest upload deleted successfully"
 }

// Admin moderation delete: unlike deleteContestUploadById this has no owner check,
// always emails the photo's owner, and never touches the user's block status -
// banning stays a separate, manual admin action (Dashboard toggle-block).
const adminDeleteContestPhoto = async (photoId:string, adminId:string, reason?:string, reportId?:string) => {
    const contestUpload = await prisma.contestPhoto.findUnique({
        where:{id:photoId},
        include:{
            participant:{include:{user:{select:{id:true, email:true, fullName:true, username:true}}}}
        }
    })

    if(!contestUpload){
        throw new ApiError(httpstatus.NOT_FOUND, "Contest upload not found")
    }

    const contest = await prisma.contest.findUnique({where:{id:contestUpload.contestId}, select:{title:true, status:true}})
    if(!contest || finalizedContestStatuses.includes(contest.status)){
        throw new ApiError(httpstatus.CONFLICT, "A photo cannot be removed after finalization starts")
    }

    await prisma.contestPhoto.update({
        where:{id:photoId},
        data:{photoId:null, promoted:false, promotionExpiresAt:null, exposureBoostExpiresAt:null}
    })
    contestRankingService.invalidateContestRanking(contestUpload.contestId)

    const owner = contestUpload.participant.user
    const contestTitle = contest?.title || "the contest"

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="text-align: center; border-bottom: 2px solid #0056b3; padding-bottom: 15px;">
          <h2 style="color: #0056b3; margin: 0;">Contest Photo Removed</h2>
        </div>
        <div style="padding: 20px 0; line-height: 1.6; color: #333;">
          <p>Dear <strong>${owner.fullName || owner.username || "user"}</strong>,</p>
          <p>Your submission to <strong>"${contestTitle}"</strong> has been removed by an admin.</p>
          ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ""}
          <p>This does not affect your account status. If you have questions, please contact support.</p>
        </div>
      </div>
    `

    sendMail({to:owner.email, subject:`Your contest photo was removed`, html:emailHtml}).catch((err) => {
        logger.error({ err }, "Failed to send contest photo removal email")
    })

    await notificationOrchestrator.notifyContestPhotoRemoved(owner.id, contestUpload.contestId, contestTitle, reason)

    if(reportId){
        await reportService.markActionTaken(reportId, adminId, reason)
    }

    return "Contest photo removed successfully"
}




// Get all the contests
// This will be used to display all the contests in the contest page

const getMyActiveContests = async (userId:string) => {

    // Order by when the user joined each contest (latest joined first) rather than
    // any contest field - joining is tracked on ContestParticipant.createdAt.
    const participants = await prisma.contestParticipant.findMany({
        where:{userId, contest:{status:ContestStatus.ACTIVE}},
        orderBy:{createdAt:"desc"},
        select:{contestId:true}
    })
    const joinOrder = participants.map(participant => participant.contestId)

    const contests = await prisma.contest.findMany({
        where:{status:ContestStatus.ACTIVE, participants:{some:{userId}}},
        include: { creator: {select:{id:true, avatar:true,fullName:true,cover:true, firstName:true, lastName:true}}, bannerUploader: contestBannerUploaderInclude}
    });

    const contestById = new Map(contests.map(contest => [contest.id, contest]))
    const orderedContests = joinOrder
        .map(contestId => contestById.get(contestId))
        .filter((contest): contest is typeof contests[number] => Boolean(contest))

    const enrichedContests = await enrichContestListDetails(orderedContests)

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
        include: { creator: {select:{id:true, avatar:true,fullName:true,cover:true, firstName:true, lastName:true}}, bannerUploader: contestBannerUploaderInclude}
    });
    return contests.map(contest => ({...contest, cardAttribution:getContestCardAttribution(contest)}));
};

//Get my contests which are completed

const COMPLETED_CARD_TTL_SECONDS = 60 * 60

const loadCompletedContestCard = async (contestId:string, userId:string) => {
    const [details, participantPhotos, achievements, levelData] = await Promise.all([
        getContestById(contestId),
        getContestUploadsByUserId(contestId, userId),
        achievementService.getMyAchievementsByContest(userId, contestId),
        getParticipantLevelData(contestId, userId)
    ])
    const photos = await Promise.all(participantPhotos.map(async photo => ({
        ...photo,
        voteCount:await voteService.getVoteCount(photo.id)
    })))
    const totalVotes = photos.reduce((pre, photo) => photo.voteCount + pre, 0)

    return {...details, photos, totalVotes, achievements, rank:levelData.currentLevel}
}

const getMyCompletedContest = async (userId:string, skip?:number, take?:number) => {

    if (!userId){
        throw new ApiError(httpstatus.BAD_REQUEST, "User id is not provided")
    }
    const user = await prisma.user.findUnique({where:{id:userId}})

    if (!user){
        throw new ApiError(httpstatus.NOT_FOUND, "User not found")
    }

    // Paginate before the per-contest detail/photo/achievement loads below -
    // those run several queries per contest.
    const where:Prisma.ContestWhereInput = {status:{in:completedContestStatuses}, participants:{some:{userId}}, ...notDeleted}
    const [myParticipatedContest, total] = await Promise.all([
        prisma.contest.findMany({where, orderBy:[{endDate:"desc"}, {id:"desc"}], skip, take}),
        prisma.contest.count({where})
    ])

    // A finished contest's card is frozen - votes are rejected once it leaves
    // the active states and photos cannot be removed after finalization - so
    // the whole per-user card is cached. Anything that can still change it
    // (finalization, awards, selections, achievements) bumps the contest's
    // cache version.
    const cardsByContestId = await contestCache.getMany(
        "completedCard",
        myParticipatedContest,
        async (contests) => new Map(await Promise.all(
            contests.map(async contest => [contest.id, await loadCompletedContestCard(contest.id, userId)] as const)
        )),
        {scope:userId, ttlSeconds:COMPLETED_CARD_TTL_SECONDS}
    )
    const mappetdCompletedContest = myParticipatedContest.map(contest => cardsByContestId.get(contest.id)!)

    return {contests:mappetdCompletedContest, total}
}



const getContestPrizes = async (contestId:string) => prizeService.getContestAwards(contestId)

const getContestWinners = async (contestId:string) => {
    const contest = await prisma.contest.findFirst({where:{id:contestId, status:{in:completedContestStatuses}}})

    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }

    return contestCache.getOne("winners", contest, () => loadContestWinners(contestId))
}

const loadContestWinners = async (contestId:string) => {
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
        where:{contestId, kind:AchievementKind.CONTEST_AWARD},
        include:{participant:{include:{user:{select:{avatar:true, fullName:true, firstName:true, lastName:true}}}}}
    })
}


// Fetch completed contest details with winner
const getClosedContestsWithWinner = async () => {
    const contests = await prisma.contest.findMany({
        where: { status: {in:completedContestStatuses} },
        include: {
            creator: true,
            bannerUploader: contestBannerUploaderInclude,
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
            cardAttribution:getContestCardAttribution(contest),
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
    const userPhotos = await prisma.userPhoto.findMany({where:{userId, contestUpload:{none:{contestId}}}, select:{id:true, url:true, labels:true}})
    
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
     const contest = await prisma.contest.findFirst({where:{id:contestId, ...activeContestWhere()}})
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }
    const participant = await isContestParticipantExist(userId, contestId)

    if( !participant || participant.status !== ContestParticipantStatus.ACTIVE){
        throw new ApiError(httpstatus.NOT_FOUND, "user is not in the participation list")
    }

    const teammateUserIds = await getTeammateUserIds(userId)
    const excludedUserIds = [userId, ...teammateUserIds]
    const {skip, limit:paginationLimit, page:currentPage} = paginationHelper.calculatePagination({page, limit})
    const randomSeed = seed?.trim() || createRandomSeed()
    const where:Prisma.ContestPhotoWhereInput = {
        contestId,
        photoId:{not:null},
        participant:{userId:{notIn:excludedUserIds}, status:ContestParticipantStatus.ACTIVE},
        votes:{none:{providerId:participant.userId}}
    }

    // The seeded shuffle needs every candidate to keep pagination stable across
    // pages, so this deliberately reads the whole eligible set - but only the
    // handful of columns the weighting needs. Photo rows are joined in later for
    // the single page actually being returned.
    const contestUploads = await prisma.contestPhoto.findMany({
        where,
        orderBy:[{createdAt:"desc"}, {id:"desc"}],
        select:{
            id:true,
            promoted:true,
            promotionExpiresAt:true,
            exposureBoostExpiresAt:true,
            participant:{select:{exposure_bonus:true}}
        }
    })
    const now = new Date()
    const promotedUploads = contest.status === ContestStatus.ACTIVE
        ? contestUploads.filter(upload => upload.promoted && upload.promotionExpiresAt && upload.promotionExpiresAt > now)
        : []
    const regularUploads = contest.status === ContestStatus.ACTIVE
        ? contestUploads.filter(upload => !upload.promoted || !upload.promotionExpiresAt || upload.promotionExpiresAt <= now)
        : contestUploads
    // Base weight comes from the participant's own exposure_bonus (their
    // voting-activity reward, decayed over time). A photo still within its
    // 1-hour post-submission/trade spotlight window (exposureBoostExpiresAt)
    // gets that weight multiplied way up, so fresh/traded-in photos dominate
    // the queue for a while regardless of the photographer's own history -
    // once the window passes, it's back to just the participant-level weight.
    const exposureWeight = (upload:(typeof contestUploads)[number]) => {
        const participantWeight = Math.max(upload.participant?.exposure_bonus ?? 0, 1)
        const isSpotlighted = Boolean(upload.exposureBoostExpiresAt && upload.exposureBoostExpiresAt.getTime() > Date.now())
        return isSpotlighted ? participantWeight * EXPOSURE_BOOST_WEIGHT_MULTIPLIER : participantWeight
    }
    const randomizedUploads = [
        ...shuffleWithSeed<(typeof contestUploads)[number]>(promotedUploads, `${randomSeed}:promoted`, exposureWeight),
        ...shuffleWithSeed<(typeof contestUploads)[number]>(regularUploads, `${randomSeed}:regular`, exposureWeight)
    ]
    const paginatedUploads = randomizedUploads.slice(skip, skip + paginationLimit)

    const [pagePhotos, ranking] = await Promise.all([
        prisma.contestPhoto.findMany({
            where:{id:{in:paginatedUploads.map(upload => upload.id)}},
            select:{id:true, photo:{select:{id:true, url:true}}}
        }),
        contestRankingService.buildContestRanking(contestId)
    ])
    const photoByContestPhotoId = new Map(pagePhotos.map(upload => [upload.id, upload.photo] as const))
    const scoreByContestPhotoId = new Map(ranking.photos.map(photo => [photo.photoId, photo.score] as const))

    const data = paginatedUploads.flatMap(upload => {
        const photo = photoByContestPhotoId.get(upload.id)
        if(!photo){
            return []
        }

        return [{
            id:upload.id,
            contestPhotoId:upload.id,
            photoId:photo.id,
            url:photo.url,
            voteCount:scoreByContestPhotoId.get(upload.id) ?? 0
        }]
    })

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


    const contestUploads = await prisma.contestPhoto.findMany({where:{contestId, votes:{none:{providerId:participant.userId}}}, orderBy:[{createdAt:"asc"}, {id:"asc"}], include:{photo:{select:{id:true, url:true}}}})

    const uploads = await Promise.all(contestUploads.flatMap(upload => {
        if(!upload.photo){
            return []
        }

        return [async () => ({
            url:upload.photo!.url,
            id:upload.id,
            createdAt:upload.createdAt,
            voteCount:await getContestPhotoVoteScore(upload)
        })]
    }).map(getUpload => getUpload()))

    return sortByVotesThenUploadSequence(uploads).map(upload => ({
        url:upload.url,
        id:upload.id
    }))
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


    const contestUploads = await prisma.contestPhoto.findMany({where:{contestId, votes:{none:{providerId:participant.userId}}}, orderBy:[{createdAt:"asc"}, {id:"asc"}], include:{photo:{select:{id:true, url:true}}}})
    const uploads =  await Promise.all(contestUploads.flatMap(upload => {
        if(!upload.photo){
            return []
        }
        const photo = upload.photo
        return [async () => {
        const voteCount = await getContestPhotoVoteScore(upload)

        return {
            id:upload.id,
            contestPhotoId:upload.id,
            photoId:photo.id,
            url:photo.url,
            voteCount,
            createdAt:upload.createdAt
        }
        }]
    }).map(getUpload => getUpload()))

    return sortByVotesThenUploadSequence(uploads).map(upload => ({
        id:upload.id,
        contestPhotoId:upload.contestPhotoId,
        photoId:upload.photoId,
        url:upload.url,
        voteCount:upload.voteCount
    }))
}




//Upload photo to a contest, user can upload photo from pforile or can upload directly from computer

// Undoes the profile-pool photos a rejected contest submission created, so a
// failed entry never leaves a stray photo in the user's gallery or a stray
// object in storage. Photos the user picked from their existing pool are not
// passed here and are never removed.
const rollbackUploadedContestPhotos = async (
    created:{userPhotoId:string; file:Express.Multer.File}[]
) => {
    if(created.length === 0){
        return
    }
    try{
        await prisma.userPhoto.deleteMany({where:{id:{in:created.map(item => item.userPhotoId)}}})
    }catch(error){
        logger.error({ err: error }, "Failed to roll back contest submission photos")
        return
    }
    await Promise.all(created.map(async ({file}) => {
        file.claimed = false
        await fileUploader.discardUploadedFile(file)
    }))
}

const uploadPhotoToContest = async (contestId:string,userId:string, photoIds:unknown, files:Express.Multer.File[], acceptedRuleKeys?:unknown)=>{

    if(!contestId){
        throw new ApiError(httpstatus.BAD_REQUEST, "contest id is required")
    }
    const contest = await prisma.contest.findFirst({where:{id:contestId, ...activeContestWhere()}})

    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found or contest closed")
    }

    let user = await prisma.user.findUnique({where:{id:userId}})

    if(!user){
        throw new ApiError(httpstatus.NOT_FOUND, "user not found")
    }

    const contestParticipant = await prisma.contestParticipant.findUnique({where:{contestId_userId:{contestId,userId}}})
    const isJoiningThroughUpload = !contestParticipant
    // A file and profile-photo IDs are alternative inputs. Multipart fields are
    // strings, so JSON-encoded arrays must be decoded before they reach Prisma.
    // In particular, never query MongoDB with the common placeholder value
    // `photoIds: "[]"` when a real file was supplied.
    const parsedPhotoIds = files.length > 0 ? [] : parseContestPhotoIds(photoIds)

    await contestRuleEngine.validateUploadRules({
        contestId,
        userId,
        participantId:contestParticipant?.id,
        files,
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
    if(isJoiningThroughUpload && contest.entryFeeAmount > 0){
        throw new ApiError(httpstatus.PAYMENT_REQUIRED, "Stripe payment is required to enter this contest")
    }

    let selectedPhotoIds:string[] = []
    // Photos created by this request specifically. If the contest write fails
    // these are rolled back, so a rejected submission leaves nothing behind in
    // the user's photo pool or in object storage. Photos picked from the
    // existing pool are never touched.
    const photosCreatedHere:{userPhotoId:string; file:Express.Multer.File}[] = []
    if(files.length > 0){
        // Keep storage pressure predictable for a full four-photo entry. Four
        // simultaneous S3 uploads could fail at the boundary while smaller
        // batches succeeded, and the raw provider error became a 500.
        for(const file of files){
            let uploadedPhoto
            try{
                uploadedPhoto = await profileService.uploadUserPhoto(userId, file)
            }catch{
                await rollbackUploadedContestPhotos(photosCreatedHere)
                throw new ApiError(
                    httpstatus.BAD_GATEWAY,
                    `Unable to upload ${file.originalname}. Please try again`
                )
            }
            selectedPhotoIds.push(uploadedPhoto.id)
            photosCreatedHere.push({userPhotoId:uploadedPhoto.id, file})
        }
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
    const images = await runContestSubmission()
    contestRankingService.invalidateContestRanking(contestId)

    if(isJoiningThroughUpload){
        // The entry itself is committed. A queue notification failure must not
        // surface as a failed submission or trigger the upload rollback.
        await notifyTeamMatchQueueOfContestJoin(userId, contestId).catch(error => {
            logger.error({ err: error, contestId }, "Failed to notify team match queue")
        })
    }

    return images

    async function runContestSubmission(){
      try{
        return await prisma.$transaction(async tx => {
            const activeContest = await tx.contest.findFirst({where:{id:contestId, ...activeContestWhere()}})
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
                participant = await tx.contestParticipant.create({
                    data:{contestId, userId, exposure_bonus:0, exposureUpdatedAt:new Date()}
                })
            }
            if(submissionLimit !== null){
                const existingUploadCount = await tx.contestPhoto.count({where:{contestId,participantId:participant.id}})
                if(existingUploadCount + selectedPhotoIds.length > submissionLimit){
                    throw new ApiError(httpstatus.BAD_REQUEST, "Maximum upload limit exceeded")
                }
            }

            const exposureBoostExpiresAt = new Date(Date.now() + EXPOSURE_BOOST_DURATION_MS)
            await tx.contestPhoto.createMany({
                data:selectedPhotoIds.map(photoId => ({
                    contestId,
                    participantId:participant.id,
                    photoId,
                    originalPhotoId:photoId,
                    exposureBoostExpiresAt
                }))
            })
            // Attach the contest category as a label on each uploaded photo so the
            // contest context (e.g. "Nature", "Portrait") is always visible on the
            // photo itself, not just inside the contest. Existing labels are kept,
            // and a photo that already has this label (e.g. it was entered in
            // another contest of the same category) is skipped so it is never
            // added twice.
            // The check reads the labels first instead of filtering with
            // NOT:{labels:{has}}: that filter never matches photos stored before
            // the labels field existed, which would then never get a label.
            // Prisma reads a missing field as [], and push creates it.
            const category = activeContest.category
            if(category){
                const photosWithLabels = await tx.userPhoto.findMany({
                    where:{id:{in:selectedPhotoIds}},
                    select:{id:true, labels:true}
                })
                const photoIdsMissingLabel = photosWithLabels
                    .filter(photo => !hasLabel(photo.labels, category))
                    .map(photo => photo.id)
                if(photoIdsMissingLabel.length > 0){
                    await tx.userPhoto.updateMany({
                        where:{id:{in:photoIdsMissingLabel}},
                        data:{labels:{push:category}}
                    })
                }
            }
            return tx.contestPhoto.findMany({
                where:{contestId, participantId:participant.id, photoId:{in:selectedPhotoIds}},
                include:{photo:true}
            })
        }, {
            // Prisma's interactive transaction default is 5 seconds. Joining can
            // also charge an entry fee and create a participant, so retain a safety
            // margin even though photo and label writes are now batched.
            maxWait:5000,
            timeout:15000
        })
      }catch(error){
        await rollbackUploadedContestPhotos(photosCreatedHere)
        throw error
      }
    }
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

    const ranking = await contestRankingService.buildContestRanking(contestId)
    const photographerRanking = ranking.photographers.find(photographer => photographer.participantId === participant.id)

    return {
        currentLevel,
        totalVotes,
        nextLevel:contestLevelRequirement[currentIdx+1],
        exposure_bonus: participant.exposure_bonus,
        rank: photographerRanking?.rank ?? null,
        totalParticipants: ranking.photographers.length
    }

}

const promoteContestPhoto = async (contestId:string, photoId:string, userId:string)=>{

     const contest = await prisma.contest.findFirst({where:{id:contestId, ...activeContestWhere()}})

    if (!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "Contest not found")
    }
    const contestPhoto = await prisma.contestPhoto.findFirst({
        where:{id:photoId, contestId, photoId:{not:null}, participant:{status:ContestParticipantStatus.ACTIVE}},
        include:{participant:true}
    })
    
    if(!contestPhoto){
        throw new ApiError(httpstatus.NOT_FOUND, "Contest photo not found")
    }

    if (contestPhoto.promoted && contestPhoto.promotionExpiresAt && contestPhoto.promotionExpiresAt > new Date()){
        throw new ApiError(httpstatus.BAD_REQUEST, "Contest photo is already promoted.")
    }

    if (contestPhoto.participant.userId !== userId){
        throw new ApiError(httpstatus.FORBIDDEN, "You are not allowed to promote this contest photo")
    }

    const promotionExpiresAt = new Date(Date.now() + PROMOTION_DURATION_MS)
    const userStore = await userStoreService.getStoreData(userId)

    if ( !userStore || userStore.boost <= 0){
        throw new ApiError(httpstatus.BAD_REQUEST, "You don't have enough promotes")
    }
    await prisma.$transaction(async (tx) => {
        const guard = await tx.contest.updateMany({
            where:{id:contestId, ...activeContestWhere()},
            data:{updatedAt:new Date()}
        })
        if(guard.count !== 1){
            throw new ApiError(httpstatus.CONFLICT, "Contest is no longer accepting promotions")
        }
        const livePhoto = await tx.contestPhoto.findFirst({
            where:{id:photoId, contestId, photoId:{not:null}, participant:{userId, status:ContestParticipantStatus.ACTIVE}}
        })
        if(!livePhoto){
            throw new ApiError(httpstatus.CONFLICT, "Contest photo is no longer eligible for promotion")
        }
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


    // Schedule a job to remove promotion once it expires
    agenda.schedule(promotionExpiresAt, 'promotion:remove', {
        photoId: photoId
    }).catch(error => logger.error({ err: error, photoId }, "Failed to schedule promotion expiry"));


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


const getContestParticipants = async (contestId:string, search?:string)=>{
    const contest = await prisma.contest.findUnique({where:{id:contestId}})

    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "Contest not found")
    }

    return await prisma.contestParticipant.findMany({
        where:{
            contestId,
            ...(search && {
                user:{
                    OR:[
                        {username:{contains:search, mode:"insensitive"}},
                        {fullName:{contains:search, mode:"insensitive"}}
                    ]
                }
            })
        },
        include:{
            user:{select:{id:true, username:true, fullName:true, avatar:true, email:true}}
        }
    })

}


const identifyContestTopPhoto = async (contestId:string)=>{

    const contest = await prisma.contest.findUnique({where:{id:contestId}})
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }

    const contestVote = await prisma.contestPhoto.count({where:{contestId}})

}


const tradePhoto = async (userId:string,contestId:string, contestPhotoId:string, photoId:string, file:Express.Multer.File) => {
    const contest = await prisma.contest.findFirst({where:{id:contestId, ...activeContestWhere()}})
    if(!contest){
        throw new ApiError(httpstatus.CONFLICT, "Contest photos can no longer be traded")
    }
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

    // A traded-in photo has to satisfy the contest's format rule too, and this
    // runs before the swap charge so a rejected photo costs the user nothing.
    await contestRuleEngine.validateSubmissionFormat(
        contestId,
        !photoId && file ? [file] : [],
        photoId ? [photoId] : []
    )

    let replacementPhotoId = photoId
    const photosCreatedHere:{userPhotoId:string; file:Express.Multer.File}[] = []
    if(!replacementPhotoId){
        if(!file){
            throw new ApiError(httpstatus.BAD_REQUEST, "file is required to replace contest photo")
        }
        const uploadedPhoto = await profileService.uploadUserPhoto(userId, file)
        replacementPhotoId = uploadedPhoto.id
        photosCreatedHere.push({userPhotoId:uploadedPhoto.id, file})
    }

    const replacedPhoto = await prisma.$transaction(async trx => {
        const guard = await trx.contest.updateMany({
            where:{id:contestId, ...activeContestWhere()},
            data:{updatedAt:new Date()}
        })
        if(guard.count !== 1){
            throw new ApiError(httpstatus.CONFLICT, "Contest photos can no longer be traded")
        }
        const store = await trx.userStore.findUnique({where:{userId}})
        if (!store || store.swap <= 0){
            throw new ApiError(httpstatus.BAD_REQUEST, "you does not have enough trade")
        }

        const currentContestPhoto = await trx.contestPhoto.findUnique({
            where:{id:contestPhotoId, contestId, photoId:{not:null}, participant:{status:ContestParticipantStatus.ACTIVE}},
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

        // Freeze the outgoing photo's current vote count (including anything it
        // already had banked from an earlier stint) so it can be restored later
        // if the photographer brings it back into any slot in this contest.
        if(currentContestPhoto.photoId){
            const outgoingVoteCount = await voteService.getVoteCount(contestPhotoId)
            await trx.contestPhotoTradeRecord.create({
                data:{
                    contestId,
                    participantId:currentContestPhoto.participantId,
                    photoId:currentContestPhoto.photoId,
                    fromContestPhotoId:contestPhotoId,
                    frozenVoteCount:outgoingVoteCount,
                    active:true
                }
            })
        }

        // If the incoming photo was itself previously traded out of this contest
        // (any slot), restore the votes it had banked instead of starting at zero.
        const restorableRecord = await trx.contestPhotoTradeRecord.findFirst({
            where:{participantId:currentContestPhoto.participantId, contestId, photoId:replacementPhotoId, active:true},
            orderBy:{createdAt:"desc"}
        })
        if(restorableRecord){
            await trx.contestPhotoTradeRecord.update({
                where:{id:restorableRecord.id},
                data:{active:false, toContestPhotoId:contestPhotoId}
            })
        }

        return trx.contestPhoto.update({
            where:{id:contestPhotoId},
            data:{
                photoId:replacementPhotoId,
                stintStartedAt:new Date(),
                bankedVotes:restorableRecord?.frozenVoteCount ?? 0,
                // A trade is a fresh start for this slot's spotlight too, same as a
                // brand-new submission.
                exposureBoostExpiresAt:new Date(Date.now() + EXPOSURE_BOOST_DURATION_MS)
            }
        })
    }).catch(async error => {
        // A rejected trade must not leave the replacement photo behind.
        await rollbackUploadedContestPhotos(photosCreatedHere)
        throw error
    })

    // The slot now holds a different image with a different vote history.
    contestRankingService.invalidateContestRanking(contestId)

    return replacedPhoto

}

// Photos this user has previously traded out of any slot in this contest and
// hasn't brought back yet - offered as a "swap back" option alongside a fresh
// upload/gallery pick when starting a new trade. Bringing one of these back in
// resumes its frozenVoteCount instead of starting at zero (see tradePhoto).
const getTradeableHistory = async (userId:string, contestId:string) => {
    const participant = await prisma.contestParticipant.findUnique({where:{contestId_userId:{contestId, userId}}})
    if(!participant){
        return []
    }

    const records = await prisma.contestPhotoTradeRecord.findMany({
        where:{participantId:participant.id, contestId, active:true},
        include:{photo:{select:{id:true, url:true, title:true}}},
        orderBy:{createdAt:"desc"}
    })

    return records.map(record => ({
        tradeRecordId:record.id,
        photoId:record.photoId,
        url:record.photo.url,
        title:record.photo.title,
        frozenVoteCount:record.frozenVoteCount,
        tradedOutAt:record.createdAt
    }))
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

    // Checked before storing it, so a rejected file never reaches the gallery.
    await contestRuleEngine.validateSubmissionFormat(contestId, [file])

    const uploadedPhoto = await profileService.uploadUserPhoto(userId, file)
    
    return await replaceContestPhotoWithUserPhoto(userId, contestId, contestPhotoId, uploadedPhoto.id)

}

const replaceContestPhotoWithUserPhoto = async (userId:string, contestId:string, contestPhotoId:string, userPhotoId:string) => {
    const contestPhoto = await prisma.contestPhoto.findUnique({where:{id:contestPhotoId, participant:{userId}},include:{participant:true}})
    if(!contestPhoto){
        throw new ApiError(httpstatus.NOT_FOUND, "contest photo not found")
    }

    await contestRuleEngine.validateSubmissionFormat(contestId, [], [userPhotoId])

    const updatedContestPhoto = await prisma.contestPhoto.update({where:{id:contestPhotoId}, data:{photoId:userPhotoId}})
    contestRankingService.invalidateContestRanking(contestId)

    return updatedContestPhoto
}


const chargePhoto = async (userId:string, contestId:string) => {
    const contest = await prisma.contest.findFirst({where:{id:contestId, ...activeContestWhere()}})

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
            data:{exposure_bonus:EXPOSURE_MAX, exposureUpdatedAt:new Date()}
        })
    })

    return await prisma.contestParticipant.findUnique({where:{id:participant.id}})
}

const decayExposureMeters = async () => {
    const now = new Date()
    const participants = await prisma.contestParticipant.findMany({
        where:{
            exposure_bonus:{gt:0},
            contest:{status:ContestStatus.ACTIVE}
        },
        select:{
            id:true,
            exposure_bonus:true,
            exposureUpdatedAt:true,
            updatedAt:true
        }
    })

    let decayedCount = 0
    for(const participant of participants){
        const referenceTime = participant.exposureUpdatedAt ?? participant.updatedAt ?? now
        const elapsedIntervals = Math.floor((now.getTime() - referenceTime.getTime()) / EXPOSURE_DECAY_INTERVAL_MS)
        if(elapsedIntervals <= 0){
            continue
        }

        const nextExposure = Math.max(0, participant.exposure_bonus - (elapsedIntervals * EXPOSURE_DECAY_AMOUNT))
        if(nextExposure === participant.exposure_bonus){
            continue
        }

        const result = await prisma.contestParticipant.updateMany({
            where:{id:participant.id, exposure_bonus:participant.exposure_bonus},
            data:{exposure_bonus:nextExposure, exposureUpdatedAt:now}
        })
        decayedCount += result.count
    }

    return decayedCount
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
    const safePage = Number.isFinite(page) && Number(page) > 0 ? Math.floor(Number(page)) : 1
    const safeLimit = Number.isFinite(limit) && Number(limit) > 0
        ? Math.min(Math.floor(Number(limit)), 100)
        : 20
    const skip = (safePage - 1) * safeLimit

    return {page:safePage, limit:safeLimit, skip}
}

const paginateRankedData = <T>(data:T[], page?:number, limit?:number) => {
    const pagination = getPagination(page, limit)
    const paginatedData = data.slice(pagination.skip, pagination.skip + pagination.limit)

    return {
        data:paginatedData,
        meta:paginationHelper.getPaginationMetaData(
            pagination.page,
            pagination.limit,
            data.length
        )
    }
}

const getContestPhotoVoteScore = async (contestPhoto:{id:string; photoId?:string | null; originalPhotoId?:string | null; initialVotes?:number | null}) => {
    const voteCount = await voteService.getVoteCount(contestPhoto.id)
    const stillOriginalPhoto = !contestPhoto.originalPhotoId || contestPhoto.originalPhotoId === contestPhoto.photoId
    return voteCount + (stillOriginalPhoto ? (contestPhoto.initialVotes || 0) : 0)
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

const getContestPhotosSortedByVote = async (
    contestId:string,
    page?:number,
    limit?:number,
    rankingInput?:Awaited<ReturnType<typeof contestRankingService.buildContestRanking>>
) => {

    const contest = await prisma.contest.findUnique({where:{id:contestId}})

    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, 'Contest not found')
    }
    const ranking = rankingInput ?? await contestRankingService.buildContestRanking(contestId)
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
                score:photo.score,
                voteCount:photo.voteCount,
                voterCount:photo.voterCount,
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
    level?: string,
    rankingInput?:Awaited<ReturnType<typeof contestRankingService.buildContestRanking>>,
    // /rank-photographer lists every photographer when no level tab is
    // requested. /ranking keeps the older default of the AMATEUR tab.
    options?: { allLevelsWhenUnset?: boolean }
) => {
    const contest = await prisma.contest.findUnique({
        where: { id: contestId }
    })

    if (!contest) {
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }

    const showAllLevels = Boolean(options?.allLevelsWhenUnset) && !level
    const activeLevel = showAllLevels ? null : normalizeRankLevel(level)

    const ranking = rankingInput ?? await contestRankingService.buildContestRanking(contestId)

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
                    score: photographer.score,
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
                    totalVotes: photographer.voteCount,
                    voterCount: photographer.voterCount
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
        .filter(participant => activeLevel === null || participant.level === activeLevel)
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

// Single "Ranking" button destination: combines the photo and photographer
// leaderboards that were previously two separate calls (/rank-photos,
// /rank-photographer) into one response.
const getContestRanking = async (
    contestId:string,
    currentUserId?:string,
    page?:number,
    limit?:number,
    level?:string
) => {
    const ranking = await contestRankingService.buildContestRanking(contestId)
    const [photos, photographers] = await Promise.all([
        getContestPhotosSortedByVote(contestId, page, limit, ranking),
        getContestTopPhotographers(contestId, currentUserId, page, limit, level, ranking)
    ])

    return {photos, photographers}
}




export const contestService = {
    getContestUploadFiles,
    createContest,
    materializeRecurringOccurrence,
    updateContest,
    getBannerCandidates,
    getTradeableHistory,
    completePaidContestJoin,
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
    decayExposureMeters,
    deleteContestUploadById,
    adminDeleteContestPhoto,
    getContestParticipants,
    getContestPhotosSortedByVote,
    getContestTopPhotographers,
    getContestRanking,
    getContestByUserId,
    getContestUploadsToVote,
    getContestPhotoCount,
    getContestCreateOptions,
    getContestPrizes

}
