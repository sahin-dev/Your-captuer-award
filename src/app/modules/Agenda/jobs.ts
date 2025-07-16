import { Contest, ContestStatus, ContestType, RecurringContest, RecurringData, RecurringType } from '@prisma/client';
import prisma from '../../../shared/prisma';
import agenda from "./init";


agenda.define('contest:checkUpcoming', async (contestId: any) => {

    const contest = await prisma.contest.findUnique({
        where: { id: contestId },
        include: { creator: true, participants: true }
    });

    if (!contest) return;

    const now = new Date();
    const startDate = new Date(contest.startDate);
    const endDate = new Date(contest.endDate);
    const totalDuration = endDate.getTime() - startDate.getTime();
    const passedDuration = now.getTime() - startDate.getTime();

    // If contest has started and 20% of the duration has passed, set status to 'UPCOMING'
    if (passedDuration > 0 && passedDuration >= 0.2 * totalDuration && contest.status !== 'UPCOMING') {
        await prisma.contest.update({
            where: { id: contestId },
            data: { status: 'UPCOMING' }
        });
        console.log(`Contest ${contestId} status changed to UPCOMING.`);
    }

    console.log(`Checked contest with ID: ${contestId}`);
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



agenda.define("contest:checkRecurring", async ()=>{

    const recurringContests = await prisma.recurringContest.findMany();
    console.log(`Found ${recurringContests.length} recurring contests to process.`);


    recurringContests.forEach(async (contest) => {
        await scheduleContest(contest);
    });
});


async function scheduleContest(contest:RecurringContest){
    const contestRecurringData = contest.recurringData;
    let next = null;

    if (contestRecurringData.recurringType === RecurringType.WEEKLY) {
        next = new Date(contestRecurringData.nextOccurrence);
        next.setDate(next.getDate() + 7); // Increment by one week
    } else if (contestRecurringData.recurringType === RecurringType.MONTHLY) {
        next = new Date(contestRecurringData.nextOccurrence);
        next.setMonth(next.getMonth() + 1); // Increment by one month
    } else {
        next = new Date(contestRecurringData.nextOccurrence);
        next.setDate(next.getDate() + 1);
        // next.setTime(next.getTime() + 1 * 60 * 1000) // Increment by one minute
    }


        const previousOccurrence = new Date(contestRecurringData.previousOccurrence);
        const nextOccurrence = new Date(contestRecurringData.nextOccurrence);

        const totalTimeSpan = nextOccurrence.getTime() - previousOccurrence.getTime();
        const passedTimeSpan = new Date().getTime() - previousOccurrence.getTime();

        if (passedTimeSpan >= totalTimeSpan * 0.2) {
                const newContest = await prisma.contest.create({
                data: {
               
                    title: contest.title,
                    description: contest.description,
                    creatorId: contest.creatorId,
                    startDate: nextOccurrence,
                    endDate: new Date(nextOccurrence.getTime()+ contestRecurringData.duration),
                    status: ContestStatus.UPCOMING,
        
                }
                
            })
            await prisma.recurringContest.update({
            where: { id: contest.id },
            data: {
                recurringData: {
                    ...contestRecurringData,
                    nextOccurrence: next,
                    previousOccurrence: nextOccurrence
                }
            }
        })
                console.log(`Updated next occurrence for recurring contest ID: ${contest.id}`);
        }

}


export default agenda;