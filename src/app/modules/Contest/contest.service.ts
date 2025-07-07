import prisma from '../../../shared/prisma';
import ApiError from '../../../errors/ApiError';
import httpstatus from 'http-status';


// Fetch completed contest details with winner
export const getCompletedContestsWithWinner = async () => {
    // Fetch contests with status 'COMPLETED' (enum)
    const contests = await prisma.contest.findMany({
        where: { status: 'COMPLETED' },
        include: {
            creator: true,
            participants: {
                include: {
                    user: true,
                }
            },
        }
    });

    // For each contest, fetch photos and determine the winner
    const results = [];
    for (const contest of contests) {
        // Fetch all contest photos for this contest
        const contestPhotos = await prisma.contestPhoto.findMany({
            where: { contestId: contest.id },
            include: { photo: true }
        });
        let winner = null;
        if (contestPhotos && contestPhotos.length > 0) {
            let maxVotes = -1;
            for (const contestPhoto of contestPhotos) {
                const voteCount = await prisma.vote.count({ where: { photoId: contestPhoto.id } });
                if (voteCount > maxVotes) {
                    maxVotes = voteCount;
                    winner = contestPhoto.photo;
                }
            }
        }
        results.push({
            ...contest,
            winner,
        });
    }
    return results;
};

export const handleCreateContest = async (creatorId: string, body: any) => {
    const contest = await prisma.contest.create({
        data: {
            creatorId,
            status: body.status,
            recurring: body.recurring,
            recurringType: body.recurringType,
            startDate: body.startDate,
            endDate: body.endDate
        }
    });

    return contest;
};

export const handleGetContests = async () => {
    const contests = await prisma.contest.findMany({
        include: { creator: true, participants: true }
    });

    return contests;
};

export const handleJoinContest = async (contestId: string, userId: string) => {
    const participant = await prisma.contestParticipant.create({
        data: { contestId, userId }
    });

    return participant;
};


export const getRemainingPhotos = async (userId:string, contestId:string)=>{
    
}