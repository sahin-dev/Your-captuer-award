import prisma from '../../../shared/prisma';
import ApiError from '../../../errors/ApiError';
import httpstatus from 'http-status';
import { fileUploader } from '../../../helpers/fileUploader';
import { ITeam } from './team.interface';
import { ContestMode, ContestStatus, MemberLevel, NotificationType, TeamAccessibility } from '../../../prismaClient';
import { contestService } from '../Contest/contest.service';
import { notificationService } from '../Notification/notification.service';
import { levelService } from '../Level/level.service';
import { voteService } from '../Vote/vote.service';
import { userService } from '../User/user.service';
import { paginationHelper } from '../../../helpers/paginationHelper';


//create a team
//Only subscribed users can create a team

export const createTeam = async (creatorId: string, body: ITeam, file:Express.Multer.File) => {

    // Check if user has an active subscription
    const user = await prisma.user.findUnique({
        where: { id: creatorId },
        include: { subscriptions: true }
    });

    if (!user) {
        throw new ApiError(httpstatus.NOT_FOUND, "User not found")
    }

    // Check if user has an active subscription plan
    // const hasActiveSubscription = user.subscriptions && user.subscriptions.some(sub => {
    //     const now = new Date();
    //     return sub.status === 'VALID' && sub.endDate && sub.endDate > now;
    // });

    // if (!hasActiveSubscription) {
    //     throw new ApiError(httpstatus.FORBIDDEN, "Only subscribed users can create a team. Please subscribe first.")
    // }

    if (await hasTeam(creatorId)) {
        throw new ApiError(httpstatus.BAD_REQUEST, "You are already joined a team!")
    }

    // const badgeUrl = await fileUploader.upload.single("badge")
    // const min_requirement = parseInt(body.min_requirement)

    // const level = await levelService.getLevelByOrder(min_requirement)

    const team = await prisma.team.create({
        data: {
            creatorId,
            name:body.name,
            level: body.level,
            language: body.language,
            country: body.country,
            description: body.description,
            min_requirement:`${body.min_requirement}`,
            min_requirement_str: 'None',
            accessibility: body.accessibility as TeamAccessibility,
            badge: file.path,
        },
    });

    await prisma.teamMember.create({data:{memberId:creatorId,teamId:team.id, level:MemberLevel.LEADER}})
    await prisma.team.update({where:{id:team.id}, data:{member_count:{increment:1}}})
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
        badgeUrl = (await fileUploader.uploadToCloudinary(file)).Location
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
            min_requirement: body.min_requirement || existingTeam.min_requirement,
            badge: badgeUrl,
        },
    });

    return updatedTeam;
};

//Get all the teams

export const getTeams = async (s?:string, page?: number, limit?: number) => {
    const paginationOptions = paginationHelper.calculatePagination({
        page: page || 1,
        limit: limit || 10,
        sortBy: 'createdAt',
        sortOrder: 'desc'
    });

    const teams = await prisma.team.findMany({
        where:{name:{contains:s, mode:"insensitive"}},
        skip: paginationOptions.skip,
        take: paginationOptions.limit,
        include: { creator: true, members: { include: { member: true } } },
        orderBy: { [paginationOptions.sortBy]: paginationOptions.sortOrder as any }
    });

    const total = await prisma.team.count({
        where:{name:{contains:s, mode:"insensitive"}}
    });
    const meta = paginationHelper.getPaginationMetaData(paginationOptions.page, paginationOptions.limit, total);

    return { data: teams, meta };
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
        include: { creator: {select:{id:true, avatar:true, fullName:true, firstName:true, lastName:true}}, members:{
            include:{member:{select:{id:true, avatar:true, fullName:true, firstName:true, lastName:true}}}
        } },
    });

    if (!team) {
        throw new ApiError(httpstatus.NOT_FOUND, 'Team not found');
    }

    return team;
};

