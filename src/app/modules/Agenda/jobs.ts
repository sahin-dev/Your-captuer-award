import { Contest, ContestStatus, ContestType, RecurringContest, RecurringData, RecurringType } from '../../../prismaClient';
import { Job } from "agenda";
import prisma from '../../../shared/prisma';
import agenda from "./init";
import { awardWinners, identifyWinner } from '../Contest/contest.service';



//Check all upcoming contest
// If found any upcoming contest which startdate has arrived or passed the scheduler start the contest and change the contest to OPEN
//Also shcedule a job for every contest which will end the contest at the end time

agenda.define('contest:checkUpcoming', async () => {

    const contests = await prisma.contest.findMany({
        where: { status:ContestStatus.UPCOMING },
    });

    if (contests.length <= 0){
        console.log("There is no upcoming contest")
    } 
    contests.forEach(async(contest)=>{
        const startDate = contest.startDate
        const currentDate = new Date()

        if (startDate <= currentDate){
            const updatedContest = await prisma.contest.update({where:{id:contest.id}, data:{status:ContestStatus.ACTIVE}})
            console.log(`Contest with id: ${contest.id} has started`)
            agenda.schedule(contest.endDate, "contest:watcher",{contestId:updatedContest.id})
        }
    })

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


//contest closed if the contest endtime has passed.
//closed status means contest is ended
//completed contests are ended contests and the user is participated those contests
//so, there is not seaparte completed contest in the database

agenda.define("contest:watcher", async (job: Job) => {
    const { contestId} = job.attrs.data as {  contestId:string };
    
    await prisma.contest.update({where:{id:contestId}, data:{status:ContestStatus.CLOSED}})
        console.log(`Contest with id: ${contestId} has ended.`)
        console.log('Identifying winner=>')
        const winners = await identifyWinner(contestId)
        console.log("winners: ", winners)
        await awardWinners(winners)
        console.log("Winners awarded automatically")

       

    });


export default agenda;