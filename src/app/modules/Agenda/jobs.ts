import { ContestStatus, RecurringContest, RecurringContestStatus } from '../../../prismaClient';
import { Agenda, Job } from "agenda";
import prisma from '../../../shared/prisma';
import {contestService } from '../Contest/contest.service';
import { calculateNextOccurance } from '../../../helpers/nextOccurance';
import { ContestRule } from '../Contest/ContestRules/contestRules.type';
import { ContestPrize } from '../Contest/ContestPrizes/contestPrize.type';
import globalEventHandler from '../../event/eventEmitter';
import Events from '../../event/events.constant';
import { prizeService } from '../Prize/prize.service';



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
    contests.forEach(async(contest)=>{
        const startDate = contest.startDate
        const currentDate = new Date()
        
        if (startDate <= currentDate){
            const updatedContest = await prisma.contest.update({where:{id:contest.id}, data:{status:ContestStatus.ACTIVE, startedAt:new Date(Date.now())}})
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

agenda.define("contest:active", async ()=>{
    const upcomingContest = await contestService.getUpcomingContest()
    console.log(`Found ${upcomingContest.length} upcoming contests`)
    upcomingContest.forEach(async  (contest) => {
        let contestStartDate = new Date(contest.startDate).getTime()
        let currentDate = new Date().getTime()
        console.log(contestStartDate)
        console.log(currentDate)
        if(currentDate >= contestStartDate){
            await prisma.contest.update({where:{id:contest.id}, data:{status:ContestStatus.ACTIVE}})
            agenda.schedule(contest.endDate,"contest:watcher", {contestId:contest.id})
        }
        
    })
})



agenda.define("contest:checkRecurring", async ()=>{

    const recurringContests = await prisma.recurringContest.findMany({
        where:{status:RecurringContestStatus.ACTIVE}
    });
    console.log(`Found ${recurringContests.length} recurring contests to process.`);

    for(const contest of recurringContests){
        await scheduleContest(contest);
    }
});


async function scheduleContest(rContest:RecurringContest){
    const previousOccurrence = rContest.recurring.previousOccurrence || rContest.createdAt;
    const nextOccurrence = rContest.recurring.nextOccurrence;

    const totalTimeSpan = nextOccurrence.getTime() - previousOccurrence.getTime();
    const passedTimeSpan = new Date().getTime() - previousOccurrence.getTime();

    const generationThreshold = 0.8
   

    if (totalTimeSpan <= 0 || passedTimeSpan < (totalTimeSpan * generationThreshold)) {
        return
    }

    const existingContest = await prisma.contest.findFirst({
        where:{
            recurringContestId:rContest.id,
            startDate:nextOccurrence
        }
    })

    let newContest = existingContest

    if(!newContest){
        let duration = rContest.recurring.duration || (rContest.endDate.getTime() - rContest.startDate.getTime())

        newContest = await prisma.contest.create({
            data: {
                title: rContest.title,
                banner:rContest.banner,
                maxUploads:rContest.maxUploads,
                isMoneyContest: rContest.isMoneyContest,
                maxPrize:rContest.maxPrize,
                minPrize:rContest.minPrize,
                level_requirements:rContest.level_requirements,
                description: rContest.description,
                creatorId: rContest.creatorId,
                recurringContestId:rContest.id,
                startDate: nextOccurrence,
                endDate: new Date(nextOccurrence.getTime() + duration),
                status: ContestStatus.UPCOMING,
            }
        })

        const rules = JSON.parse(rContest.rules as string) as ContestRule[]

        await Promise.all(rules.map(rule => 
            prisma.contestRule.create({data:{contestId:newContest!.id, name:rule.name, description:rule.description, icon:rule.icon}})
        ))

        await prizeService.copyRecurringAwardsToContest(rContest.id, newContest.id)

        if(rContest.prizes){
            const prizes = JSON.parse(rContest.prizes as string) as ContestPrize[]

            await Promise.all(prizes.map(prize => 
                prisma.contestPrize.create({data:{contestId:newContest!.id, category:prize.category, key:prize.key, boost:prize.boost, swap:prize.swap, coin:prize.coin || 0}})
            ))
        }
    }

    const next = calculateNextOccurance(nextOccurrence, rContest.recurring.recurringType)
    
    await prisma.recurringContest.update({
        where: { id: rContest.id },
        data: {
            lastGeneratedContestId:newContest.id,
            recurring: {
                set:{
                    ...rContest.recurring,
                    previousOccurrence: nextOccurrence,
                    nextOccurrence: next
                }
            }
        }
    })

    console.log(`Generated recurring contest instance ${newContest.id} from template ${rContest.id}`);

}


//contest closed if the contest endtime has passed.
//closed status means contest is ended
//completed contests are ended contests and the user is participated those contests
//so, there is not seaparte completed contest in the database

agenda.define("contest:watcher", async (job: Job) => {
    const { contestId} = job.attrs.data as {  contestId:string };

    const contest = await contestService.getContestById(contestId)
    if (!contest){
        throw new Error("'Contest:watcher, contest not found")
    }
    
    await prisma.contest.update({where:{id:contestId}, data:{status:ContestStatus.CLOSED}})
    globalEventHandler.emit(Events.CONTEST_ENDED,contestId)
    console.log(`Contest has ended ${contestId}`)
    
    await contestService.identifyWinner(contestId)
    // await contestService.awardTeams(contest.id)
});

agenda.define("exposure:watcher", async (job:Job) => {
    const {contestPhotoId}  = job.attrs.data as {contestPhotoId:string}

    const contestPhoto = await prisma.contestPhoto.findUnique({where:{id:contestPhotoId},include:{participant:true}})
    if(!contestPhoto){
        console.log("photo not found")
        await agenda.cancel({name: "exposure:watcher"})
        return
    }

    const updatedBonus = contestPhoto.participant.exposure_bonus - 10
    await prisma.contestParticipant.update({where:{id:contestPhoto.participant.id}, data:{exposure_bonus:updatedBonus < 0? 0: updatedBonus}})

     if(updatedBonus <= 0){
        await agenda.cancel({name: "exposure:watcher"})
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

}
