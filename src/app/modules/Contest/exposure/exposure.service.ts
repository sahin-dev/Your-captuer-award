import { ContestStatus } from "../../../../prismaClient";
import prisma from "../../../../shared/prisma";

export const EXPOSURE_BOOST_DURATION_MS = 60 * 60 * 1000 // a fresh submission/trade stays spotlighted for 1 hour
export const EXPOSURE_BOOST_WEIGHT_MULTIPLIER = 20 // how much more likely a spotlighted photo is to surface vs. its participant-level weight alone
export const EXPOSURE_MAX = 100
const EXPOSURE_DECAY_INTERVAL_MS = 60 * 1000
const EXPOSURE_DECAY_AMOUNT = 1

// Lowers every exposure meter by 1 for each minute since it last changed, so
// delayed scheduler ticks catch up. One update statement handles all participants
// at once, so the database does the work instead of one query per participant.
const decayExposureMeters = async () => {
    const activeContests = await prisma.contest.findMany({
        where:{status:ContestStatus.ACTIVE},
        select:{id:true}
    })
    if(activeContests.length === 0){
        return 0
    }

    const now = {$date:new Date().toISOString()}
    const lastChanged = {$ifNull:["$exposureUpdatedAt", "$updatedAt"]}
    const minutesPassed = {$floor:{$divide:[{$subtract:[now, lastChanged]}, EXPOSURE_DECAY_INTERVAL_MS]}}
    const hasDecayed = {$gt:[minutesPassed, 0]}

    const result = await prisma.$runCommandRaw({
        update:"contest_participants",
        updates:[{
            q:{
                contestId:{$in:activeContests.map(contest => ({$oid:contest.id}))},
                exposure_bonus:{$gt:0}
            },
            u:[{$set:{
                exposure_bonus:{$cond:[
                    hasDecayed,
                    {$max:[0, {$subtract:["$exposure_bonus", {$multiply:[minutesPassed, EXPOSURE_DECAY_AMOUNT]}]}]},
                    "$exposure_bonus"
                ]},
                exposureUpdatedAt:{$cond:[hasDecayed, now, lastChanged]}
            }}],
            multi:true
        }]
    })

    return Number(result.nModified ?? 0)
}

export const exposureService = {
    decayExposureMeters,
}
