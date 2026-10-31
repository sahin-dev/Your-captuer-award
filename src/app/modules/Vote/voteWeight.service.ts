import { VoteType } from "../../../prismaClient";
import prisma from "../../../shared/prisma";

type VoteWeightRecord = {
    power?: number | null;
}

// A vote counts as many votes as the voter's voting power when it was cast
// (Vote.power, copied from User.voting_power). `weight` stays 1 and is not used
// for scoring. Votes in contests that finished before power-based counting was
// introduced were normalized to power 1 so their results did not change.
export const getVoteWeight = (vote:VoteWeightRecord) => {
    const power = vote.power ?? 1
    return Number.isFinite(power) && power > 0 ? Math.floor(power) : 1
}

// The power to store on a new vote. Never below 1, so a missing or corrupt
// voting_power can not make a vote count for nothing.
export const getVotePowerForVoter = (voter:{voting_power?: number | null}) => {
    return getVoteWeight({power:voter.voting_power})
}

// The contest photo slots a user owns, optionally in one contest. Going from
// the user to their slots, then to the votes, uses an index at every step. The
// shorter filter {photo:{participant:{userId}}} makes Prisma start from every
// vote in the database and join each one, which took minutes at 1M votes.
export const getContestPhotoIdsOwnedByUser = async (userId:string, contestId?:string) => {
    const participants = await prisma.contestParticipant.findMany({
        where:{userId, ...(contestId && {contestId})},
        select:{id:true}
    })
    const slots = await prisma.contestPhoto.findMany({
        where:{participantId:{in:participants.map(participant => participant.id)}},
        select:{id:true}
    })

    return slots.map(slot => slot.id)
}

// Votes received by all of a user's photos.
export const getReceivedVoteStats = async (userId:string, filter:{contestId?:string; type?:VoteType} = {}) => {
    const contestPhotoIds = await getContestPhotoIdsOwnedByUser(userId, filter.contestId)

    return getVoteWeightStats({
        contestPhotoId:{in:contestPhotoIds},
        ...(filter.type && {type:filter.type})
    })
}

// Vote totals for a page of users in one batch, so a list of N users does not
// run N sets of queries.
export const getVoteTotalsByUser = async (userIds:string[], contestId?:string) => {
    const totals = new Map(userIds.map(userId => [userId, 0]))
    const participants = await prisma.contestParticipant.findMany({
        where:{userId:{in:userIds}, ...(contestId && {contestId})},
        select:{id:true, userId:true}
    })
    const slots = await prisma.contestPhoto.findMany({
        where:{participantId:{in:participants.map(participant => participant.id)}},
        select:{id:true, participantId:true}
    })
    const groups = await prisma.vote.groupBy({
        by:["contestPhotoId"],
        where:{contestPhotoId:{in:slots.map(slot => slot.id)}},
        _sum:{power:true}
    })

    const userIdByParticipantId = new Map(participants.map(participant => [participant.id, participant.userId]))
    const userIdBySlotId = new Map(slots.map(slot => [slot.id, userIdByParticipantId.get(slot.participantId)]))
    groups.forEach(group => {
        const userId = userIdBySlotId.get(group.contestPhotoId)
        if(userId){
            totals.set(userId, (totals.get(userId) ?? 0) + (group._sum.power ?? 0))
        }
    })

    return totals
}

export const sumVoteWeight = async (where:any) => {
    return (await getVoteWeightStats(where)).weight
}

export const getVoteWeightStats = async (where:any) => {
    const result = await prisma.vote.aggregate({
        where,
        _count:{_all:true},
        _sum:{power:true}
    })

    return {
        // Number of vote records, i.e. how many people voted.
        count:result._count._all,
        // Votes counted with voting power. This is the number shown as "votes".
        weight:result._sum.power ?? 0
    }
}
