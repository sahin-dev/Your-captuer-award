import { ContestStatus, ContestType, RecurringType } from '@prisma/client';
import prisma from '../../../shared/prisma';
import agenda from "./init";
import { create } from 'domain';

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
    const contests = await prisma.contest.findMany({
        where: {
            type: ContestType.RECURRING,
            recurring: true,
        },
        include: { creator: true, participants: true }
    });


    console.log(contests)

    console.log(`Found ${contests.length} contests to check.`);
    contests.forEach(async (contest) => {
        const contestRecurringData = contest.recurringData; 
        if (contestRecurringData?.recurringType === RecurringType.DAILY) {
            const nextOccurrence = new Date(contestRecurringData.nextOccurrence);
            if (nextOccurrence <= new Date()) {
                const newContest = await prisma.contest.create({
                    data: {
                        title: contest.title,
                        description: contest.description,
                        creatorId: contest.creatorId,
                        startDate: contest.startDate,
                        endDate: contest.endDate,
                        recurring: true,
                        status: ContestStatus.UPCOMING,
                        type: ContestType.RECURRING,
                    }
                });
                console.log(`Created new contest from recurring contest ID: ${contest.id}`);
                await prisma.contest.update({
                    where: { id: contest.id },
                    data: {
                        recurringData: {
                            ...contestRecurringData,
                            nextOccurrence: new Date(nextOccurrence.getTime() + 24 * 60 * 60 * 1000),// Increment next occurrence by one day
                            previousOccurrence:nextOccurrence 
                        }
                    }
                });
                console.log(`Updated next occurrence for recurring contest ID: ${contest.id}`);
                console.log(`Scheduled check for new contest ID: ${newContest.id}`);



        }
        } else if (contestRecurringData?.recurringType === RecurringType.WEEKLY) {
            const nextOccurrence = new Date(contestRecurringData.nextOccurrence);
            if (nextOccurrence <= new Date()) {
                const newContest = await prisma.contest.create({    
                    data: {
                        title: contest.title,
                        description: contest.description,
                        creatorId: contest.creatorId,
                        startDate: contest.startDate,
                        endDate: contest.endDate,
                        recurring: true,
                        status: ContestStatus.UPCOMING,
                        type: ContestType.RECURRING,
                    }
                });
                console.log(`Created new contest from recurring contest ID: ${contest.id}`);
                await prisma.contest.update({
                    where: { id: contest.id },
                    data: {
                        recurringData: {
                            ...contestRecurringData,
                            nextOccurrence: new Date(nextOccurrence.getTime() + 7 * 24 * 60 * 60 * 1000) // Increment next occurrence by one week
                        }
                    }
                });
                console.log(`Updated next occurrence for recurring contest ID: ${contest.id}`);
                console.log(`Scheduled check for new contest ID: ${newContest.id}`);
            }
        } else if (contestRecurringData?.recurringType === RecurringType.MONTHLY) {
            const nextOccurrence = new Date(contestRecurringData.nextOccurrence);
            if (nextOccurrence <= new Date()) {
                const newContest = await prisma.contest.create({
                    data: {
                        title: contest.title,
                        description: contest.description,
                        creatorId: contest.creatorId,
                        startDate: contest.startDate,
                        endDate: contest.endDate,
                        recurring: true,
                        status: ContestStatus.UPCOMING,
                        type: ContestType.RECURRING,
                    }
                });
                console.log(`Created new contest from recurring contest ID: ${contest.id}`);
                await prisma.contest.update({
                    where: { id: contest.id },
                    data: {
                        recurringData: {    
                            ...contestRecurringData,
                            nextOccurrence: new Date(nextOccurrence.getFullYear(), nextOccurrence.getMonth() +
                                1, nextOccurrence.getDate()) // Increment next occurrence by one month
                        }   
                    }
                });
                console.log(`Updated next occurrence for recurring contest ID: ${contest.id}`);
                console.log(`Scheduled check for new contest ID: ${newContest.id}`);
            }
        }

        const currentDate = new Date();
        console.log(new Date())
        const startDate = new Date(contest.startDate);
        const createdAt = new Date(contest.createdAt);
        const timePassed = currentDate.getTime() - createdAt.getTime();

        const remainingTime = startDate.getTime() - currentDate.getTime();
        if (timePassed > ((startDate.getTime() - createdAt.getTime()) * 0.2)) {
            await prisma.contest.update({
            where: { id: contest.id },
            data: { status: ContestStatus.UPCOMING }
        });
       
        console.log(`Contest ${contest.id} status changed to upcoming.`);
        }

    });

})


export default agenda;