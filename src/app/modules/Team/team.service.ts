import prisma from '../../../shared/prisma';
import ApiError from '../../../errors/ApiError';
import httpstatus from 'http-status';
import { fileUploader } from '../../../helpers/fileUploader';
import { ITeam } from './team.interface';
import { ContestMode, TeamAccessibility } from '../../../prismaClient';
import { userService } from '../User/user.service';
import { contestService } from '../Contest/contest.service';
import sendResponse from '../../../shared/ApiResponse';


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
            min_requirement:parseInt(body.min_requirement),
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


const getTeam = async (teamId:string)=>{
    const team = await isTeamExist(teamId)

    if(!team){
        throw new ApiError(httpstatus.NOT_FOUND, "team not found")
    }
    return team
}

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

const getMyTeamDetails = async (userId:string)=>{
    const member = await prisma.teamMember.findFirst({where:{memberId:userId}})
    if(!member){
        throw new ApiError(httpstatus.NOT_FOUND, "team does not found")
    }
    const team = await prisma.team.findUnique({where:{id:member.teamId}})

  return team
}


//Suggest Team based on user language and country


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


const isTeamExist = async (teamId:string)=>{
    const team = await prisma.team.findUnique({where:{id:teamId}})
    return team != null? team: false
}


//Delete a team
export const deleteTeam = async (teamId: string) => {
    const existingTeam = await prisma.team.findUnique({ where: { id: teamId } });

    if (!existingTeam) {
        throw new ApiError(httpstatus.NOT_FOUND, 'Team not found');
    }

    await prisma.team.delete({ where: { id: teamId } });

    return { message: 'Team deleted successfully' };
};



const joinATeam = async (userId:string, teamId:string)=>{
    const team = await getTeam(teamId)
    if(!team){
        throw new ApiError(httpstatus.NOT_FOUND, "Team not found")
    }
    const user = await prisma.user.findUnique({where:{id:userId}})
    if (!user){
        throw new ApiError(httpstatus.NOT_FOUND, 'User not found')
    }

    const existingTeam = await prisma.teamMember.findFirst({where:{memberId:userId}})
    if(existingTeam){
        throw new ApiError(httpstatus.BAD_REQUEST, "You are already joined a team!")
    }

    // if(team.min_requirement >= (await userService.getUserCurrentLevel(userId))){
    //     throw new ApiError(httpstatus.BAD_REQUEST, "Sorry, you can not join this team")
    // }

    const newMemeber = await prisma.teamMember.create({data:{memberId:userId, teamId}})

    return newMemeber
}


const isTeamMemberExist = async (userId:string, teamId:string)=>{

    const member = await prisma.teamMember.findUnique({where:{memberId:userId, teamId}})

    return member || false
}



const joinTeamContest = async (userId:string,contestId:string, teamId:string)=>{
    const contest = await contestService.getContestById(contestId)
    if(contest?.mode !== ContestMode.TEAM){
        throw new ApiError(httpstatus.BAD_REQUEST, "Contest is only for solo participation")
    }
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "Team contest not found")
    }
    const teamMember = await prisma.teamMember.findFirst({where:{memberId:userId, teamId}})
    if(!teamMember){
        throw new ApiError(httpstatus.NOT_FOUND, "Team member does not exist")
    }
    const contestParticipant = await prisma.contestParticipant.create({data:{memberId:teamMember.id,userId:userId, contestId}})

}

const getJoinedTeamContests = async (userId:string)=>{
    const teamJoinedContests = await prisma.contestParticipant.findMany({where:{userId}})

    return teamJoinedContests
}

const getAllTeamMember = async (teamId:string)=>{
    const team = await prisma.team.findUnique({where:{id:teamId}})

    if(!team){

        throw new ApiError(httpstatus.NOT_FOUND, 'Team not found')
    }
    const members = await prisma.teamMember.findMany({where:{teamId}, include:{member:{select:{id:true, avatar:true, firstName:true, lastName:true, fullName:true}}}})

    return members
}


export const teamService = {
    createTeam, getTeams, getTeamDetails, updateTeam, deleteTeam, joinATeam, isTeamExist, isTeamMemberExist, getAllTeamMember, getMyTeamDetails
}