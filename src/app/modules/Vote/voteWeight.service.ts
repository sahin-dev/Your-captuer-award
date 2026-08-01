import prisma from "../../../shared/prisma";

type VoteWeightRecord = {
    weight?: number | null;
    power?: number | null;
}

export const getVoteWeight = (vote:VoteWeightRecord) => {
    return vote.weight ?? vote.power ?? 1
}

export const sumVoteWeight = async (where:any) => {
    const votes = await prisma.vote.findMany({
        where,
        select:{
            weight:true,
            power:true
        }
    })

    return votes.reduce((total, vote) => total + getVoteWeight(vote), 0)
}

export const getVoteWeightStats = async (where:any) => {
    const votes = await prisma.vote.findMany({
        where,
        select:{
            weight:true,
            power:true
        }
    })

    return {
        count:votes.length,
        weight:votes.reduce((total, vote) => total + getVoteWeight(vote), 0)
    }
}
