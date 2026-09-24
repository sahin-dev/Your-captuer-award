import { ContestStatus, Prisma, RecurringContestStatus } from '../../../prismaClient';
import { Agenda, Job } from "agenda";
import prisma from '../../../shared/prisma';
import {contestService } from '../Contest/contest.service';
import { teamService } from '../Team/team.service';
import logger from "../../../shared/logger";

const notDeleted:Prisma.ContestWhereInput = {OR:[{deletedAt:null}, {deletedAt:{isSet:false}}]}



//Check all upcoming contest
// If found any upcoming contest which startdate has arrived or passed the scheduler start the contest and change the contest to OPEN
//Also shcedule a job for every contest which will end the contest at the end time

export const registerAgendaJobs = (agenda:Agenda) => {

agenda.define('contest:checkUpcoming', async () => {

    const contests = await prisma.contest.findMany({
        where: { status:ContestStatus.UPCOMING, ...notDeleted },
    });

    if (contests.length <= 0){
        logger.debug("No upcoming contest to activate")
    }
    for (const contest of contests) {
        try {
            const startDate = contest.startDate
            const currentDate = new Date()

            if (startDate <= currentDate){
                const updatedContest = await prisma.contest.update({where:{id:contest.id}, data:{status:ContestStatus.ACTIVE, startedAt:new Date(Date.now())}})
                logger.info({ contestId: contest.id }, "Contest started")
                await agenda.schedule(contest.endDate, "contest:watcher",{contestId:updatedContest.id})
            }
        } catch (error) {
            logger.error({ err: error, contestId: contest.id }, "Failed to activate upcoming contest")
        }
    }

});

// agenda.define("contest:recurring", async ()=> {
//     const recurringContests = await prisma.recurringContest.findMany({
//         where: {
//             nextOccurrence: {
//                 lte: new Date()
//             }
//         },
// })



//     for (const contest of recurringContests) {
//         const newContest = await prisma.contest.create({
//             data: {
//                 title: contest.title,
//                 description: contest.description,
//                 creatorId: contest.creatorId,
//                 startDate: contest.startDate,
//                 endDate: contest.endDate,

//                 recurring: true,
//                 recurringType: contest.type,
//                 nextOccurrence: new Date(new Date(contest.nextOccurrence).getTime() + 24 * 60 * 60 * 1000), // Increment by one day
//                 status: ContestStatus.NEW,
//                 type: ContestType.RECURRING,
//             }
//         });
//         await prisma.recurringContest.update({
//             where: { id: contest.id },
//             data: { nextOccurrence: new Date(new Date(contest.nextOccurrence).getTime() + 24 * 60 * 60 * 1000) } // Increment next occurrence
//         });
//         await agenda.schedule(newContest.startDate, 'contest:checkUpcoming', newContest.id);
//     }
// });

agenda.define("contest:active", async ()=>{
    const now = new Date()
    const upcomingContest = await prisma.contest.findMany({
        where:{status:ContestStatus.UPCOMING, startDate:{lte:now}, ...notDeleted}
    })
    logger.debug(`Found ${upcomingContest.length} upcoming contests`)
    for(const contest of upcomingContest){
        const activated = await prisma.contest.updateMany({
            where:{id:contest.id, status:ContestStatus.UPCOMING, ...notDeleted},
            data:{status:ContestStatus.ACTIVE, startedAt:now}
        })
        if(activated.count === 1){
            await agenda.schedule(contest.endDate,"contest:watcher", {contestId:contest.id})
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
    const contests = await prisma.contest.findMany({
        where:{
            OR:[
                {status:ContestStatus.ACTIVE, endDate:{lte:new Date()}},
                {status:ContestStatus.FINALIZATION_FAILED},
                // A contest whose finalizer died mid-run stays FINALIZING with
                // nothing else scheduled to touch it. finalizeContest re-claims
                // it only once its lease has gone stale, so a healthy run in
                // progress is simply skipped here.
                {status:ContestStatus.FINALIZING, endDate:{lte:new Date()}}
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

// Recovery path for a missed/delayed one-off promotion job.
agenda.define("promotion:sweep", async () => {
    await prisma.contestPhoto.updateMany({
        where: { promoted: true, promotionExpiresAt: { lte: new Date() } },
        data: { promoted: false, promotionExpiresAt: null }
    });
});

}
