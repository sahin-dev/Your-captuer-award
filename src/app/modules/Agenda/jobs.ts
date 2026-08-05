import { ContestOccurrenceStatus, ContestStatus, RecurringContest, RecurringContestStatus } from '../../../prismaClient';
import { Agenda, Job } from "agenda";
import prisma from '../../../shared/prisma';
import {contestService } from '../Contest/contest.service';
import { calculateNextOccurance } from '../../../helpers/nextOccurance';
import { ContestRuleConfigInput } from '../Contest/ContestRules/contestRules.type';
import { contestRuleService } from '../Contest/ContestRules/contestRules.service';
import { getAwardSlotKey } from '../Awards/award.definitions';



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
            await scheduleContest(contest);
        }catch(error){
            console.error(`Failed to generate recurring contest ${contest.id}`, error)
        }
    }
});


async function scheduleContest(rContest:RecurringContest){
    const previousOccurrence = rContest.recurring.previousOccurrence || rContest.createdAt;
    const nextOccurrence = rContest.recurring.nextOccurrence;
    const generatedOccurrences = rContest.recurring.generatedOccurrences || 0
    if(
        (rContest.recurring.endsAt && nextOccurrence > rContest.recurring.endsAt) ||
        (rContest.recurring.maxOccurrences && generatedOccurrences >= rContest.recurring.maxOccurrences)
    ){
        await prisma.recurringContest.update({
            where:{id:rContest.id},
            data:{status:RecurringContestStatus.ENDED}
        })
        return
    }
    const totalTimeSpan = nextOccurrence.getTime() - previousOccurrence.getTime();
    const generationLeadTime = Math.min(Math.max(totalTimeSpan * 0.2, 0), 24 * 60 * 60 * 1000)
    const generationAt = nextOccurrence.getTime() - generationLeadTime

    if(Date.now() < generationAt){
        return
    }

    const occurrenceKey = `${rContest.id}:${nextOccurrence.toISOString()}`
    const occurrence = await prisma.recurringContestOccurrence.upsert({
        where:{occurrenceKey},
        update:{},
        create:{occurrenceKey, recurringContestId:rContest.id, scheduledAt:nextOccurrence}
    })

    if(occurrence.status === ContestOccurrenceStatus.MATERIALIZED){
        return
    }

    const staleBefore = new Date(Date.now() - 15 * 60 * 1000)
    const claimed = await prisma.recurringContestOccurrence.updateMany({
        where:{
            occurrenceKey,
            OR:[
                {status:{in:[ContestOccurrenceStatus.PENDING, ContestOccurrenceStatus.FAILED]}},
                {status:ContestOccurrenceStatus.MATERIALIZING, startedAt:{lte:staleBefore}}
            ]
        },
        data:{status:ContestOccurrenceStatus.MATERIALIZING, startedAt:new Date(), error:null}
    })
    if(claimed.count !== 1){
        return
    }

    try{
        const duration = rContest.recurring.duration || (rContest.endDate.getTime() - rContest.startDate.getTime())
        const endDate = new Date(nextOccurrence.getTime() + duration)
        const initialStatus = nextOccurrence <= new Date() ? ContestStatus.ACTIVE : ContestStatus.UPCOMING
        const rawRules = typeof rContest.rules === "string"
            ? JSON.parse(rContest.rules) as ContestRuleConfigInput[]
            : rContest.rules as ContestRuleConfigInput[]
        const rules = contestRuleService.normalizeContestRules(rawRules)
        const awards = await prisma.recurringContestAward.findMany({where:{recurringContestId:rContest.id}})
        const next = calculateNextOccurance(nextOccurrence, rContest.recurring.recurringType)

        const newContest = await prisma.$transaction(async tx => {
            const contest = await tx.contest.create({
                data:{
                    title:rContest.title,
                    banner:rContest.banner,
                    isMoneyContest:rContest.isMoneyContest,
                    maxPrize:rContest.maxPrize,
                    minPrize:rContest.minPrize,
                    currency:rContest.currency,
                    entryFeeCoins:rContest.entryFeeCoins,
                    category:rContest.category,
                    description:rContest.description,
                    creatorId:rContest.creatorId,
                    recurringContestId:rContest.id,
                    startDate:nextOccurrence,
                    endDate,
                    status:initialStatus,
                    maxUpload:contestRuleService.getSubmissionLimitFromRules(rules),
                    ...(initialStatus === ContestStatus.ACTIVE && {startedAt:new Date()})
                }
            })

            await tx.contestRuleConfig.createMany({
                data:rules.map(rule => ({
                    contestId:contest.id,
                    key:rule.key,
                    value:rule.value,
                    enabled:rule.enabled ?? true,
                    order:rule.order ?? 0
                }))
            })

            if(awards.length > 0){
                await tx.contestAward.createMany({
                    data:awards.map(award => ({
                        contestId:contest.id,
                        prizeId:award.prizeId,
                        category:award.category,
                        type:award.type,
                        target:award.target,
                        rankLimit:award.rankLimit,
                        slotKey:award.slotKey || getAwardSlotKey(award),
                        title:award.title,
                        description:award.description,
                        icon:award.icon,
                        key:award.key,
                        boost:award.boost,
                        swap:award.swap,
                        coin:award.coin,
                        enabled:award.enabled,
                        order:award.order
                    }))
                })
            }

            await tx.recurringContestOccurrence.update({
                where:{occurrenceKey},
                data:{status:ContestOccurrenceStatus.MATERIALIZED, contestId:contest.id, error:null}
            })
            await tx.recurringContest.update({
                where:{id:rContest.id},
                data:{
                    lastGeneratedContestId:contest.id,
                    status:(
                        (rContest.recurring.endsAt && next > rContest.recurring.endsAt) ||
                        (rContest.recurring.maxOccurrences && generatedOccurrences + 1 >= rContest.recurring.maxOccurrences)
                    ) ? RecurringContestStatus.ENDED : RecurringContestStatus.ACTIVE,
                    recurring:{set:{
                        ...rContest.recurring,
                        previousOccurrence:nextOccurrence,
                        nextOccurrence:next,
                        generatedOccurrences:generatedOccurrences + 1
                    }}
                }
            })

            return contest
        })

        if(initialStatus === ContestStatus.ACTIVE){
            await agenda.schedule(endDate, "contest:watcher", {contestId:newContest.id})
        }
        console.log(`Generated recurring contest instance ${newContest.id} from template ${rContest.id}`)
    }catch(error){
        await prisma.recurringContestOccurrence.update({
            where:{occurrenceKey},
            data:{status:ContestOccurrenceStatus.FAILED, error:error instanceof Error ? error.message : String(error)}
        })
        throw error
    }
}


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
        }catch(error){
            console.error(`Failed to finalize contest ${contest.id}`, error)
        }
    }
})

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
