import prisma from '../../../shared/prisma';
import ApiError from '../../../errors/ApiError';
import httpstatus from 'http-status';
import { fileUploader } from '../../../helpers/fileUploader';
import { ITeam } from './team.interface';
import { TeamAccessibility } from '@prisma/client';


//create a team
//Now, only admin can create  a team

export const createTeam = async (creatorId: string, body: ITeam, file:Express.Multer.File) => {

    const badgeUrl = await fileUploader.uploadToDigitalOcean(file)

    const team = await prisma.team.create({
        data: {
            creatorId,
            name:body.name,
            level: body.level,
            language: body.language,
            country: body.country,
            description: body.description,
            accessibility: body.accessibility as TeamAccessibility,
            badge: badgeUrl.Location,
        },
    });
    return team;
};

//Update team information


export const updateTeam = async (teamId: string, body: Partial<ITeam>, file?:Express.Multer.File) => {
    const existingTeam = await prisma.team.findUnique({ where: { id: teamId } });

    if (!existingTeam) {
        throw new ApiError(httpstatus.NOT_FOUND, 'Team not found');
    }

    let badgeUrl = existingTeam.badge
    if(file){
        badgeUrl = (await fileUploader.uploadToDigitalOcean(file)).Location
    }

    const updatedTeam = await prisma.team.update({
        where: { id: teamId },
        data: {
            name: body.name || existingTeam.name,
            level: body.level || existingTeam.level,
            language: body.language || existingTeam.language,
            country: body.country || existingTeam.country,
            description: body.description || existingTeam.description,
            accessibility: (body.accessibility || existingTeam.accessibility) as TeamAccessibility,
            badge: badgeUrl,
        },
    });

    return updatedTeam;
};

//Get all the teams

export const getTeams = async () => {
    const teams = await prisma.team.findMany({
        include: { creator: true, members: { include: { member: true } } },
    });
    return teams;
};


//get team details
export const getTeamDetails = async (teamId: string) => {
    const team = await prisma.team.findUnique({
        where: { id: teamId },
        include: { creator: true, members: { include: { member: true } } },
    });

    if (!team) {
        throw new ApiError(httpstatus.NOT_FOUND, 'Team not found');
    }

    return team;
};



// // Suggest channels to join, showing total members, votes, and badge
// export const getSuggestedTeams = async (userId: string, limit: number = 5) => {
//     // Check if user is already in a team
//     const userTeam = await prisma.teamMember.findFirst({
//         where: { memberId: userId },
//         select: { teamId: true }
//     });
//     if (userTeam) {
//         // User is already in a team, so do not suggest any teams
//         return [];
//     }

//     // User is not in any team, suggest teams they did not create
//     const teams = await prisma.team.findMany({
//         where: {
//             creatorId: { not: userId },
//         },
//         include: {
//             members: true,
//             _count: { select: { members: true } },
//         },
//         take: limit,
//         orderBy: { createdAt: 'desc' }
//     });

//     // If you have a votes table, count votes per team
//     // Otherwise, set totalVotes to 0 or implement as needed
//     // Here, we assume a 'vote' table with a 'teamId' field
//     const teamIds = teams.map(team => team.id);
//     let votesByTeam: Record<string, number> = {};
//     if (teamIds.length > 0 && prisma.vote) {
//         // Try to count votes per team using findMany and reduce
//         const votes = await prisma.vote.findMany({
//             where: { teamId: { in: teamIds } },
//         });
//         votesByTeam = votes.reduce((acc: Record<string, number>, v: any) => {
//             if (v.teamId) {
//                 acc[v.teamId] = (acc[v.teamId] || 0) + 1;
//             }
//             return acc;
//         }, {});
//     }

//     return teams.map(team => ({
//         id: team.id,
//         name: team.name,
//         badge: team.badge,
//         totalMembers: team._count?.members || (team.members ? team.members.length : 0),
//         totalVotes: votesByTeam[team.id] || 0,
//     }));
// };



//Delete a team
export const deleteTeam = async (teamId: string) => {
    const existingTeam = await prisma.team.findUnique({ where: { id: teamId } });

    if (!existingTeam) {
        throw new ApiError(httpstatus.NOT_FOUND, 'Team not found');
    }

    await prisma.team.delete({ where: { id: teamId } });

    return { message: 'Team deleted successfully' };
};


export const teamService = {
    createTeam, getTeams, getTeamDetails, updateTeam, deleteTeam
}