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
