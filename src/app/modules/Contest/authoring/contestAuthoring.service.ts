import httpstatus from "http-status";
import ApiError from "../../../../errors/ApiError";
import { fileUploader } from "../../../../helpers/fileUploader";
import { paginationHelper } from "../../../../helpers/paginationHelper";
import { validateContestDate } from "../../../../helpers/validateDate";
import { Contest, ContestStatus, Prisma } from "../../../../prismaClient";
import prisma from "../../../../shared/prisma";
import logger from "../../../../shared/logger";
import agenda from "../../Agenda";
import { prizeService } from "../../Prize/prize.service";
import { contestCache } from "../contest.cache";
import { contestData, updateContestData } from "../contest.type";
import { resolveCategoryInput } from "../contestCategories";
import { contestCategoryService } from "../contestCategory.service";
import { getFinalizationTime } from "../ContestFinalization/contestFinalization.service";
import { contestStatus, notDeletedContest } from "../contestLifecycle";
import { policyFor } from "../contestTypePolicy";
import { getContestRuleDefinitionViews, supportedContestImageMimeTypes } from "../ContestRules/contestRule.definitions";
import { contestRuleService } from "../ContestRules/contestRules.service";
import { createRecurringContest } from "../recurring/recurringMaterializer";
import { resolveBanner } from "./bannerResolver";
import { contestPurgeService } from "./contestPurge.service";
import {
    AwardRow,
    blueprintFromRequest,
    insertContestAwards,
    insertContestLevelAwards,
    insertContestRules,
    LevelAwardRow,
    saveContestBlueprint,
} from "./contestBlueprint";

const INVALID_DATES_MESSAGE = "Contest dates are invalid; start must be in the future and end must be after start"

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

const createContest = async (creatorId: string, body: contestData, banner:Express.Multer.File) => {
    if(!validateContestDate(body.startDate, body.endDate)){
        throw new ApiError(httpstatus.BAD_REQUEST, INVALID_DATES_MESSAGE)
    }

    if(body.recurring){
       return createRecurringContest(creatorId, body, banner)
    }

    const blueprint = await blueprintFromRequest(creatorId, body, banner)

    return prisma.$transaction(async tx => {
        const contest = await saveContestBlueprint(tx, blueprint)

        return {
            ...contest,
            rules:blueprint.rules,
            prizes:blueprint.awards.filter(prize => prize.enabled),
            levelAwards:blueprint.levelAwards
        }
    })
}

// A contest type that stays manageable after it starts (Photographer of the
// Year) can still be edited or archived while it is ACTIVE and has not ended.
const isRunningButManageable = (contest:Contest) =>
    policyFor(contest).editableWhileRunning
    && contest.status === ContestStatus.ACTIVE
    && contest.endDate > new Date()

const isManageable = (contest:Contest) =>
    contestStatus.isEditable(contest.status) || isRunningButManageable(contest)

function assertContestCanBeEdited(contest:Contest | null, allowPhotographyOfYear:boolean):asserts contest is Contest {
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }
    if(contest.deletedAt){
        throw new ApiError(httpstatus.BAD_REQUEST, "Archived contests cannot be edited")
    }
    if(contest.isPhotographyOfYear !== allowPhotographyOfYear){
        throw new ApiError(
            httpstatus.BAD_REQUEST,
            contest.isPhotographyOfYear
                ? "Update Photographer of the Year contests through the dedicated endpoint"
                : "This endpoint only accepts Photographer of the Year contests"
        )
    }
    if(!isManageable(contest)){
        throw new ApiError(httpstatus.BAD_REQUEST, "Editing contest not allowed")
    }
}

// Datetime inputs drop seconds, so an unchanged start date can come back a
// little off. Anything within a minute counts as "not changed".
const DATE_TOLERANCE_MS = 60 * 1000

// What an admin may no longer change.
//   startDate:   locked once the contest is running.
//   feeAndRules: locked once it is running, and for a contest that takes
//                registrations before it starts (Photographer of the Year) as
//                soon as anyone has registered: they joined, and maybe paid,
//                under that fee and those rules.
export type ContestEditLocks = { startDate:boolean; feeAndRules:boolean }

export const getContestEditLocks = async (contest:Contest):Promise<ContestEditLocks> => {
    const running = isRunningButManageable(contest)
    if(running) return {startDate:true, feeAndRules:true}
    if(!policyFor(contest).opensEntriesBeforeStart) return {startDate:false, feeAndRules:false}
    const registrations = await prisma.contestParticipant.count({where:{contestId:contest.id}})
    return {startDate:false, feeAndRules:registrations > 0}
}

const feeLockedMessage = (locks:ContestEditLocks) => locks.startDate
    ? "The entry fee cannot change after the contest has started"
    : "The entry fee cannot change once people have registered"

