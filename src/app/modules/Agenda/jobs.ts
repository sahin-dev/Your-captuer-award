import { ContestMode, ContestStatus, RecurringContest } from '../../../prismaClient';
import { Job } from "agenda";
import prisma from '../../../shared/prisma';
import agenda from "./init";
import { contestService } from '../Contest/contest.service';
import { calculateNextOccurance } from '../../../helpers/nextOccurance';
import { ContestRule } from '../Contest/ContestRules/contestRules.type';
import { ContestPrize } from '../Contest/ContestPrizes/contestPrize.type';
import globalEventHandler from '../../event/eventEmitter';
import Events from '../../event/events.constant';
import { userLevelService } from '../Level/userLevel.service';



//Check all upcoming contest
// If found any upcoming contest which startdate has arrived or passed the scheduler start the contest and change the contest to OPEN
//Also shcedule a job for every contest which will end the contest at the end time

agenda.define('contest:checkUpcoming', async () => {

    const contests = await prisma.contest.findMany({
        where: { status: ContestStatus.UPCOMING },
    });

    if (contests.length <= 0) {
        console.log("There is no upcoming contest")
    }
    // FIX: Use for loop instead of forEach to properly await async operations
    for (const contest of contests) {
        const startDate = contest.startDate
        const currentDate = new Date()

        if (startDate <= currentDate) {
            const updatedContest = await prisma.contest.update({ where: { id: contest.id }, data: { status: ContestStatus.ACTIVE, startedAt: new Date(Date.now()) } })
            console.log(`Contest with id: ${contest.id} has started`)
            agenda.schedule(contest.endDate, "contest:watcher", { contestId: updatedContest.id })
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

agenda.define("contest:active", async () => {
    const upcomingContest = await contestService.getUpcomingContest()
    if (upcomingContest.length > 0) {
        console.log(`Found ${upcomingContest.length} upcoming contests`)
    }

    for (const contest of upcomingContest) {
        let contestStartDate = new Date(contest.startDate).getTime()
        let currentDate = new Date().getTime()

        if (currentDate >= contestStartDate) {
            // Atomic update: only update if still UPCOMING to prevent double-scheduling
            const updated = await prisma.contest.updateMany({
                where: { id: contest.id, status: ContestStatus.UPCOMING },
                data: { status: ContestStatus.ACTIVE, startedAt: new Date() }
            })

            // Only schedule the watcher if we actually transitioned the status
            if (updated.count > 0) {
                agenda.schedule(contest.endDate, "contest:watcher", { contestId: contest.id })
                console.log(`Contest ${contest.id} activated, watcher scheduled for ${contest.endDate}`)
            }
        }
    }
})



agenda.define("contest:checkRecurring", async () => {

    const recurringContests = await prisma.recurringContest.findMany();
    if (recurringContests.length > 0) {
        console.log(`Found ${recurringContests.length} recurring contests to process.`);
    }

    for (const contest of recurringContests) {
        await scheduleContest(contest);
    }
});


async function scheduleContest(rContest: RecurringContest) {

    const previousOccurrence = rContest.recurring.previousOccurrence || rContest.createdAt;
    const nextOccurrence = rContest.recurring.nextOccurrence;
    const now = new Date();

    // Duration of each contest instance (derived from the template's own start/end)
    const duration = rContest.endDate.getTime() - rContest.startDate.getTime();

    // The end time of the last generated contest instance.
    // previousOccurrence holds the startDate of the last created contest, so:
    //   lastContestEndDate = previousOccurrence (startDate) + duration
    const lastContestEndDate = new Date(previousOccurrence.getTime() + duration);

    // Guard 1: The last generated contest must have ended before we create the next one.
    if (now < lastContestEndDate) {
        console.log(`Recurring ${rContest.id}: last contest hasn't ended yet (ends ${lastContestEndDate.toISOString()}), skipping.`);
        return;
    }

    // Guard 2: Calculate 80% of the gap between lastContestEndDate and nextOccurrence.
    // Only create the next upcoming contest once 80% of that gap has elapsed.
    const gapSpan = nextOccurrence.getTime() - lastContestEndDate.getTime();
    const elapsedSinceEnd = now.getTime() - lastContestEndDate.getTime();

    const time_ratio = 0.8;

    // If there is no gap (endDate >= nextOccurrence), fire immediately after end.
    const threshold = gapSpan > 0 ? gapSpan * time_ratio : 0;

    if (elapsedSinceEnd < threshold) {
        console.log(`Recurring ${rContest.id}: waiting for 80% gap after last contest end. Elapsed: ${Math.round(elapsedSinceEnd / 60000)}min / ${Math.round(threshold / 60000)}min needed.`);
        return;
    }

    const newContest = await prisma.contest.create({
        data: {
            title: rContest.title,
            banner: rContest.banner,
            maxUploads: rContest.maxUploads,
            isMoneyContest: rContest.isMoneyContest,
            maxPrize: rContest.maxPrize,
            minPrize: rContest.minPrize,
            level_requirements: rContest.level_requirements,
            description: rContest.description,
            creatorId: rContest.creatorId,
            startDate: nextOccurrence,
            endDate: new Date(nextOccurrence.getTime() + duration),
            status: ContestStatus.UPCOMING,
        }
    })

    const rules = JSON.parse(rContest.rules as string) as ContestRule[]

    for (const rule of rules) {
        await prisma.contestRule.create({ data: { contestId: newContest.id, name: rule.name, description: rule.description } })
    }

    const prizes = JSON.parse(rContest.prizes as string) as ContestPrize[]

    for (const prize of prizes) {
        await prisma.contestPrize.create({ data: { contestId: newContest.id, category: prize.category, key: prize.key, boost: prize.boost, swap: (prize.swap) } })
    }

    const next = calculateNextOccurance(newContest.startDate, rContest.recurring.recurringType)

    await prisma.recurringContest.update({
        where: { id: rContest.id },
        data: {
            recurring: {
                recurringType: rContest.recurring.recurringType,
                previousOccurrence: newContest.startDate,
                nextOccurrence: next
            }
        }
    })

    console.log(`Recurring ${rContest.id}: created upcoming contest ${newContest.id} (starts ${nextOccurrence.toISOString()}). Next occurrence set to ${next.toISOString()}`);

}



//contest closed if the contest endtime has passed.
//closed status means contest is ended
//completed contests are ended contests and the user is participated those contests
//so, there is not separate completed contest in the database
//When contest ends: TEAM MODE contests will have all active matches ended and moved to match history

agenda.define("contest:watcher", async (job: Job) => {
    const { contestId } = job.attrs.data as { contestId: string };
    console.log(`Contest watcher triggered for contest ID: ${contestId}`)
    const contest = await contestService.getContestById(contestId)
    if (!contest) {
        console.error(`Contest:watcher - contest ${contestId} not found, skipping`)
        return
    }


    try {
        // Update contest status to CLOSED
        await prisma.contest.update({ where: { id: contestId }, data: { status: ContestStatus.CLOSED } })
        globalEventHandler.emit(Events.CONTEST_ENDED, contestId)
        console.log(`Contest ${contestId} has ended and moved to CLOSED status`)

        // Wrap awarding in try-catch so the contest still closes even if awarding fails
        // Award individual winners
        try {
            await contestService.identifyWinner(contestId)
            console.log(`Contest ${contestId} - Individual winners identified`)
        } catch (err) {
            console.log(`Contest ${contestId} - Error identifying individual winners:`, err)
        }

        // For TEAM mode contests: End all active team matches and move them to history
        try {
            await contestService.awardTeams(contestId)
            console.log(`Contest ${contestId} - All active team matches ended and moved to history`)
        } catch (err) {
            console.log(`Contest ${contestId} - Error awarding teams or moving matches to history:`, err)
        }

        // Calculate participant total votes and update global user levels
        try {
            await userLevelService.updateLevelsForContest(contestId)
            console.log(`Contest ${contestId} - Participant global user levels updated`)
        } catch (err) {
            console.log(`Contest ${contestId} - Error updating global user levels:`, err)
        }

        console.log(`Contest ${contestId} awards completed successfully`)
    } catch (err) {
        console.error(`Contest ${contestId} awarding failed:`, err)
    }
    await job.remove()
});


agenda.define("exposure:watcher", async (job: Job) => {

    const { contestParticipantId } = job.attrs.data as { contestParticipantId: string }

    const participant = await prisma.contestParticipant.findUnique({ where: { id: contestParticipantId }, include: { contest: true } })



    if (!participant) {
        console.log(`Exposure watcher: participant ${contestParticipantId} not found, cancelling this job`)
        // Cancel only THIS specific job, not all exposure:watcher jobs
        await job.remove()
        return
    }


    if (participant?.contest.status === ContestStatus.CLOSED) {
        await job.remove()
        return
    }

    if (participant.exposure_bonus <= 0) {
        await job.remove()
        return
    }

    const updatedBonus = Math.max(0, participant.exposure_bonus - 1)
    await prisma.contestParticipant.update({ where: { id: contestParticipantId }, data: { exposure_bonus: updatedBonus } })

    if (updatedBonus <= 0) {
        await job.remove()
    }

})


agenda.define("promotion:remove", async (job: Job) => {
    const { contestPhotoId } = job.attrs.data as { contestPhotoId?: string };

    if (!contestPhotoId) {
        console.log(`promotion:remove job missing contestPhotoId, removing job`);
        await job.remove();
        return;
    }

    const contestPhoto = await prisma.contestPhoto.findUnique({ where: { id: contestPhotoId } });
    if (contestPhoto) {
        await prisma.contestPhoto.update({
            where: { id: contestPhotoId },
            data: { promoted: false, promotionExpiresAt: null }
        });
        console.log(`Promotion removed for photo ID: ${contestPhotoId}`);
    } else {
        console.log(`No contest photo found with ID: ${contestPhotoId}`);
    }

    await job.remove();
});


export default agenda;