const getMyTeamDetails = async (userId:string)=>{
    const member = await prisma.teamMember.findFirst({where:{memberId:userId}})
    if(!member){
        throw new ApiError(httpstatus.NOT_FOUND, "member does not found")
    }
    const team = await prisma.team.findUnique({where:{id:member.teamId}, include:{creator:true}})

    if(!team){
        throw new ApiError(httpstatus.NOT_FOUND, "team not found")
    }

    const memberCount = await prisma.teamMember.count({where:{teamId:team?.id}})

    const memberDetails = await getMembers(team.id)

  return {team, members:memberDetails,memberCount}
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


const getSuggestedTeams = async (userId:string, page?: number, limit?: number) => {
    const user = await userService.getUserDetails(userId)

    if(!user){
        throw new ApiError(httpstatus.NOT_FOUND, "user not found")
    }
    const country = user.country as string

    const paginationOptions = paginationHelper.calculatePagination({
        page: page || 1,
        limit: limit || 10,
        sortBy: 'createdAt',
        sortOrder: 'desc'
    });

    const teams = await prisma.team.findMany({
        where:{OR:[{country}, {min_requirement:`${user.currentLevel}`}]},
        skip: paginationOptions.skip,
        take: paginationOptions.limit,
        orderBy: { [paginationOptions.sortBy]: paginationOptions.sortOrder as any }
    })

    const total = await prisma.team.count({
        where:{OR:[{country}, {min_requirement:`${user.currentLevel}`}]}
    });

    const meta = paginationHelper.getPaginationMetaData(paginationOptions.page, paginationOptions.limit, total);

    return { data: teams, meta }
}

const isTeamExist = async (teamId:string)=>{
    const team = await prisma.team.findUnique({where:{id:teamId}})
    return team != null? team: false
}


//Delete a team
export const deleteTeam = async (userId:string, teamId: string) => {
    const existingTeam = await prisma.team.findUnique({ where: { id: teamId } });


    if (!existingTeam) {
        throw new ApiError(httpstatus.NOT_FOUND, 'Team not found');
    }

    const member = await prisma.teamMember.findFirst({where:{teamId:teamId, memberId:userId}})
    if(!member){
        throw new ApiError(httpstatus.BAD_REQUEST, "you are not member of this team.")
    }

    if(!member || member.level !== MemberLevel.LEADER){
        throw new ApiError(httpstatus.BAD_REQUEST, "You are not allowed to delete this team.")
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

    if(team.accessibility === TeamAccessibility.PRIVATE){
        throw new ApiError(httpstatus.BAD_REQUEST, "Sorry, you can not join this team without invitation")
    }

    if(team.member_count >= team.member_slots){
        throw new ApiError(httpstatus.BAD_REQUEST, "Sorry, this team is full")
    }

    // if(team.min_requirement >= (await userService.getUserCurrentLevel(userId))){
    //     throw new ApiError(httpstatus.BAD_REQUEST, "Sorry, you can not join this team")
    // }

    const newMemeber = await prisma.teamMember.create({data:{memberId:userId, teamId}})
    if(newMemeber){
        await prisma.team.update({where:{id:team.id}, data:{member_count:{increment:1}}})
    }

    return newMemeber
}


const isTeamMemberExist = async (userId:string, teamId:string)=>{

    const member = await prisma.teamMember.findUnique({where:{memberId:userId, teamId}})

    return member || false
}

const hasTeam =async (userId:string)=>{
    const userJoined = await prisma.teamMember.findFirst({where:{memberId:userId}})

    if(userJoined){
        return true
    }

    return false
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

const getAllTeamMember = async (teamId:string, page?: number, limit?: number)=>{
    const team = await prisma.team.findUnique({where:{id:teamId}})

    if(!team){

        throw new ApiError(httpstatus.NOT_FOUND, 'Team not found')
    }

    const paginationOptions = paginationHelper.calculatePagination({
        page: page || 1,
        limit: limit || 10,
        sortBy: 'createdAt',
        sortOrder: 'desc'
    });

    const members = await prisma.teamMember.findMany({
        where:{teamId},
        skip: paginationOptions.skip,
        take: paginationOptions.limit,
        include:{member:{select:{id:true, avatar:true, firstName:true, lastName:true, fullName:true}}},
        orderBy: { [paginationOptions.sortBy]: paginationOptions.sortOrder as any }
    })

    const total = await prisma.teamMember.count({where:{teamId}});
    const meta = paginationHelper.getPaginationMetaData(paginationOptions.page, paginationOptions.limit, total);

    return { data: members, meta }
}

/**
 * Get list of available TEAM contests for a team to participate in
 * Only shows contests with 5-24 hours remaining
 * @param teamId - The team ID
 * @returns List of active TEAM contests with participant count and time remaining
 */
const getAvailableTeamContests = async (teamId: string, page?: number, limit?: number) => {
    // Verify team exists
    const team = await isTeamExist(teamId)
    if (!team) {
        throw new ApiError(httpstatus.NOT_FOUND, "Team not found")
    }

    const paginationOptions = paginationHelper.calculatePagination({
        page: page || 1,
        limit: limit || 10,
        sortBy: 'startDate',
        sortOrder: 'asc'
    });

    // Get all active TEAM mode contests
    const allContests = await prisma.contest.findMany({
        where: {
            status: ContestStatus.ACTIVE
            // mode: ContestMode.TEAM
        },
        include: {
            participants: {
                where: { status: 'ACTIVE' },
                select: { userId: true }
            },
            _count: { select: { participants: {where:{user:{joinedTeam:{id:teamId}}}} } }
        },
        orderBy: { [paginationOptions.sortBy]: paginationOptions.sortOrder as any }
    })


    console.log("All active contests:", allContests)
    // Filter contests by time remaining (5-24 hours only)
    const now = new Date();
    const fiveHoursFromNow = new Date(now.getTime() + 5 * 60 * 60 * 1000);
    const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const contestsWithinTimeWindow = allContests.filter(contest => {
        const timeRemaining = contest.endDate.getTime() - now.getTime();
        const fiveHoursInMs = 5 * 60 * 60 * 1000;
        const twentyFourHoursInMs = 24 * 60 * 60 * 1000;

        return timeRemaining >= fiveHoursInMs && timeRemaining <= twentyFourHoursInMs;
    });
    console.log("Contests within time window:", contestsWithinTimeWindow);
    // Filter contests where team hasn't already participated
    const participatingMembers = await prisma.contestParticipant.findMany({
        where: { contestId: { in: contestsWithinTimeWindow.map(c => c.id) } },
        include: { member: { select: { teamId: true } } }
    })

    const teamContestParticipations = new Set(
        participatingMembers
            .filter(p => p.member?.teamId === teamId)
            .map(p => p.contestId)
    )

    const availableContests = contestsWithinTimeWindow.filter(contest => !teamContestParticipations.has(contest.id))

    // Apply pagination
    const paginatedContests = availableContests.slice(
        (paginationOptions.page - 1) * paginationOptions.limit,
        paginationOptions.page * paginationOptions.limit
    );

    const total = availableContests.length;
    const meta = paginationHelper.getPaginationMetaData(paginationOptions.page, paginationOptions.limit, total);

    const mappedContests = paginatedContests.map(contest => {
        const timeRemaining = contest.endDate.getTime() - now.getTime();
        const hoursRemaining = Math.floor(timeRemaining / (60 * 60 * 1000));

        return {
            id: contest.id,
            title: contest.title,
            description: contest.description,
            banner: contest.banner,
            startDate: contest.startDate,
            endDate: contest.endDate,
            maxUploads: contest.maxUploads,
            hoursRemaining,
            totalParticipants: contest._count.participants,
            participantDetails: contest.participants
        };
    });

    return { data: mappedContests, meta }
}

/**
 * Start team match with automatic rival team finding
 * Only LEADER and MODERATOR can start matches
 * Team admin selects a contest, system finds rival team with similar skill level and starts match
 * @param teamId - The team ID (team admin's team)
 * @param contestId - The selected contest ID
 * @returns Created team match with rival team details
 */
const startTeamMatchWithAutoRival = async (teamId: string, contestId: string, userId?: string) => {
    // Verify user has permission to start match (LEADER or MODERATOR only)
    if (userId) {
        const userTeamMember = await prisma.teamMember.findFirst({
            where: { teamId, memberId: userId }
        })

        if (!userTeamMember || (userTeamMember.level !== MemberLevel.LEADER && userTeamMember.level !== MemberLevel.MODERATOR)) {
            throw new ApiError(httpstatus.FORBIDDEN, "Only team leader or moderator can start matches")
        }
    }

    // Verify contest exists and is active
    const contest = await prisma.contest.findUnique({
        where: { id: contestId, status: ContestStatus.ACTIVE },
        include: { _count: { select: { participants: true } } }
    })

    if (!contest) {
        throw new ApiError(httpstatus.NOT_FOUND, "Contest not found or not active")
    }

    // if (contest.mode !== ContestMode.TEAM) {
    //     throw new ApiError(httpstatus.BAD_REQUEST, "This contest is not a team competition")
    // }

    // Verify team exists
    const ownTeam = await isTeamExist(teamId)
    if (!ownTeam) {
        throw new ApiError(httpstatus.NOT_FOUND, "Your team not found")
    }

    // // Verify team has already registered for the contest
    // const teamMembers = await prisma.teamMember.findMany({
    //     where: { teamId }
    // })

    // const memberIds = teamMembers.map(m => m.id)

    // const teamParticipation = await prisma.contestParticipant.findFirst({
    //     where: {
    //         contestId,
    //         memberId: { in: memberIds }
    //     }
    // })

    // if (!teamParticipation) {
    //     throw new ApiError(httpstatus.BAD_REQUEST, "Your team must register for this contest before starting a match")
    // }

    // Check if team already has an active match in this contest
    const existingActiveMatch = await prisma.teamMatch.findFirst({
        where: {
            contestId,
            status: 'ACTIVE',
            OR: [
                { team1Id: teamId },
                { team2Id: teamId }
            ]
        }
    })

    if (existingActiveMatch) {
        throw new ApiError(httpstatus.CONFLICT, "Your team already has an active match in this contest")
    }

    // Automatically find a rival team with similar skill level
    const rivalTeam = await findRivalTeam(teamId, contestId)

    if (!rivalTeam) {
        throw new ApiError(httpstatus.NOT_FOUND, "No rival team found with similar skill level. Please try again later.")
    }

    // Create the match
    const teamMatch = await prisma.teamMatch.create({
        data: {
            contestId,
            team1Id: teamId,
            team2Id: rivalTeam.id,
            status: 'ACTIVE',
            endedAt: contest.endDate
        },
        include: {
            team1: {
                select: {
                    id: true,
                    name: true,
                    skill_level: true,
                    badge: true,
                    creator: { select: { id: true, firstName: true, lastName: true } }
                }
            },
            team2: {
                select: {
                    id: true,
                    name: true,
                    skill_level: true,
                    badge: true,
                    creator: { select: { id: true, firstName: true, lastName: true } }
                }
            },
            contest: { select: { id: true, title: true, banner: true } }
        }
    })

    // Update team active_match_id
    await Promise.all([
        prisma.team.update({
            where: { id: teamId },
            data: { active_match_id: teamMatch.id }
        }),
        prisma.team.update({
            where: { id: rivalTeam.id },
            data: { active_match_id: teamMatch.id }
        })
    ])

    // Send notifications to both team leaders
    const team1Leader = await prisma.teamMember.findFirst({
        where: { teamId: teamMatch.team1Id, level: MemberLevel.LEADER },
        include: { member: true }
    })

    const team2Leader = await prisma.teamMember.findFirst({
        where: { teamId: teamMatch.team2Id, level: MemberLevel.LEADER },
        include: { member: true }
    })

    if (team1Leader) {
        await notificationService.postNotification(
            'Match Started! 🎮',
            `Your team "${teamMatch.team1.name}" is now competing against "${teamMatch.team2.name}" in ${teamMatch.contest.title}`,
            team1Leader.memberId,
            NotificationType.DEFAULT
        )
    }

    if (team2Leader) {
        await notificationService.postNotification(
            'Match Started! 🎮',
            `Your team "${teamMatch.team2.name}" is now competing against "${teamMatch.team1.name}" in ${teamMatch.contest.title}`,
            team2Leader.memberId,
            NotificationType.DEFAULT
        )
    }

    return teamMatch
}

/**
 * Original startTeamMatch - kept for backward compatibility
 * Only LEADER and MODERATOR can manually specify both teams for a match
 */
const startTeamMatch = async (contestId:string, ownTeamId:string, otherTeamId:string, userId?: string) => {
    // Verify user has permission to start match (LEADER or MODERATOR only)
    if (userId) {
        const userTeamMember = await prisma.teamMember.findFirst({
            where: { teamId: ownTeamId, memberId: userId }
        })

        if (!userTeamMember || (userTeamMember.level !== MemberLevel.LEADER && userTeamMember.level !== MemberLevel.MODERATOR)) {
            throw new ApiError(httpstatus.FORBIDDEN, "Only team leader or moderator can start matches")
        }
    }

    const contest = await prisma.contest.findUnique({where:{id:contestId, status:ContestStatus.ACTIVE}})

    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }

    const ownTeam = await prisma.team.findUnique({where:{id:ownTeamId}})
    const otherTeam = await prisma.team.findUnique({where:{id:otherTeamId}})

   const teamMatch =  await prisma.teamMatch.create({data:{contestId, team1Id:ownTeamId, team2Id:otherTeamId, endedAt:contest.endDate}})

   return teamMatch
}



const inviteUser = async (senderId:string, teamId:string, receiverId:string) => {

    const team = await prisma.team.findUnique({where:{id:teamId}})
    if(!team){
        throw new ApiError(httpstatus.NOT_FOUND, "team not found")
    }

    const teamMember = await isTeamMemberExist(senderId, team.id)
    console.log(teamMember)

    if(!teamMember){
        throw new ApiError(httpstatus.BAD_REQUEST, "you are not allowed to invite any user")
    }

    const teamInvitation = await prisma.teamInvitation.create({data:{teamId,senderId,receiverId,expiredAt: new Date(Date.now() + 30*60*1000)}})
    await notificationService.postNotificationWithPayload("Team Invitation",`You recieve an invitatino to join ${team.name} team`,receiverId,{code:teamInvitation.id}, NotificationType.INVITATION)
    await notificationService.postNotification("Invitation Sent", "Your invitation sent successfully", senderId, NotificationType.DEFAULT)
    return teamInvitation
}

const joinByInvitation = async (receiverId:string,invitationId:string) => {
    const invitation = await prisma.teamInvitation.findFirst({where:{id:invitationId, receiverId}})

    if(!invitation || (invitation.expiredAt < new Date())){
        throw new ApiError(httpstatus.BAD_REQUEST, "invalid invitation or invitation expired")
    }
    try{
        const joinedTeam = await joinATeam(invitation.receiverId, invitation.teamId)
        await notificationService.postNotification("Invitation Accepted", "Your invitation accepted", invitation.senderId,NotificationType.DEFAULT)
        return joinedTeam
    }catch(err:any){
        console.log(err)
        throw new ApiError(httpstatus.BAD_REQUEST, err.message)
    }

}


const leaveATeam = async (userId:string, teamId:string, memberId?:string) => {
    const member = await prisma.teamMember.findFirst({where:{memberId:userId,teamId}})
    if(member?.level === MemberLevel.LEADER){
        // const leaderCount = await prisma.teamMember.count({where:{teamId,level:MemberLevel.LEADER,NOT:{id:member.id}}})
        if (!memberId){
            throw new ApiError(httpstatus.BAD_REQUEST,"member id required for team leader")
        }

        await selectAndAssignNewLeader(memberId)

    }

    if(!member){
        throw new ApiError(httpstatus.NOT_FOUND, "member not found")
    }

  prisma.$transaction([
    prisma.teamMember.delete({where:{id:member.id}}),
    prisma.team.update({where:{id:teamId}, data:{member_count:{decrement:1}}})
    ])
}

const selectAndAssignNewLeader = async (memberId:string) => {
    const member = await prisma.teamMember.findFirst({where:{memberId:memberId}, orderBy:{createdAt:"asc"}})
    if(!member){
       throw new ApiError(httpstatus.BAD_REQUEST, "member not found")
    }
     await prisma.teamMember.update({where:{id:member.id}, data:{level:MemberLevel.LEADER}})

}

const removeFromTeam = async (userId:string,memberId:string, teamId:string) => {

    const teamMember = await isTeamMemberExist(userId, teamId)

    if(!teamMember || teamMember.level !== MemberLevel.LEADER){
        throw new ApiError(httpstatus.FORBIDDEN, 'Only team leader can remove members. Moderators can only start matches.')
    }

    return await prisma.teamMember.delete({where:{id:memberId}})
}

/**
 * Assign a role to a team member
 * Only LEADER can assign MODERATOR or LEADER roles
 * @param userId - The user assigning the role (must be LEADER)
 * @param memberId - The team member ID to assign role to
 * @param teamId - The team ID
 * @param newRole - The role to assign (MODERATOR or LEADER)
 */
const assignMemberRole = async (userId: string, memberId: string, teamId: string, newRole: MemberLevel) => {
    // Verify requester is team leader
    const requesterMember = await prisma.teamMember.findFirst({
        where: { memberId: userId, teamId }
    })

    if (!requesterMember || requesterMember.level !== MemberLevel.LEADER) {
        throw new ApiError(httpstatus.FORBIDDEN, "Only team leader can assign roles")
    }

    // Verify target member exists
    const targetMember = await prisma.teamMember.findUnique({
        where: { id: memberId }
    })

    if (!targetMember) {
        throw new ApiError(httpstatus.NOT_FOUND, "Team member not found")
    }

    if (targetMember.teamId !== teamId) {
        throw new ApiError(httpstatus.BAD_REQUEST, "Member does not belong to this team")
    }

    // Validate role assignment (can only assign MODERATOR or LEADER)
    if (newRole !== MemberLevel.MODERATOR && newRole !== MemberLevel.LEADER) {
        throw new ApiError(httpstatus.BAD_REQUEST, "Can only assign MODERATOR or LEADER roles")
    }

    // Update member role
    const updatedMember = await prisma.teamMember.update({
        where: { id: memberId },
        data: { level: newRole },
        include: { member: { select: { id: true, firstName: true, lastName: true, fullName: true } } }
    })

    // Send notification to the member
    await notificationService.postNotification(
        'Role Assigned',
        `You have been promoted to ${newRole} in your team`,
        targetMember.memberId,
        NotificationType.DEFAULT
    )

    return updatedMember
}

/**
 * Revoke a member's role and downgrade them to regular MEMBER
 * Only LEADER can revoke roles
 * @param userId - The user revoking the role (must be LEADER)
 * @param memberId - The team member ID to revoke role from
 * @param teamId - The team ID
 */
const revokeMemberRole = async (userId: string, memberId: string, teamId: string) => {
    // Verify requester is team leader
    const requesterMember = await prisma.teamMember.findFirst({
        where: { memberId: userId, teamId }
    })

    if (!requesterMember || requesterMember.level !== MemberLevel.LEADER) {
        throw new ApiError(httpstatus.FORBIDDEN, "Only team leader can revoke roles")
    }

    // Verify target member exists
    const targetMember = await prisma.teamMember.findUnique({
        where: { id: memberId }
    })

    if (!targetMember) {
        throw new ApiError(httpstatus.NOT_FOUND, "Team member not found")
    }

    if (targetMember.teamId !== teamId) {
        throw new ApiError(httpstatus.BAD_REQUEST, "Member does not belong to this team")
    }

    // Cannot revoke role from another leader
    if (targetMember.level === MemberLevel.LEADER && targetMember.memberId !== userId) {
        throw new ApiError(httpstatus.BAD_REQUEST, "Cannot revoke role from another leader")
    }

    // Cannot revoke your own leader role (team must have at least one leader)
    if (targetMember.memberId === userId && targetMember.level === MemberLevel.LEADER) {
        const otherLeaders = await prisma.teamMember.count({
            where: { teamId, level: MemberLevel.LEADER, id: { not: memberId } }
        })
        if (otherLeaders === 0) {
            throw new ApiError(httpstatus.BAD_REQUEST, "Team must have at least one leader. Assign another leader before revoking your role.")
        }
    }

    // Update member role back to MEMBER
    const updatedMember = await prisma.teamMember.update({
        where: { id: memberId },
        data: { level: MemberLevel.MEMBER },
        include: { member: { select: { id: true, firstName: true, lastName: true, fullName: true } } }
    })

    // Send notification to the member
    await notificationService.postNotification(
        'Role Revoked',
        `Your ${targetMember.level} role has been revoked in your team`,
        targetMember.memberId,
        NotificationType.DEFAULT
    )

    return updatedMember
}

const getMyTeamMatches = async (userId:string ) => {
    const teamMember = await prisma.teamMember.findFirst({where:{memberId:userId}})

    if(!teamMember){
        throw new ApiError(httpstatus.NOT_FOUND, "team not found")
    }
    const teamMatch = await prisma.teamMatch.findMany({where:{OR:[{team1Id:teamMember.teamId}, {team2Id:teamMember.teamId}]}, include:{contest:{select:{title:true, banner:true, maxUploads:true}}}})

    return teamMatch
}


const getMembers = async (teamId:string, contestId?:string) => {

    const members = await prisma.teamMember.findMany({where:{teamId},include:{member:{select:{id:true, avatar:true, fullName:true, firstName:true,lastName:true,location:true}}}})
    let mappedMember
    if(!contestId){
        mappedMember = members.map(async member => {
        const memberTotalVotes = await voteService.getUserTotalVotes(member.memberId)

        return {...member, totalVote:memberTotalVotes}
    } )

        return await Promise.all(mappedMember)
    }else{
        mappedMember = members.map(async member => {
            const memberTotalVotes = await voteService.getUserContestSpecificVote(contestId,member.memberId)
             return {...member, totalVote:memberTotalVotes}
        })
    }

    return await Promise.all(mappedMember)

}

const getMatchDetails = async (userId:string,matchId:string) => {
    const userTeam = await prisma.teamMember.findFirst({where:{memberId:userId}})

    if(!userTeam){
        throw new ApiError(httpstatus.NOT_FOUND, "team not found")
    }

    const teamMatch = await prisma.teamMatch.findUnique({where:{id:matchId}})
    if(!teamMatch){
        throw new ApiError(httpstatus.NOT_FOUND, "match not found")
    }

    const team1Vote = await voteService.getTeamTotalVotes(teamMatch.contestId, teamMatch.team1Id)
    const team2Vote = await voteService.getTeamTotalVotes(teamMatch.contestId, teamMatch.team2Id)

    const team1Members = await getMembers(teamMatch.team1Id, teamMatch.contestId)
    const team2Members = await getMembers(teamMatch.team2Id, teamMatch.contestId)

    if(teamMatch.team1Id === userTeam.id){
        return {oposition:{totalVote:team2Vote,members:team2Members}, own:{totalVote:team1Vote,members:team1Members}}
    }

    return {own:{totalVote:team2Vote,members:team2Members}, oposition:{totalVote:team1Vote,members:team1Members}}

}

// NEW: Join Request System Functions

/**
 * Send a join request to a team
 * @param userId - The user sending the request
 * @param teamId - The team to request join to
 */
const sendJoinRequest = async (userId: string, teamId: string) => {
    // Verify team exists
    const team = await isTeamExist(teamId)
    if (!team) {
        throw new ApiError(httpstatus.NOT_FOUND, "Team not found")
    }

    // Check if user is already a member
    const existingMember = await prisma.teamMember.findFirst({
        where: { memberId: userId, teamId }
    })
    if (existingMember) {
        throw new ApiError(httpstatus.CONFLICT, "You are already a member of this team")
    }

    // Check if request already exists
    const existingRequest = await prisma.teamJoinRequest.findFirst({
        where: { requesterId: userId, teamId, status: 'PENDING' }
    })
    if (existingRequest) {
        throw new ApiError(httpstatus.CONFLICT, "You already have a pending request for this team")
    }

    // Create join request
    const joinRequest = await prisma.teamJoinRequest.create({
        data: {
            teamId,
            requesterId: userId
        },
        include: {
            requester: { select: { id: true, firstName: true, lastName: true, avatar: true } },
            team: { select: { id: true, name: true } }
        }
    })

    // Send notification to team leader
    const teamLeader = await prisma.teamMember.findFirst({
        where: { teamId, level: MemberLevel.LEADER },
        include: { member: true }
    })

    if (teamLeader) {
        await notificationService.postNotification(
            `New join request`,
            `${joinRequest.requester.firstName} ${joinRequest.requester.lastName} requested to join ${joinRequest.team.name}`,
            teamLeader.memberId,
            NotificationType.TEAM_JOIN_REQUEST
        )
    }

    return joinRequest
}

/**
 * Get pending join requests for a team (team leader only)
 * @param teamId - The team ID
 * @param userId - The user requesting (must be team leader)
 */
const getJoinRequests = async (teamId: string, userId: string, page?: number, limit?: number) => {
    // Verify user is team leader
    const leader = await prisma.teamMember.findFirst({
        where: { teamId, memberId: userId, level: MemberLevel.LEADER }
    })

    if (!leader) {
        throw new ApiError(httpstatus.FORBIDDEN, "Only team leader can view join requests")
    }

    const paginationOptions = paginationHelper.calculatePagination({
        page: page || 1,
        limit: limit || 10,
        sortBy: 'createdAt',
        sortOrder: 'desc'
    });

    const requests = await prisma.teamJoinRequest.findMany({
        where: { teamId, status: 'PENDING' },
        skip: paginationOptions.skip,
        take: paginationOptions.limit,
        include: {
            requester: { select: { id: true, firstName: true, lastName: true, avatar: true, level: true } }
        },
        orderBy: { [paginationOptions.sortBy]: paginationOptions.sortOrder as any }
    })

    const total = await prisma.teamJoinRequest.count({where: { teamId, status: 'PENDING' }});
    const meta = paginationHelper.getPaginationMetaData(paginationOptions.page, paginationOptions.limit, total);

    return { data: requests, meta }
}

/**
 * Approve a join request and add user to team
 * @param joinRequestId - The join request ID
 * @param userId - The user approving (must be team leader)
 */
const approveJoinRequest = async (joinRequestId: string, userId: string) => {
    // Get join request details
    const joinRequest = await prisma.teamJoinRequest.findUnique({
        where: { id: joinRequestId },
        include: { team: true, requester: true }
    })

    if (!joinRequest) {
        throw new ApiError(httpstatus.NOT_FOUND, "Join request not found")
    }

    if (joinRequest.status !== 'PENDING') {
        throw new ApiError(httpstatus.CONFLICT, "This request has already been processed")
    }

    // Verify user is team leader
    const leader = await prisma.teamMember.findFirst({
        where: { teamId: joinRequest.teamId, memberId: userId, level: MemberLevel.LEADER }
    })

    if (!leader) {
        throw new ApiError(httpstatus.FORBIDDEN, "Only team leader can approve join requests. Moderators can only start matches.")
    }

    // Check team member slots
    const memberCount = await prisma.teamMember.count({
        where: { teamId: joinRequest.teamId, status: 'ACTIVE' }
    })

    if (memberCount >= joinRequest.team.member_slots) {
        throw new ApiError(httpstatus.CONFLICT, "Team member slots are full")
    }

    // Add user to team
    await prisma.teamMember.create({
        data: {
            teamId: joinRequest.teamId,
            memberId: joinRequest.requesterId,
            level: MemberLevel.MEMBER
        }
    })

    // Update join request status
    const updatedRequest = await prisma.teamJoinRequest.update({
        where: { id: joinRequestId },
        data: { status: 'APPROVED' }
    })

    // Update team member count
    await prisma.team.update({
        where: { id: joinRequest.teamId },
        data: { member_count: { increment: 1 } }
    })

    // Send notification to requester
    await notificationService.postNotification(
        'Request approved',
        `Your request to join ${joinRequest.team.name} has been approved`,
        joinRequest.requesterId,
        NotificationType.TEAM_JOIN_APPROVED
    )

    return updatedRequest
}

/**
 * Reject a join request
 * @param joinRequestId - The join request ID
 * @param userId - The user rejecting (must be team leader)
 */
const rejectJoinRequest = async (joinRequestId: string, userId: string) => {
    // Get join request details
    const joinRequest = await prisma.teamJoinRequest.findUnique({
        where: { id: joinRequestId },
        include: { team: true, requester: true }
    })

    if (!joinRequest) {
        throw new ApiError(httpstatus.NOT_FOUND, "Join request not found")
    }

    if (joinRequest.status !== 'PENDING') {
        throw new ApiError(httpstatus.CONFLICT, "This request has already been processed")
    }

    // Verify user is team leader
    const leader = await prisma.teamMember.findFirst({
        where: { teamId: joinRequest.teamId, memberId: userId, level: MemberLevel.LEADER }
    })

    if (!leader) {
        throw new ApiError(httpstatus.FORBIDDEN, "Only team leader can reject join requests")
    }

    // Update join request status
    const updatedRequest = await prisma.teamJoinRequest.update({
        where: { id: joinRequestId },
        data: { status: 'REJECTED' }
    })

    // Send notification to requester
    await notificationService.postNotification(
        'Request rejected',
        `Your request to join ${joinRequest.team.name} has been rejected`,
        joinRequest.requesterId,
        NotificationType.TEAM_JOIN_REJECTED
    )

    return updatedRequest
}

/**
 * Calculate team skill level based on member skill levels
 * @param teamId - The team ID
 */
const calculateTeamSkillLevel = async (teamId: string) => {
    const members = await prisma.teamMember.findMany({
        where: { teamId, status: 'ACTIVE' },
        include: { member: { select: { level: true } } }
    })

    if (members.length === 0) {
        return 'INTERMEDIATE'
    }

    // Map user levels to skill levels for averaging
    const skillWeights: { [key: string]: number } = {
        'LEVEL_1': 1,
        'LEVEL_2': 2,
        'LEVEL_3': 3,
        'LEVEL_4': 4,
        'LEVEL_5': 5
    }

    let totalWeight = 0
    for (const member of members) {
        const levelKey = (member.member.level?.toString()) || 'LEVEL_1'
        totalWeight += skillWeights[levelKey] || 2
    }

    const avgWeight = totalWeight / members.length

    if (avgWeight <= 1.5) return 'BEGINNER'
    if (avgWeight <= 2.5) return 'INTERMEDIATE'
    if (avgWeight <= 3.5) return 'ADVANCED'
    return 'EXPERT'
}

/**
 * Find a rival team for auto-matching
 * @param ownTeamId - The team looking for a rival
 * @param contestId - The contest ID
 */
const findRivalTeam = async (ownTeamId: string, contestId: string) => {
    const ownTeam = await isTeamExist(ownTeamId)
    if (!ownTeam) {
        throw new ApiError(httpstatus.NOT_FOUND, "Your team not found")
    }

    // Find teams with similar skill level participating in the same contest
    const rivalTeam = await prisma.team.findFirst({
        where: {
            id: { not: ownTeamId },
            skill_level: ownTeam.skill_level,
            // participations: {
            //     some: { contestId }
            // },
            // active_match_id: null, // No active match
            MatchesAsTeam1: { none: { contestId } }, // No existing match in this contest
            MatchesAsTeam2: { none: { contestId } }
        },
        include: { members: { include: { member: true } } }
    })

    return rivalTeam
}

/**
 * Check if team has an active match
 * @param teamId - The team ID
 */
const getActiveMatch = async (teamId: string) => {

    const team = await isTeamExist(teamId)
    if(!team){
        throw new ApiError(httpstatus.NOT_FOUND, "team not found")
    }
    const match = await prisma.teamMatch.findFirst({
        where: {
            status: 'ACTIVE',
            OR: [
                { team1Id: teamId },
                { team2Id: teamId }
            ]
        },
        include: {
            team1: true,
            team2: true
        }
    })

    return match || null
}

/**
 * Get team leaderboard ranking
 */
const getTeamLeaderboard = async (contestId?: string, page?: number, limit?: number) => {
    const paginationOptions = paginationHelper.calculatePagination({
        page: page || 1,
        limit: limit || 10,
        sortBy: 'score',
        sortOrder: 'desc'
    });

    const teams = await prisma.team.findMany({
        where: contestId ? {
            participations: {
                some: { contestId }
            }
        } : {},
        skip: paginationOptions.skip,
        take: paginationOptions.limit,
        select: {
            id: true,
            name: true,
            level: true,
            skill_level: true,
            leaderboard_rank: true,
            total_matches: true,
            win: true,
            lost: true,
            draw: true,
            score: true,
            creator: { select: { id: true, firstName: true, lastName: true } }
        },
        orderBy: {
            score: 'desc'
        }
    })

    const total = await prisma.team.count({
        where: contestId ? {
            participations: {
                some: { contestId }
            }
        } : {}
    });

    const meta = paginationHelper.getPaginationMetaData(paginationOptions.page, paginationOptions.limit, total);

    // Add rank with current order
    const rankedTeams = teams.map((team, index) => ({
        ...team,
        current_rank: ((paginationOptions.page - 1) * paginationOptions.limit) + index + 1
    }));

    return { data: rankedTeams, meta }
}

/**
 * Record match result and update team statistics
 * @param matchId - The match ID
 * @param team1Score - Team 1 score
 * @param team2Score - Team 2 score
 */
const recordMatchResult = async (matchId: string, team1Score: number, team2Score: number) => {
    const match = await prisma.teamMatch.findUnique({
        where: { id: matchId },
        include: { team1: true, team2: true }
    })

    if (!match) {
        throw new ApiError(httpstatus.NOT_FOUND, "Match not found")
    }

    // Determine result
    let result: 'TEAM1_WIN' | 'TEAM2_WIN' | 'DRAW'
    let winnerTeamId: string | null
    let team1Result: 'WIN' | 'LOSS' | 'DRAW'
    let team2Result: 'WIN' | 'LOSS' | 'DRAW'

    if (team1Score > team2Score) {
        result = 'TEAM1_WIN'
        winnerTeamId = match.team1Id
        team1Result = 'WIN'
        team2Result = 'LOSS'
    } else if (team2Score > team1Score) {
        result = 'TEAM2_WIN'
        winnerTeamId = match.team2Id
        team1Result = 'LOSS'
        team2Result = 'WIN'
    } else {
        result = 'DRAW'
        winnerTeamId = null
        team1Result = 'DRAW'
        team2Result = 'DRAW'
    }

    // Update match record
    const updatedMatch = await prisma.teamMatch.update({
        where: { id: matchId },
        data: {
            team1_score: team1Score,
            team2_score: team2Score,
            winner_id: winnerTeamId,
            result,
            endedAt: new Date(),
            status: 'CLOSED'
        }
    })

    // Update team statistics
    if (team1Result === 'WIN') {
        await prisma.team.update({
            where: { id: match.team1Id },
            data: { win: { increment: 1 }, score: { increment: team1Score }, total_matches: { increment: 1 } }
        })
        await prisma.team.update({
            where: { id: match.team2Id },
            data: { lost: { increment: 1 }, total_matches: { increment: 1 } }
        })
    } else if (team2Result === 'WIN') {
        await prisma.team.update({
            where: { id: match.team2Id },
            data: { win: { increment: 1 }, score: { increment: team2Score }, total_matches: { increment: 1 } }
        })
        await prisma.team.update({
            where: { id: match.team1Id },
            data: { lost: { increment: 1 }, total_matches: { increment: 1 } }
        })
    } else {
        await prisma.team.update({
            where: { id: match.team1Id },
            data: { draw: { increment: 1 }, total_matches: { increment: 1 } }
        })
        await prisma.team.update({
            where: { id: match.team2Id },
            data: { draw: { increment: 1 }, total_matches: { increment: 1 } }
        })
    }

    // Record in team history
    await prisma.teamMatchHistory.create({
        data: {
            teamId: match.team1Id,
            matchId,
            opponent_team_id: match.team2Id,
            team_score: team1Score,
            opponent_score: team2Score,
            result: team1Result,
            match_date: new Date(),
            contest_id: match.contestId
        }
    })

    await prisma.teamMatchHistory.create({
        data: {
            teamId: match.team2Id,
            matchId,
            opponent_team_id: match.team1Id,
            team_score: team2Score,
            opponent_score: team1Score,
            result: team2Result,
            match_date: new Date(),
            contest_id: match.contestId
        }
    })

    // Clear active match flag
    await prisma.team.update({
        where: { id: match.team1Id },
        data: { active_match_id: null }
    })
    await prisma.team.update({
        where: { id: match.team2Id },
        data: { active_match_id: null }
    })

    return updatedMatch
}

/**
 * Get team match history
 * @param teamId - The team ID
 */
const getTeamHistory = async (teamId: string, page?: number, limit?: number) => {
    const team = await isTeamExist(teamId)
    if(!team){
        throw new ApiError(httpstatus.NOT_FOUND, "team not found")
    }
    const paginationOptions = paginationHelper.calculatePagination({
        page: page || 1,
        limit: limit || 10,
        sortBy: 'match_date',
        sortOrder: 'desc'
    });

    const history = await prisma.teamMatchHistory.findMany({
        where: { teamId },
        skip: paginationOptions.skip,
        take: paginationOptions.limit,
        include: {
            team: { select: { id: true, name: true } }
        },
        orderBy: { [paginationOptions.sortBy]: paginationOptions.sortOrder as any }
    })

    const total = await prisma.teamMatchHistory.count({where: { teamId }});
    const meta = paginationHelper.getPaginationMetaData(paginationOptions.page, paginationOptions.limit, total);

    return { data: history, meta }
}

const getUserTeam = async (userId:string) => {
    if(!(await hasTeam(userId))){
        throw new ApiError(httpstatus.BAD_REQUEST, "User is not a member of any team")
    }
    const teamMember = await prisma.teamMember.findFirst({where:{memberId:userId}, include:{team:true}})

    return teamMember?.team || null
}


export const teamService = {
    createTeam, getTeams, getTeamDetails, updateTeam, deleteTeam, joinATeam, isTeamExist, isTeamMemberExist, getAllTeamMember, getMyTeamDetails,
    // Match management
    startTeamMatch,
    startTeamMatchWithAutoRival,
    getAvailableTeamContests,
    // User invitations
    inviteUser,
    joinByInvitation,
    // Match details
    getMatchDetails,
    getMyTeamMatches,
    // Team membership
    leaveATeam,
    removeFromTeam,
    getSuggestedTeams,
    // Role management
    assignMemberRole,
    revokeMemberRole,
    // Join Request System
    sendJoinRequest,
    getJoinRequests,
    approveJoinRequest,
    rejectJoinRequest,
    // Team Skill & Matching
    calculateTeamSkillLevel,
    findRivalTeam,
    getActiveMatch,
    // Leaderboard & Results
    getTeamLeaderboard,
    recordMatchResult,
    getTeamHistory,
    getUserTeam
}
