import prisma from '../../../shared/prisma';
import ApiError from '../../../errors/ApiError';
import httpstatus from 'http-status';

export const handleCreateTeam = async (creatorId: string, body: { name: string }) => {
    const team = await prisma.team.create({
        data: {
            creatorId,
        },
        include: {
            creator: true,
            members: true
        }
    });

    return team;
};

export const handleGetAllTeams = async () => {
    const teams = await prisma.team.findMany({
        include: {
            creator: true,
            members: {
                include: {
                    member: true
                }
            }
        }
    });

    return teams;
};

export const handleGetSingleTeam = async (teamId: string) => {
    const team = await prisma.team.findUnique({
        where: { id: teamId },
        include: {
            creator: true,
            members: {
                include: {
                    member: true
                }
            }
        }
    });

    if (!team) {
        throw new ApiError(httpstatus.NOT_FOUND, 'Team not found');
    }

    return team;
};


export const handleAddMember = async (teamId: string, memberId: string) => {
    const member = await prisma.teamMember.create({
        data: { teamId, memberId },
        include: { member: true }
    });
    return member;
};

export const handleRemoveMember = async (teamId: string, memberId: string) => {
    const teamMember = await prisma.teamMember.findFirst({
        where: { teamId, memberId }
    });

    if (!teamMember) {
        throw new ApiError(httpstatus.NOT_FOUND, 'Team member not found');
    }

    await prisma.teamMember.delete({
        where: { id: teamMember.id }
    });
};
