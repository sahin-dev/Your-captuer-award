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

    const totalTimeSpan = nextOccurrence.getTime() - previousOccurrence.getTime();
    const passedTimeSpan = Math.abs(new Date().getTime() - previousOccurrence.getTime());

    const time_ratio = 0.2


    if (passedTimeSpan >= (totalTimeSpan * time_ratio)) {


        let duration = rContest.endDate.getTime() - rContest.startDate.getTime()



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

        console.log(`Updated next occurrence for recurring contest ID: ${newContest.id}`);
    }

}


//contest closed if the contest endtime has passed.
//closed status means contest is ended
//completed contests are ended contests and the user is participated those contests
//so, there is not separate completed contest in the database
//When contest ends: TEAM MODE contests will have all active matches ended and moved to match history

agenda.define("contest:watcher", async (job: Job) => {
    const { contestId } = job.attrs.data as { contestId: string };

    const contest = await contestService.getContestById(contestId)
    if (!contest) {
        console.error(`Contest:watcher - contest ${contestId} not found, skipping`)
        return
    }

    // Update contest status to CLOSED
    await prisma.contest.update({ where: { id: contestId }, data: { status: ContestStatus.CLOSED } })
    globalEventHandler.emit(Events.CONTEST_ENDED, contestId)
    console.log(`Contest ${contestId} has ended and moved to CLOSED status`)

    // Wrap awarding in try-catch so the contest still closes even if awarding fails
    try {
        // Award individual winners
        await contestService.identifyWinner(contestId)
        console.log(`Contest ${contestId} - Individual winners identified`)

        // For TEAM mode contests: End all active team matches and move them to history
        if (contest.mode === ContestMode.TEAM) {
            await contestService.awardTeams(contestId)
            console.log(`Contest ${contestId} - All active team matches ended and moved to history`)
        }
        
        console.log(`Contest ${contestId} awards completed successfully`)
    } catch (err) {
        console.error(`Contest ${contestId} awarding failed:`, err)
        // Contest is already CLOSED — the error is logged for manual investigation
        // Do not re-throw so Agenda doesn't retry and re-run the entire job
    }
});

agenda.define("exposure:watcher", async (job: Job) => {
    const { contestPhotoId } = job.attrs.data as { contestPhotoId: string }

    const contestPhoto = await prisma.contestPhoto.findUnique({ where: { id: contestPhotoId }, include: { participant: true } })
    if (!contestPhoto) {
        console.log(`Exposure watcher: photo ${contestPhotoId} not found, cancelling this job`)
        // Cancel only THIS specific job, not all exposure:watcher jobs
        await job.remove()
        return
    }

    const updatedBonus = contestPhoto.participant.exposure_bonus - 10
    await prisma.contestParticipant.update({ where: { id: contestPhoto.participant.id }, data: { exposure_bonus: updatedBonus < 0 ? 0 : updatedBonus } })

    if (updatedBonus <= 0) {
        // Cancel only THIS specific job, not all exposure:watcher jobs
        await job.remove()
    }
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


export default agenda;