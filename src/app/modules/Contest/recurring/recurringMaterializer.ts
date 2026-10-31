import httpstatus from "http-status";
import ApiError from "../../../../errors/ApiError";
import { assertValidTimeZone, calculateNextOccurance } from "../../../../helpers/nextOccurance";
import { validateContestDate } from "../../../../helpers/validateDate";
import { ContestOccurrenceStatus, ContestStatus, RecurringContest, RecurringContestStatus, RecurringType } from "../../../../prismaClient";
import logger from "../../../../shared/logger";
import prisma from "../../../../shared/prisma";
import agenda from "../../Agenda";
import { prizeService } from "../../Prize/prize.service";
import { blueprintFromTemplate, getMoneySettings, saveContestBlueprint, shouldUseDefaultAwards } from "../authoring/contestBlueprint";
import { resolveBanner } from "../authoring/bannerResolver";
import { getFinalizationTime } from "../ContestFinalization/contestFinalization.service";
import { contestData } from "../contest.type";
import { resolveCategoryInput } from "../contestCategories";
import { contestCategoryService } from "../contestCategory.service";
import { contestRuleService } from "../ContestRules/contestRules.service";

const OCCURRENCE_LEASE_MS = 15 * 60 * 1000
// The next occurrence appears once the running one has used 80% of its time.
const NEXT_OCCURRENCE_AT_PROGRESS = 0.8

const hasPassedRecurrenceLimit = (template:RecurringContest, occurrenceDate:Date, generatedCount:number) => {
    const {endsAt, maxOccurrences} = template.recurring

    return Boolean(
        (endsAt && occurrenceDate > endsAt) ||
        (maxOccurrences && generatedCount >= maxOccurrences)
    )
}

const isTooEarlyForNextOccurrence = async (template:RecurringContest) => {
    if(!template.lastGeneratedContestId){
        return false
    }
    const previous = await prisma.contest.findUnique({
        where:{id:template.lastGeneratedContestId},
        select:{startDate:true, endDate:true, status:true}
    })

    if(previous?.status === ContestStatus.UPCOMING){
        return true
    }
    if(previous?.status === ContestStatus.ACTIVE){
        const duration = previous.endDate.getTime() - previous.startDate.getTime()
        return Date.now() < previous.startDate.getTime() + duration * NEXT_OCCURRENCE_AT_PROGRESS
    }
    // Any other status, or no previous contest, means it is already due.
    return false
}

// Only one worker may create an occurrence. Returns true for the worker that won.
const claimOccurrence = async (template:RecurringContest, occurrenceKey:string, scheduledAt:Date) => {
    const occurrence = await prisma.recurringContestOccurrence.upsert({
        where:{occurrenceKey},
        update:{},
        create:{occurrenceKey, recurringContestId:template.id, scheduledAt}
    })
    if(occurrence.status === ContestOccurrenceStatus.MATERIALIZED){
        return false
    }

    const claimed = await prisma.recurringContestOccurrence.updateMany({
        where:{
            occurrenceKey,
            OR:[
                {status:{in:[ContestOccurrenceStatus.PENDING, ContestOccurrenceStatus.FAILED]}},
                {status:ContestOccurrenceStatus.MATERIALIZING, startedAt:{lte:new Date(Date.now() - OCCURRENCE_LEASE_MS)}}
            ]
        },
        data:{status:ContestOccurrenceStatus.MATERIALIZING, startedAt:new Date(), error:null}
    })
    return claimed.count === 1
}

