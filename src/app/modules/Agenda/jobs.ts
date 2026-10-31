import { ContestStatus, RecurringContestStatus } from '../../../prismaClient';
import { Agenda, Job } from "agenda";
import prisma from '../../../shared/prisma';
import {contestService } from '../Contest/contest.service';
import { contestStatus, notDeletedContest } from '../Contest/contestLifecycle';
import { FINALIZATION_GRACE_MS, getFinalizationTime } from '../Contest/ContestFinalization/contestFinalization.service';
import { photographyOfTheYearRankingService } from '../PhotographyOfTheYear/photographyOfTheYearRanking.service';
import { drainPendingWork } from '../PendingWork/pendingWork.handlers';
import { teamService } from '../Team/team.service';
import logger from "../../../shared/logger";



export const registerAgendaJobs = (agenda:Agenda) => {

agenda.define("contest:active", async ()=>{
    const now = new Date()
    const upcomingContest = await prisma.contest.findMany({
        where:{status:ContestStatus.UPCOMING, startDate:{lte:now}, ...notDeletedContest}
    })
    logger.debug(`Found ${upcomingContest.length} upcoming contests`)
    for(const contest of upcomingContest){
        const activated = await contestStatus.change(contest.id, ContestStatus.ACTIVE, {startedAt:now}, notDeletedContest)
        if(activated){
            await agenda.schedule(getFinalizationTime(contest),"contest:watcher", {contestId:contest.id})
        }
    }
})



agenda.define("contest:checkRecurring", async ()=>{

    const recurringContests = await prisma.recurringContest.findMany({
        where:{status:RecurringContestStatus.ACTIVE}
    });
    logger.debug(`Found ${recurringContests.length} recurring contests to process`);

    for(const contest of recurringContests){
        try{
            await contestService.materializeRecurringOccurrence(contest);
        }catch(error){
            logger.error({ err: error, recurringContestId: contest.id }, "Failed to generate recurring contest")
        }
    }
});


// Materialization logic (including the active-instance-progress gate and the forced
// immediate materialization of the first occurrence) now lives in
// contestService.materializeRecurringOccurrence, shared with createRecurringContest
// so the first occurrence appears right away instead of waiting on this cron.

//contest closed if the contest endtime has passed.
//closed status means contest is ended
//completed contests are ended contests and the user is participated those contests
//so, there is not seaparte completed contest in the database

agenda.define("contest:watcher", async (job: Job) => {
    const { contestId} = job.attrs.data as {  contestId:string };

    const contest = await prisma.contest.findUnique({where:{id:contestId}})
    if (!contest){
        // A hard-deleted contest is a permanent condition, not a failure worth
        // retrying - throwing here only spends the job's retry budget.
        logger.warn({ contestId }, "Contest no longer exists, skipping finalization")
        return
    }
    if(contest.deletedAt){
        logger.info({ contestId }, "Contest is archived, skipping finalization")
        return
    }

    await contestService.identifyWinner(contestId)
    await teamService.closeActiveMatchesForContest(contestId)
    logger.info({ contestId }, "Contest finalized")
});

agenda.define("contest:watchEnded", async () => {
    const endedBefore = new Date(Date.now() - FINALIZATION_GRACE_MS)
    const contests = await prisma.contest.findMany({
        where:{
            OR:[
                {status:ContestStatus.ACTIVE, endDate:{lte:endedBefore}},
                {status:ContestStatus.FINALIZATION_FAILED},
                // A contest whose finalizer died mid-run stays FINALIZING with
                // nothing else scheduled to touch it. finalizeContest re-claims
                // it only once its lease has gone stale, so a healthy run in
                // progress is simply skipped here.
                {status:ContestStatus.FINALIZING, endDate:{lte:endedBefore}}
            ]
        },
        select:{id:true}
    })

    for(const contest of contests){
        try{
            await contestService.identifyWinner(contest.id)
            await teamService.closeActiveMatchesForContest(contest.id)
        }catch(error){
            logger.error({ err: error, contestId: contest.id }, "Failed to finalize contest")
        }
    }
})

agenda.define("teamMatch:watchStale", async () => {
    const closedCount = await teamService.retryStaleTeamMatches()
    if(closedCount > 0){
        logger.info(`Auto-closed ${closedCount} stale team match(es) whose contest had already ended`)
    }
});

// Expires opponent searches that hit the 5-hour / contest-end matchmaking window without pairing up.
agenda.define("teamMatch:watchQueueTimeouts", async () => {
    const timedOutCount = await teamService.timeoutExpiredTeamMatchQueues()
    if(timedOutCount > 0){
        logger.info(`Timed out ${timedOutCount} team match search(es) with no opponent found`)
    }
});

// Pays out coins to the top-3 teams' current members for the week/month that just ended.
// Idempotent per (team, member, period, periodKey) - safe if this fires more than once.
agenda.define("team:weeklyPayout", async () => {
    const result = await teamService.payoutPeriodRewards("WEEKLY")
    logger.info({ period: result.periodKey, teamsRewarded: result.teamsRewarded }, "Weekly team payout done")
});

agenda.define("team:monthlyPayout", async () => {
    const result = await teamService.payoutPeriodRewards("MONTHLY")
    logger.info({ period: result.periodKey, teamsRewarded: result.teamsRewarded }, "Monthly team payout done")
});

agenda.define("team:yearlyPayout", async () => {
    const result = await teamService.payoutPeriodRewards("YEARLY")
    logger.info({ period: result.periodKey, teamsRewarded: result.teamsRewarded }, "Yearly team payout done")
});

// Participant-level exposure is time-decayed so meters cannot stay stuck at a
// charged/vote-boosted value. The service calculates missed intervals from the
// last exposure update, so delayed scheduler ticks catch up safely.
agenda.define("contest:decayExposure", async () => {
    const decayedCount = await contestService.decayExposureMeters()
    if(decayedCount > 0){
        logger.debug(`Decayed exposure for ${decayedCount} contest participant(s)`)
    }
});


agenda.define("promotion:remove", async (job: Job) => {
    const { photoId } = job.attrs.data as { photoId: string };
    const updated = await prisma.contestPhoto.updateMany({
        where: { id: photoId, promoted: true, promotionExpiresAt: { lte: new Date() } },
        data: { promoted: false, promotionExpiresAt: null }
    });
    if (updated.count > 0) {
        logger.info({ photoId }, "Photo promotion expired");
    }
});

// Level checks and other follow-up work queued by votes and joins. concurrency:1
// stops a slow batch from overlapping the next one.
agenda.define("work:drainPending", {concurrency:1}, async () => {
    const completed = await drainPendingWork()
    if(completed > 0){
        logger.debug(`Completed ${completed} pending work item(s)`)
    }
});

// A regular-contest vote can move a photo into the POTY top 10. Checking on a
// schedule costs one ranking per minute instead of one per vote.
agenda.define("poty:checkTopTen", {concurrency:1}, async () => {
    await photographyOfTheYearRankingService.notifyTopTenForActiveContests()
});

// Recovery path for a missed/delayed one-off promotion job.
agenda.define("promotion:sweep", async () => {
    await prisma.contestPhoto.updateMany({
        where: { promoted: true, promotionExpiresAt: { lte: new Date() } },
        data: { promoted: false, promotionExpiresAt: null }
    });
});

}
