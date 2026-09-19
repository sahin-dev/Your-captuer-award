import prisma from "../../../shared/prisma";

type VoteWeightRecord = {
    weight?: number | null;
    power?: number | null;
}

// Vote power/weight fields remain in the database for backwards compatibility,
// but contest scoring is record-based: every Vote row contributes exactly one.
export const getVoteWeight = (_vote:VoteWeightRecord) => {
    return 1
}

export const sumVoteWeight = async (where:any) => {
    return prisma.vote.count({where})
}

export const getVoteWeightStats = async (where:any) => {
    const count = await prisma.vote.count({where})

    return {
        count,
        // Kept as an API compatibility alias. It now intentionally equals the
        // number of vote records rather than stored historical vote weights.
        weight:count
    }
}