const assertEntryFeeUnchanged = (contest:Contest, update:updateContestData, locks:ContestEditLocks) => {
    if(update.entryFeeAmount !== undefined && Number(update.entryFeeAmount) !== Number(contest.entryFeeAmount ?? 0)){
        throw new ApiError(httpstatus.BAD_REQUEST, feeLockedMessage(locks))
    }
}

// Dates for a contest that has already started: the start date and the entry
// fee are fixed, only the end date may move (and it must stay in the future).
const getRunningContestDates = (contest:Contest, update:updateContestData, locks:ContestEditLocks) => {
    if(update.startDate && Math.abs(new Date(update.startDate).getTime() - contest.startDate.getTime()) > DATE_TOLERANCE_MS){
        throw new ApiError(httpstatus.BAD_REQUEST, "The start date cannot change after the contest has started")
    }
    assertEntryFeeUnchanged(contest, update, locks)
    const endDate = update.endDate ? new Date(update.endDate) : contest.endDate
    if(Number.isNaN(endDate.getTime()) || endDate <= new Date() || endDate <= contest.startDate){
        throw new ApiError(httpstatus.BAD_REQUEST, "The end date must be in the future")
    }
    return {startDate:contest.startDate, endDate}
}

// The money and date fields after applying the update on top of the saved contest.
const getUpdatedContestSettings = (contest:Contest, update:updateContestData, locks:ContestEditLocks) => {
    let startDate = update.startDate ? new Date(update.startDate) : contest.startDate
    let endDate = update.endDate ? new Date(update.endDate) : contest.endDate
    if(locks.startDate){
        ({startDate, endDate} = getRunningContestDates(contest, update, locks))
    }else{
        // Not started yet: the start date may still move (also after people
        // registered), but it must stay in the future and before the end.
        if(!validateContestDate(startDate.toISOString(), endDate.toISOString())){
            throw new ApiError(httpstatus.BAD_REQUEST, INVALID_DATES_MESSAGE)
        }
        if(locks.feeAndRules){
            assertEntryFeeUnchanged(contest, update, locks)
        }
    }

    const money = policyFor(contest).applyMoneyRules({
        isMoneyContest:update.isMoneyContest ?? contest.isMoneyContest,
        minPrize:update.minPrize ?? contest.minPrize ?? 0,
        maxPrize:update.maxPrize ?? contest.maxPrize ?? 0,
        entryFeeCoins:update.coinRequirement === false ? 0 : (update.entryFeeCoins ?? contest.entryFeeCoins),
    })
    const currency = update.currency === undefined ? contest.currency : update.currency
    const minPrize = money.minPrize ?? 0
    const maxPrize = money.maxPrize ?? 0

    if(money.isMoneyContest && (!currency || minPrize > maxPrize)){
        throw new ApiError(httpstatus.BAD_REQUEST, "Money contests require valid currency and prize bounds")
    }
    if(update.coinRequirement && !money.entryFeeCoins){
        throw new ApiError(httpstatus.BAD_REQUEST, "A positive entryFeeCoins value is required when coinRequirement is enabled")
    }

    return {
        startDate,
        endDate,
        isMoneyContest:money.isMoneyContest,
        currency:money.isMoneyContest ? currency : null,
        minPrize:money.isMoneyContest ? minPrize : 0,
        maxPrize:money.isMoneyContest ? maxPrize : 0,
        entryFeeAmount:locks.feeAndRules ? (contest.entryFeeAmount ?? 0) : (update.entryFeeAmount ?? contest.entryFeeAmount ?? 0),
        entryFeeCoins:money.entryFeeCoins,
    }
}

