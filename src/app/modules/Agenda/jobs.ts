import { ContestStatus, RecurringContestStatus } from '../../../prismaClient';
import { Agenda, Job } from "agenda";
import prisma from '../../../shared/prisma';
import {contestService } from '../Contest/contest.service';
import { teamService } from '../Team/team.service';



//Check all upcoming contest
// If found any upcoming contest which startdate has arrived or passed the scheduler start the contest and change the contest to OPEN
//Also shcedule a job for every contest which will end the contest at the end time

export const registerAgendaJobs = (agenda:Agenda) => {

agenda.define('contest:checkUpcoming', async () => {

    const contests = await prisma.contest.findMany({
        where: { status:ContestStatus.UPCOMING },
    });

    if (contests.length <= 0){
        console.log("There is no upcoming contest")
    }
    for (const contest of contests) {
        try {
            const startDate = contest.startDate
            const currentDate = new Date()

            if (startDate <= currentDate){
                const updatedContest = await prisma.contest.update({where:{id:contest.id}, data:{status:ContestStatus.ACTIVE, startedAt:new Date(Date.now())}})
                console.log(`Contest with id: ${contest.id} has started`)
                await agenda.schedule(contest.endDate, "contest:watcher",{contestId:updatedContest.id})
            }
        } catch (error) {
            console.error(`Failed to activate upcoming contest ${contest.id}`, error)
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
//         console.log(`Created new contest from recurring contest ID: ${contest.id}`);
//         await prisma.recurringContest.update({
//             where: { id: contest.id },
//             data: { nextOccurrence: new Date(new Date(contest.nextOccurrence).getTime() + 24 * 60 * 60 * 1000) } // Increment next occurrence
//         });
//         console.log(`Updated next occurrence for recurring contest ID: ${contest.id}`);
//         await agenda.schedule(newContest.startDate, 'contest:checkUpcoming', newContest.id);
//         console.log(`Scheduled check for new contest ID: ${newContest.id}`);
//     }
// });

agenda.define("contest:active", async ()=>{
    const now = new Date()
    const upcomingContest = await prisma.contest.findMany({
        where:{status:ContestStatus.UPCOMING, startDate:{lte:now}}
    })
    console.log(`Found ${upcomingContest.length} upcoming contests`)
    for(const contest of upcomingContest){
        const activated = await prisma.contest.updateMany({
            where:{id:contest.id, status:ContestStatus.UPCOMING},
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
    console.log(`Found ${recurringContests.length} recurring contests to process.`);

    for(const contest of recurringContests){
        try{
            await contestService.materializeRecurringOccurrence(contest);
        }catch(error){
            console.error(`Failed to generate recurring contest ${contest.id}`, error)
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
        throw new Error("'Contest:watcher, contest not found")
    }

    await contestService.identifyWinner(contestId)
    await teamService.closeActiveMatchesForContest(contestId)
    console.log(`Contest has been finalized ${contestId}`)
});

agenda.define("contest:watchEnded", async () => {
    const contests = await prisma.contest.findMany({
        where:{
            OR:[
                {status:ContestStatus.ACTIVE, endDate:{lte:new Date()}},
                {status:ContestStatus.FINALIZATION_FAILED}
            ]
        },
        select:{id:true}
    })

    for(const contest of contests){
        try{
            await contestService.identifyWinner(contest.id)
            await teamService.closeActiveMatchesForContest(contest.id)
        }catch(error){
            console.error(`Failed to finalize contest ${contest.id}`, error)
        }
    }
})

agenda.define("teamMatch:watchStale", async () => {
    const closedCount = await teamService.retryStaleTeamMatches()
    if(closedCount > 0){
        console.log(`Auto-closed ${closedCount} stale team match(es) whose contest had already ended`)
    }
});

// Expires opponent searches that hit the 5-hour / contest-end matchmaking window without pairing up.
agenda.define("teamMatch:watchQueueTimeouts", async () => {
    const timedOutCount = await teamService.timeoutExpiredTeamMatchQueues()
    if(timedOutCount > 0){
        console.log(`Timed out ${timedOutCount} team match search(es) with no opponent found`)
    }
});

// Pays out coins to the top-3 teams' current members for the week/month that just ended.
// Idempotent per (team, member, period, periodKey) - safe if this fires more than once.
agenda.define("team:weeklyPayout", async () => {
    const result = await teamService.payoutPeriodRewards("WEEKLY")
    console.log(`Weekly team payout for period ${result.periodKey}: ${result.teamsRewarded} team(s) rewarded`)
});

agenda.define("team:monthlyPayout", async () => {
    const result = await teamService.payoutPeriodRewards("MONTHLY")
    console.log(`Monthly team payout for period ${result.periodKey}: ${result.teamsRewarded} team(s) rewarded`)
});

agenda.define("team:yearlyPayout", async () => {
    const result = await teamService.payoutPeriodRewards("YEARLY")
    console.log(`Yearly team payout for period ${result.periodKey}: ${result.teamsRewarded} team(s) rewarded`)
});

agenda.define("exposure:watcher", async (job:Job) => {
    const {contestPhotoId}  = job.attrs.data as {contestPhotoId:string}

    const contestPhoto = await prisma.contestPhoto.findUnique({where:{id:contestPhotoId},include:{participant:true}})
    if(!contestPhoto){
        console.log("photo not found")
        await agenda.cancel({name: "exposure:watcher", "data.contestPhotoId": contestPhotoId})
        return
    }

    // Exposure bonus decays 7% (compounding) every 30 minutes this job runs.
    const updatedBonus = Math.max(0, Math.round(contestPhoto.participant.exposure_bonus * 0.93))
    await prisma.contestParticipant.update({where:{id:contestPhoto.participant.id}, data:{exposure_bonus:updatedBonus}})
})


agenda.define("promotion:remove", async (job: Job) => {
    const { photoId } = job.attrs.data as { photoId: string };  
    const contestPhoto = await prisma.contestPhoto.findUnique({ where: { id: photoId } });
    if (contestPhoto) {
        await prisma.contestPhoto.update({
            where: { id: photoId },
            data: { promoted: false, promotionExpiresAt: null }
        });
        console.log(`Promotion removed for photo ID: ${photoId}`);
    } else {
        console.log(`No contest photo found with ID: ${photoId}`);
    }
});

}
