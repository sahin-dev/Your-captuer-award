import prisma from '../../../shared/prisma';
import ApiError from '../../../errors/ApiError';
import httpstatus from 'http-status';

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