const updateContest = async (
    contestId:string,
    contestUpdate:updateContestData,
    banner?:Express.Multer.File,
    allowPhotographyOfYear = false
)=>{
    const contest = await prisma.contest.findUnique({where:{id:contestId}})
    assertContestCanBeEdited(contest, allowPhotographyOfYear)

    const policy = policyFor(contest)
    const locks = await getContestEditLocks(contest)
    const running = locks.startDate
    const settings = getUpdatedContestSettings(contest, contestUpdate, locks)
    const {prizeIds, prizes, levelAwards, rules, coinRequirement, bannerUserPhotoId, category, categories, ...otherFields} = contestUpdate as any
    if(locks.feeAndRules && rules !== undefined){
        throw new ApiError(
            httpstatus.BAD_REQUEST,
            running
                ? "Contest rules cannot change after the contest has started"
                : "Contest rules cannot change once people have registered"
        )
    }
    const categoryData = await contestCategoryService.prepareCategoryUpdate(resolveCategoryInput({category, categories}))
    const bannerData = await resolveBanner(bannerUserPhotoId, banner)

    // undefined means "this part was not sent, leave it as it is".
    const newRules = rules === undefined
        ? undefined
        : policy.applyRuleOverrides(contestRuleService.normalizeContestRules(rules, false))
    const newAwards = prizeIds === undefined && prizes === undefined
        ? undefined
        : await policy.resolveAwards({
            prizeIds:prizeIds || [],
            prizes:prizes || [],
            useDefaults:(prizeIds || []).length === 0 && (prizes || []).length === 0
        })
    const newLevelAwards = levelAwards === undefined ? undefined : policy.resolveLevelAwards(levelAwards)

    const saved = await prisma.$transaction(async tx => {
        const updatedContest = await tx.contest.update({
            where:{id:contestId},
            data:{
                ...otherFields,
                ...categoryData,
                ...bannerData,
                ...settings,
                ...(newRules !== undefined && {maxUpload:policy.getSubmissionLimit(newRules)}),
            }
        })

        if(newRules !== undefined){
            await tx.contestRuleConfig.deleteMany({where:{contestId}})
            await insertContestRules(tx, contestId, newRules)
        }
        if(newAwards !== undefined){
            await tx.contestAward.deleteMany({where:{contestId}})
            await insertContestAwards(tx, contestId, newAwards as AwardRow[])
        }
        if(newLevelAwards !== undefined){
            await tx.contestLevelAward.deleteMany({where:{contestId}})
            await insertContestLevelAwards(tx, contestId, newLevelAwards as LevelAwardRow[])
        }

        const [updatedRules, updatedAwards, updatedLevelAwards] = await Promise.all([
            newRules && tx.contestRuleConfig.findMany({where:{contestId}, orderBy:{order:"asc"}}),
            newAwards && tx.contestAward.findMany({where:{contestId, enabled:true}, orderBy:[{order:"asc"}, {createdAt:"asc"}]}),
            newLevelAwards && tx.contestLevelAward.findMany({where:{contestId}}),
        ])

        return {updatedContest, updatedRules, updatedAwards, updatedLevelAwards}
    })

    await contestCache.invalidateContest(contestId)
    // The finalization watcher was scheduled for the old end date when the
    // contest started. Schedule one for the new date; the old one skips itself
    // if it fires before the contest has really ended (see Agenda/jobs.ts).
    if(running && saved.updatedContest.endDate.getTime() !== contest.endDate.getTime()){
        await agenda.schedule(getFinalizationTime(saved.updatedContest), "contest:watcher", {contestId})
            .catch((error) => logger.error({ err: error, contestId }, "Failed to reschedule contest finalization"))
    }
    if(bannerData.banner){
        await fileUploader.deleteReplacedFile(contest.banner, `contests/${contestId}/banner`)
    }

    return {
        ...saved.updatedContest,
        ...(saved.updatedRules && {rules:saved.updatedRules}),
        ...(saved.updatedAwards && {prizes:saved.updatedAwards}),
        ...(saved.updatedLevelAwards && {levelAwards:saved.updatedLevelAwards})
    }
}

// Regular contests are soft-deleted, and only before anyone takes part.
// Photographer of the Year is permanently deleted with all its records at any
// stage (see contestTypePolicy.purgeOnDelete and authoring/contestPurge.service.ts).
const deleteContestByContestId = async (contestId:string)=>{
    const contest = await prisma.contest.findUnique({where:{id:contestId}})
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found!")
    }
    if(policyFor(contest).purgeOnDelete){
        await contestPurgeService.purgeContest(contestId)
        return "contest deleted!"
    }
    if(contest.deletedAt){
        throw new ApiError(httpstatus.BAD_REQUEST, "contest already deleted!")
    }
    if(!contestStatus.isEditable(contest.status)){
        throw new ApiError(httpstatus.BAD_REQUEST, "Only upcoming contests can be deleted")
    }

    const relatedRecordCounts = await Promise.all([
        prisma.contestParticipant.count({where:{contestId}}),
        prisma.contestPhoto.count({where:{contestId}}),
        prisma.vote.count({where:{contestId}}),
        prisma.teamParticipation.count({where:{contestId}}),
        prisma.teamMatch.count({where:{contestId}}),
        prisma.teamMatchQueue.count({where:{contestId}})
    ])
    if(relatedRecordCounts.some(count => count > 0)){
        throw new ApiError(httpstatus.BAD_REQUEST, "Contest cannot be deleted after participation has started")
    }

    const deleted = await prisma.contest.updateMany({
        where:{id:contestId, status:{in:contestStatus.editableStatuses}, ...notDeletedContest},
        data:{deletedAt:new Date()}
    })
    if(deleted.count !== 1){
        throw new ApiError(httpstatus.BAD_REQUEST, "Contest can no longer be deleted")
    }
    return "contest deleted!"
}

export const contestAuthoringService = {
    getContestCreateOptions,
    getBannerCandidates,
    createContest,
    updateContest,
    deleteContestByContestId,
}