// Materializes a recurring contest template's next occurrence into a real Contest row.
// Normally gated on the running instance's progress: the next occurrence only appears
// (as Upcoming) once the active instance has used 80% of its runtime. Pass force:true to
// skip that gate (used for the very first occurrence, so the admin sees an Upcoming
// contest right away). Idempotent either way through the occurrence claim, so calling
// this and then letting the normal cron run too is always safe.
const materializeRecurringOccurrence = async (template:RecurringContest, options?:{force?:boolean}) => {
    const nextOccurrence = template.recurring.nextOccurrence
    const generatedCount = template.recurring.generatedOccurrences || 0

    if(hasPassedRecurrenceLimit(template, nextOccurrence, generatedCount)){
        await prisma.recurringContest.update({
            where:{id:template.id},
            data:{status:RecurringContestStatus.ENDED}
        })
        return
    }
    if(!options?.force && await isTooEarlyForNextOccurrence(template)){
        return
    }

    const occurrenceKey = `${template.id}:${nextOccurrence.toISOString()}`
    if(!(await claimOccurrence(template, occurrenceKey, nextOccurrence))){
        return
    }

    try{
        const duration = template.recurring.duration || (template.endDate.getTime() - template.startDate.getTime())
        const endDate = new Date(nextOccurrence.getTime() + duration)
        const status = nextOccurrence <= new Date() ? ContestStatus.ACTIVE : ContestStatus.UPCOMING
        const followingOccurrence = calculateNextOccurance(
            nextOccurrence,
            template.recurring.recurringType,
            template.recurring.timezone
        )
        const blueprint = await blueprintFromTemplate(template, nextOccurrence, endDate, status)

        const newContest = await prisma.$transaction(async tx => {
            const contest = await saveContestBlueprint(tx, blueprint)

            await tx.recurringContestOccurrence.update({
                where:{occurrenceKey},
                data:{status:ContestOccurrenceStatus.MATERIALIZED, contestId:contest.id, error:null}
            })
            await tx.recurringContest.update({
                where:{id:template.id},
                data:{
                    lastGeneratedContestId:contest.id,
                    status:hasPassedRecurrenceLimit(template, followingOccurrence, generatedCount + 1)
                        ? RecurringContestStatus.ENDED
                        : RecurringContestStatus.ACTIVE,
                    recurring:{set:{
                        ...template.recurring,
                        previousOccurrence:nextOccurrence,
                        nextOccurrence:followingOccurrence,
                        generatedOccurrences:generatedCount + 1
                    }}
                }
            })

            return contest
        })

        if(status === ContestStatus.ACTIVE){
            // Materialization is already committed. A scheduler outage must not
            // mark the occurrence failed and create a duplicate on retry; the
            // periodic contest watcher remains a recovery path.
            await agenda.schedule(getFinalizationTime(newContest), "contest:watcher", {contestId:newContest.id}).catch(error => {
                logger.error({ err: error, contestId: newContest.id }, "Failed to schedule watcher for recurring contest")
            })
        }
        logger.info({ contestId: newContest.id, recurringContestId: template.id }, "Generated recurring contest instance")
        return newContest
    }catch(error){
        await prisma.recurringContestOccurrence.update({
            where:{occurrenceKey},
            data:{status:ContestOccurrenceStatus.FAILED, error:error instanceof Error ? error.message : String(error)}
        })
        throw error
    }
}

const getValidTimeZone = (timezone:string) => {
    try{
        assertValidTimeZone(timezone)
    }catch{
        throw new ApiError(httpstatus.BAD_REQUEST, "Timezone must be a valid IANA timezone name")
    }
    return timezone
}

export const createRecurringContest = async (creatorId:string, body:contestData, banner:Express.Multer.File) => {
    if(!body.recurring){
        throw new Error("Contest is not a recurring contest!")
    }
    if(!validateContestDate(body.startDate, body.endDate)){
        throw new ApiError(httpstatus.BAD_REQUEST, "Contest dates are invalid; start must be in the future and end must be after start")
    }

    const startDate = new Date(body.startDate)
    const endDate = new Date(body.endDate)
    const timezone = getValidTimeZone(body.recurrence?.timezone || "UTC")
    const rules = contestRuleService.normalizeContestRules(body.rules, body.rules === undefined)
    const awardRows = await prizeService.resolveAwardRows(
        body.prizeIds || [],
        body.prizes || [],
        shouldUseDefaultAwards(body)
    )
    const levelAwards = body.levelAwards || []
    const categoryData = await contestCategoryService.prepareCategoryUpdate(resolveCategoryInput(body))
    const bannerData = await resolveBanner(body.bannerUserPhotoId, banner)

    const templateData:any = {
        // Same id as the banner folder (contests/<id>/banner) when a banner was uploaded.
        id:banner?.recordId,
        creatorId,
        title:body.title,
        description:body.description,
        startDate,
        endDate,
        rules,
        ...categoryData,
        ...getMoneySettings(body),
        ...bannerData,
        recurring:{set:{
            recurringType:body.recurrence?.type || RecurringType.DAILY,
            previousOccurrence:null,
            nextOccurrence:startDate,
            duration:endDate.getTime() - startDate.getTime(),
            timezone,
            endsAt:body.recurrence?.endsAt ? new Date(body.recurrence.endsAt) : null,
            maxOccurrences:body.recurrence?.maxOccurrences || null,
            generatedOccurrences:0
        }}
    }

    const created = await prisma.$transaction(async tx => {
        const template = await tx.recurringContest.create({data:templateData})
        await tx.recurringContestAward.createMany({
            data:awardRows.map(award => ({recurringContestId:template.id, ...award}))
        })
        if(levelAwards.length > 0){
            await tx.recurringContestLevelAward.createMany({
                data:levelAwards.map(award => ({recurringContestId:template.id, ...award}))
            })
        }
        return template
    })

    // Always materialize the first occurrence immediately, regardless of how far out
    // startDate is, so the admin sees it right away. Every later occurrence follows
    // the normal cron schedule.
    try{
        await materializeRecurringOccurrence(created, {force:true})
    }catch(error){
        logger.error({ err: error, recurringContestId: created.id }, "Failed to materialize first occurrence of recurring contest")
    }

    return {...created, prizes:awardRows, levelAwards}
}

export const recurringMaterializer = {
    materializeRecurringOccurrence,
}
