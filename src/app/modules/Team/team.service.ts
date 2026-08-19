import prisma from '../../../shared/prisma';
import ApiError from '../../../errors/ApiError';
import httpstatus from 'http-status';
import { fileUploader } from '../../../helpers/fileUploader';
import { ITeam } from './team.interface';
import { ContestStatus, HistoryResult, JoinRequestStatus, LevelName, MatchResult, MatchStatus, MemberLevel, NotificationType, TeamAccessibility } from '../../../prismaClient';
import { contestService } from '../Contest/contest.service';
import { notificationService } from '../Notification/notification.service';
import { levelService } from '../Level/level.service';
import { voteService } from '../Vote/vote.service';
import { userService } from '../User/user.service';
import { profileService } from '../Profile/profile.service';
import { paginationHelper } from '../../../helpers/paginationHelper';
import { userStoreService } from '../User/UserStore/userStore.service';


//create a team


export const createTeam = async (creatorId: string, body: ITeam, file:Express.Multer.File) => {

    const userStore = await userStoreService.getStoreData(creatorId)

    if(!userStore || userStore.coins < 500){
        throw new ApiError(httpstatus.BAD_REQUEST, "You need at least 500 coins to create a team")
    }

    const badgeUrl = await fileUploader.uploadToDigitalOcean(file)
    

    const level = await levelService.getLevelByLevelName(body.min_requirement as LevelName)


    const {team, member} = await prisma.$transaction(async (tx) => {
        await userStoreService.deductCoinsFromStore(creatorId, 500)
        const team = await tx.team.create({
            data: {
                creatorId,
                name:body.name,
                level: body.level,
                language: body.language,
                country: body.country,
                description: body.description,
                min_requirement: level?.order ?? 0,
                min_requirement_str: level?.levelName ?? 'None',
                accessibility: body.accessibility as TeamAccessibility,
                member_count:1,
                badge: badgeUrl.Location,
            },
        });

        const member = await tx.teamMember.create({data:{memberId:creatorId,teamId:team.id, level:MemberLevel.LEADER}})
        return {team, member}
    })

    
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

export const getTeams = async (search?:string, page?:number, limit?:number) => {
    const { skip, limit:take, page:currentPage } = paginationHelper.calculatePagination({page, limit})

    const where = search ? { name:{contains:search, mode:'insensitive' as const} } : {}

    const [teams, total] = await Promise.all([
        prisma.team.findMany({
            where,
            include: { creator: true, members: { include: { member: true } } },
            skip, take
        }),
        prisma.team.count({where})
    ]);

    return { data:teams, meta:paginationHelper.getPaginationMetaData(currentPage, take, total) };
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
        include: { creator: {select:{id:true, avatar:true, fullName:true, firstName:true, lastName:true}}, members: { include: { member: {select:{id:true, avatar:true, fullName:true, firstName:true, lastName:true}} } } },
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
    const team = await prisma.team.findUnique({where:{id:member.teamId}})

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


const getSuggestedTeams = async (userId:string, page?:number, limit?:number) => {
    const user = await userService.getUserDetails(userId)

    if(!user){
        throw new ApiError(httpstatus.NOT_FOUND, "user not found")
    }
    const country = user.country as string
    const { skip, limit:take, page:currentPage } = paginationHelper.calculatePagination({page, limit})

    const where = { OR:[country? {country}:{}, {min_requirement:user.currentLevel}] }

    const [teams, total] = await Promise.all([
        prisma.team.findMany({where, skip, take}),
        prisma.team.count({where})
    ])

    return { data:teams, meta:paginationHelper.getPaginationMetaData(currentPage, take, total) }
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

    const requester = await prisma.teamMember.findFirst({where:{memberId:userId, teamId}})
    if(existingTeam.creatorId !== userId && (!requester || requester.level !== MemberLevel.LEADER)){
        throw new ApiError(httpstatus.FORBIDDEN, 'You are not allowed to delete this team');
    }

    const [teamMembers, teamMatches] = await Promise.all([
        prisma.teamMember.findMany({ where: { teamId }, select: { id: true } }),
        prisma.teamMatch.findMany({
            where: { OR: [{ team1Id: teamId }, { team2Id: teamId }] },
            select: { id: true }
        })
    ]);
    const teamMemberIds = teamMembers.map(member => member.id);
    const teamMatchIds = teamMatches.map(match => match.id);

    await prisma.$transaction(async (tx) => {
        if(teamMemberIds.length){
            await tx.contestParticipant.updateMany({
                where: { memberId: { in: teamMemberIds } },
                data: { memberId: null }
            });
        }

        await tx.chat.updateMany({
            where: { teamId },
            data: { teamId: null }
        });

        await tx.teamParticipation.updateMany({
            where: { teamId },
            data: { teamId: null }
        });

        await tx.teamMatch.updateMany({
            where: { team1Id: teamId },
            data: { team1Id: null }
        });

        await tx.teamMatch.updateMany({
            where: { team2Id: teamId },
            data: { team2Id: null }
        });

        await tx.teamMatch.updateMany({
            where: { winner_id: teamId },
            data: { winner_id: null }
        });

        await tx.teamMatchHistory.updateMany({
            where: { teamId },
            data: { teamId: null }
        });

        await tx.teamMatchHistory.updateMany({
            where: { opponent_team_id: teamId },
            data: { opponent_team_id: null }
        });

        if(teamMatchIds.length){
            await tx.team.updateMany({
                where: { active_match_id: { in: teamMatchIds } },
                data: { active_match_id: null }
            });
        }

        await tx.teamInvitation.deleteMany({ where: { teamId } });
        await tx.teamJoinRequest.deleteMany({ where: { teamId } });
        await tx.room.deleteMany({ where: { teamId } });
        await tx.teamMember.deleteMany({ where: { teamId } });
        await tx.team.delete({ where: { id: teamId } });
    });

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
    if(newMemeber){
        await prisma.team.update({where:{id:team.id}, data:{member_count:{increment:1}}})
    }

    return newMemeber
}


const isTeamMemberExist = async (userId:string, teamId:string)=>{

    const member = await prisma.teamMember.findUnique({where:{memberId:userId, teamId}})

    return member || false
}

const isAlreaderJoinedTeam =async (userId:string)=>{
    const userJoined = await prisma.teamMember.findFirst({where:{memberId:userId}})

    if(userJoined){
        return true
    }

    return false
}



const joinTeamContest = async (userId:string,contestId:string, teamId:string)=>{
    const contest = await contestService.getContestById(contestId)
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "Contest not found")
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

const getAllTeamMember = async (teamId:string, page?:number, limit?:number)=>{
    const team = await prisma.team.findUnique({where:{id:teamId}})

    if(!team){

        throw new ApiError(httpstatus.NOT_FOUND, 'Team not found')
    }
    const { skip, limit:take, page:currentPage } = paginationHelper.calculatePagination({page, limit})

    const [members, total] = await Promise.all([
        prisma.teamMember.findMany({where:{teamId}, include:{member:{select:{id:true, avatar:true, firstName:true, lastName:true, fullName:true}}}, skip, take}),
        prisma.teamMember.count({where:{teamId}})
    ])

    return { data:members, meta:paginationHelper.getPaginationMetaData(currentPage, take, total) }
}

const startTeamMatch = async (contestId:string, ownTeamId:string, otherTeamId:string) => {
    const contest = await prisma.contest.findUnique({where:{id:contestId, status:ContestStatus.ACTIVE}})

    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }

    const ownTeam = await prisma.team.findUnique({where:{id:ownTeamId}})
    const otherTeam = await prisma.team.findUnique({where:{id:otherTeamId}})

   const teamMatch =  await prisma.teamMatch.create({data:{contestId, team1Id:ownTeamId, team2Id:otherTeamId, endedAt:contest.endDate}})

   return teamMatch
}

const ensureTeamParticipation = async (teamId:string, contestId:string) => {
    const existingParticipation = await prisma.teamParticipation.findFirst({where:{teamId, contestId}})
    if(existingParticipation){
        return existingParticipation
    }

    return await prisma.teamParticipation.create({data:{teamId, contestId}})
}



const inviteUser = async (senderId:string, teamId:string, receiverId:string) => {

    const team = await prisma.team.findUnique({where:{id:teamId}})
    if(!team){
        throw new ApiError(httpstatus.NOT_FOUND, "team not found")
    }

    const teamMember = await isTeamMemberExist(senderId, team.id)

    if(!teamMember || (teamMember.level !== MemberLevel.LEADER)){
        throw new ApiError(httpstatus.BAD_REQUEST, "you are not allowed to invite any user")
    }
   
    const teamInvitation = await prisma.teamInvitation.create({data:{teamId,senderId,receiverId,expiredAt: new Date(Date.now() + 30*60*1000)}})
    await notificationService.postNotificationWithPayload("Team Invitation",`You recieve an invitatino to join ${team.name} team`,receiverId,{code:teamInvitation.id}, NotificationType.INVITATION)
    await notificationService.postNotification("Invitation Sent", "Your invitation sent successfully", senderId, NotificationType.DEFAULT)
    return teamInvitation
}
const joinByInvitation = async (userId:string, invitationId:string) => {
    const invitation = await prisma.teamInvitation.findUnique({where:{id:invitationId}})

    if(!invitation || (invitation.expiredAt < new Date())){
        throw new ApiError(httpstatus.BAD_REQUEST, "invitation expired")
    }

    if(invitation.receiverId !== userId){
        throw new ApiError(httpstatus.FORBIDDEN, "This invitation does not belong to you")
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


const leaveATeam = async (userId:string, teamId:string) => {
    const member = await prisma.teamMember.findFirst({where:{memberId:userId,teamId}})
    if(!member){
        throw new ApiError(httpstatus.NOT_FOUND, "member not found")
    }

    await prisma.teamMember.delete({where:{id:member.id}})
    await prisma.team.update({where:{id:teamId}, data:{member_count:{decrement:1}}})

}

const removeFromTeam = async (userId:string,memberId:string, teamId:string) => {

    const teamMember = await isTeamMemberExist(userId, teamId)

    if(!teamMember || (teamMember.level !== MemberLevel.LEADER)){
        throw new ApiError(httpstatus.BAD_REQUEST, 'Sorry, You are not allowed to remove member')
    }

    return await prisma.teamMember.delete({where:{id:memberId}})
}

const getMyTeamMatches = async (userId:string ) => {
    const teamMember = await prisma.teamMember.findFirst({where:{memberId:userId}})
    
    if(!teamMember){
        throw new ApiError(httpstatus.NOT_FOUND, "team not found")
    }
    const teamMatch = await prisma.teamMatch.findMany({where:{OR:[{team1Id:teamMember.teamId}, {team2Id:teamMember.teamId}]}, include:{contest:{select:{title:true, banner:true}}}})

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
    if(!teamMatch.team1Id || !teamMatch.team2Id){
        throw new ApiError(httpstatus.BAD_REQUEST, "This match has a deleted team")
    }

    const team1Vote = await voteService.getTeamTotalVotes(teamMatch.contestId, teamMatch.team1Id)
    const team2Vote = await voteService.getTeamTotalVotes(teamMatch.contestId, teamMatch.team2Id)

    const team1Members = await getMembers(teamMatch.team1Id, teamMatch.contestId)
    const team2Members = await getMembers(teamMatch.team2Id, teamMatch.contestId)

    if(teamMatch.team1Id === userTeam.teamId){
        return {oposition:{totalVote:team2Vote,members:team2Members}, own:{totalVote:team1Vote,members:team1Members}}
    }

    return {own:{totalVote:team2Vote,members:team2Members}, oposition:{totalVote:team1Vote,members:team1Members}}

}


// ============ Role Management ============

const assignMemberRole = async (userId:string, memberId:string, teamId:string, role:string) => {
    if(role !== MemberLevel.MODERATOR && role !== MemberLevel.LEADER){
        throw new ApiError(httpstatus.BAD_REQUEST, "Role must be MODERATOR or LEADER")
    }

    const actingMember = await isTeamMemberExist(userId, teamId)
    if(!actingMember || actingMember.level !== MemberLevel.LEADER){
        throw new ApiError(httpstatus.FORBIDDEN, "Only the team leader can assign roles")
    }

    const targetMember = await prisma.teamMember.findUnique({where:{id:memberId}})
    if(!targetMember || targetMember.teamId !== teamId){
        throw new ApiError(httpstatus.NOT_FOUND, "Team member not found")
    }

    return await prisma.teamMember.update({where:{id:memberId}, data:{level:role as MemberLevel}})
}

const revokeMemberRole = async (userId:string, memberId:string, teamId:string) => {
    const actingMember = await isTeamMemberExist(userId, teamId)
    if(!actingMember || actingMember.level !== MemberLevel.LEADER){
        throw new ApiError(httpstatus.FORBIDDEN, "Only the team leader can revoke roles")
    }

    const targetMember = await prisma.teamMember.findUnique({where:{id:memberId}})
    if(!targetMember || targetMember.teamId !== teamId){
        throw new ApiError(httpstatus.NOT_FOUND, "Team member not found")
    }

    if(targetMember.level === MemberLevel.LEADER){
        throw new ApiError(httpstatus.BAD_REQUEST, "Cannot revoke the team leader's role")
    }

    return await prisma.teamMember.update({where:{id:memberId}, data:{level:MemberLevel.MEMBER}})
}

// ============ Join Request System ============

const sendJoinRequest = async (userId:string, teamId:string) => {
    const team = await getTeam(teamId)

    const alreadyInTeam = await isAlreaderJoinedTeam(userId)
    if(alreadyInTeam){
        throw new ApiError(httpstatus.BAD_REQUEST, "You are already in a team")
    }

    const existingRequest = await prisma.teamJoinRequest.findFirst({where:{teamId, requesterId:userId, status:JoinRequestStatus.PENDING}})
    if(existingRequest){
        throw new ApiError(httpstatus.BAD_REQUEST, "You already have a pending join request for this team")
    }

    const joinRequest = await prisma.teamJoinRequest.create({data:{teamId, requesterId:userId}})

    const leader = await prisma.teamMember.findFirst({where:{teamId, level:MemberLevel.LEADER}})
    if(leader){
        await notificationService.postNotificationWithPayload("New Join Request", `Someone requested to join ${team.name}`, leader.memberId, {teamId, joinRequestId:joinRequest.id}, NotificationType.TEAM_JOIN_REQUEST)
    }

    return joinRequest
}

const getJoinRequests = async (teamId:string, userId:string, page?:number, limit?:number) => {
    const actingMember = await isTeamMemberExist(userId, teamId)
    if(!actingMember || (actingMember.level !== MemberLevel.LEADER && actingMember.level !== MemberLevel.MODERATOR)){
        throw new ApiError(httpstatus.FORBIDDEN, "You are not allowed to view join requests for this team")
    }

    const { skip, limit:take, page:currentPage } = paginationHelper.calculatePagination({page, limit})
    const where = { teamId, status:JoinRequestStatus.PENDING }

    const [requests, total] = await Promise.all([
        prisma.teamJoinRequest.findMany({where, include:{requester:{select:{id:true, avatar:true, firstName:true, lastName:true, fullName:true}}}, skip, take, orderBy:{createdAt:'desc'}}),
        prisma.teamJoinRequest.count({where})
    ])

    return { data:requests, meta:paginationHelper.getPaginationMetaData(currentPage, take, total) }
}

const approveJoinRequest = async (joinRequestId:string, userId:string) => {
    const request = await prisma.teamJoinRequest.findUnique({where:{id:joinRequestId}})
    if(!request || request.status !== JoinRequestStatus.PENDING){
        throw new ApiError(httpstatus.NOT_FOUND, "Join request not found")
    }

    const actingMember = await isTeamMemberExist(userId, request.teamId)
    if(!actingMember || (actingMember.level !== MemberLevel.LEADER && actingMember.level !== MemberLevel.MODERATOR)){
        throw new ApiError(httpstatus.FORBIDDEN, "You are not allowed to approve join requests for this team")
    }

    const alreadyInTeam = await isAlreaderJoinedTeam(request.requesterId)
    if(alreadyInTeam){
        await prisma.teamJoinRequest.update({where:{id:joinRequestId}, data:{status:JoinRequestStatus.REJECTED}})
        throw new ApiError(httpstatus.BAD_REQUEST, "Requester already joined a team")
    }

    await joinATeam(request.requesterId, request.teamId)
    const updatedRequest = await prisma.teamJoinRequest.update({where:{id:joinRequestId}, data:{status:JoinRequestStatus.APPROVED}})

    await notificationService.postNotification("Join Request Approved", "Your request to join the team was approved", request.requesterId, NotificationType.TEAM_JOIN_APPROVED)

    return updatedRequest
}

const rejectJoinRequest = async (joinRequestId:string, userId:string) => {
    const request = await prisma.teamJoinRequest.findUnique({where:{id:joinRequestId}})
    if(!request || request.status !== JoinRequestStatus.PENDING){
        throw new ApiError(httpstatus.NOT_FOUND, "Join request not found")
    }

    const actingMember = await isTeamMemberExist(userId, request.teamId)
    if(!actingMember || (actingMember.level !== MemberLevel.LEADER && actingMember.level !== MemberLevel.MODERATOR)){
        throw new ApiError(httpstatus.FORBIDDEN, "You are not allowed to reject join requests for this team")
    }

    const updatedRequest = await prisma.teamJoinRequest.update({where:{id:joinRequestId}, data:{status:JoinRequestStatus.REJECTED}})

    await notificationService.postNotification("Join Request Rejected", "Your request to join the team was rejected", request.requesterId, NotificationType.TEAM_JOIN_REJECTED)

    return updatedRequest
}

// ============ Leaderboard & Match History ============

const PERIOD_DAYS: Record<'weekly' | 'monthly' | 'yearly', number> = {weekly:7, monthly:30, yearly:365}

const getTeamLeaderboard = async (contestId?:string, page?:number, limit?:number, period:'weekly'|'monthly'|'yearly' = 'weekly') => {
    const { skip, limit:take, page:currentPage } = paginationHelper.calculatePagination({page, limit})

    const cutoff = new Date(Date.now() - PERIOD_DAYS[period] * 24 * 60 * 60 * 1000)

    const historyWhere = { match_date:{gte:cutoff}, ...(contestId ? {contest_id:contestId} : {}) }

    const history = await prisma.teamMatchHistory.findMany({where:historyWhere})

    const statsByTeam = new Map<string, {score:number, wins:number}>()
    history.forEach(entry => {
        if(!entry.teamId){
            return
        }
        const existing = statsByTeam.get(entry.teamId) ?? {score:0, wins:0}
        existing.score += entry.team_score
        if(entry.result === HistoryResult.WIN) existing.wins += 1
        statsByTeam.set(entry.teamId, existing)
    })

    const ranked = Array.from(statsByTeam.entries())
        .sort((a,b) => (b[1].wins - a[1].wins) || (b[1].score - a[1].score))

    const total = ranked.length
    const pageSlice = ranked.slice(skip, skip + take)

    const teams = await prisma.team.findMany({where:{id:{in:pageSlice.map(([teamId]) => teamId)}}, select:{id:true, name:true, badge:true, skill_level:true}})
    const teamById = new Map(teams.map(team => [team.id, team]))

    const data = pageSlice.map(([teamId, stats], index) => ({
        rank:skip + index + 1,
        team:teamById.get(teamId) ?? {id:teamId},
        wins:stats.wins,
        score:stats.score
    }))

    return { data, meta:paginationHelper.getPaginationMetaData(currentPage, take, total), period }
}

const getTeamHistory = async (teamId:string, page?:number, limit?:number) => {
    await getTeam(teamId)

    const { skip, limit:take, page:currentPage } = paginationHelper.calculatePagination({page, limit})
    const where = { teamId }

    const [history, total] = await Promise.all([
        prisma.teamMatchHistory.findMany({
            where, skip, take,
            orderBy:{match_date:'desc'},
            include:{opponent_team:{select:{id:true, name:true, badge:true}}, contest:{select:{id:true, title:true, banner:true}}}
        }),
        prisma.teamMatchHistory.count({where})
    ])

    return { data:history, meta:paginationHelper.getPaginationMetaData(currentPage, take, total) }
}

const updateTeamStatsForMatch = async (teamId:string, opponentTeamId:string, teamScore:number, opponentScore:number, result:HistoryResult, matchId:string, contestId:string) => {
    const scoreDelta = result === HistoryResult.WIN ? 3 : result === HistoryResult.DRAW ? 1 : 0

    await prisma.team.update({
        where:{id:teamId},
        data:{
            total_matches:{increment:1},
            score:{increment:scoreDelta},
            win:{increment:result === HistoryResult.WIN ? 1 : 0},
            lost:{increment:result === HistoryResult.LOSS ? 1 : 0},
            draw:{increment:result === HistoryResult.DRAW ? 1 : 0},
        }
    })

    const existingHistory = await prisma.teamMatchHistory.findFirst({where:{teamId, matchId}})
    if(existingHistory){
        await prisma.teamMatchHistory.update({
            where:{id:existingHistory.id},
            data:{opponent_team_id:opponentTeamId, team_score:teamScore, opponent_score:opponentScore, result, match_date:new Date(), contest_id:contestId}
        })
        return
    }

    await prisma.teamMatchHistory.create({
        data:{teamId, matchId, opponent_team_id:opponentTeamId, team_score:teamScore, opponent_score:opponentScore, result, match_date:new Date(), contest_id:contestId}
    })
}

const recordMatchResult = async (matchId:string, team1Score:number, team2Score:number) => {
    const match = await prisma.teamMatch.findUnique({where:{id:matchId}})
    if(!match){
        throw new ApiError(httpstatus.NOT_FOUND, "match not found")
    }
    if(match.status !== MatchStatus.ACTIVE){
        throw new ApiError(httpstatus.BAD_REQUEST, "This match has already been closed")
    }
    if(!match.team1Id || !match.team2Id){
        throw new ApiError(httpstatus.BAD_REQUEST, "This match has a deleted team")
    }

    let result:MatchResult = MatchResult.DRAW
    let winnerId:string | undefined
    if(team1Score > team2Score){
        result = MatchResult.TEAM1_WIN
        winnerId = match.team1Id
    }else if(team2Score > team1Score){
        result = MatchResult.TEAM2_WIN
        winnerId = match.team2Id
    }

    const updatedMatch = await prisma.teamMatch.update({
        where:{id:matchId},
        data:{team1_score:team1Score, team2_score:team2Score, winner_id:winnerId, result, status:MatchStatus.CLOSED, endedAt:new Date()}
    })

    await updateTeamStatsForMatch(match.team1Id, match.team2Id, team1Score, team2Score, result === MatchResult.TEAM1_WIN ? HistoryResult.WIN : result === MatchResult.TEAM2_WIN ? HistoryResult.LOSS : HistoryResult.DRAW, matchId, match.contestId)
    await updateTeamStatsForMatch(match.team2Id, match.team1Id, team2Score, team1Score, result === MatchResult.TEAM2_WIN ? HistoryResult.WIN : result === MatchResult.TEAM1_WIN ? HistoryResult.LOSS : HistoryResult.DRAW, matchId, match.contestId)

    await prisma.team.updateMany({where:{active_match_id:matchId}, data:{active_match_id:null}})

    return updatedMatch
}

const getActiveMatch = async (teamId:string) => {
    const match = await prisma.teamMatch.findFirst({
        where:{OR:[{team1Id:teamId}, {team2Id:teamId}], status:MatchStatus.ACTIVE},
        include:{team1:{select:{id:true, name:true, badge:true}}, team2:{select:{id:true, name:true, badge:true}}, contest:{select:{id:true, title:true, banner:true, endDate:true}}}
    })

    return match
}

// ============ Auto-Rival Matchmaking ============

const getAvailableTeamContests = async (teamId:string,userId:string, page?:number, limit?:number) => {
    await getTeam(teamId)

    const { skip, limit:take, page:currentPage } = paginationHelper.calculatePagination({page, limit})

    const activeTeamMatches = await prisma.teamMatch.findMany({where:{OR:[{team1Id:teamId}, {team2Id:teamId}], status:MatchStatus.ACTIVE}, select:{contestId:true}})
    const excludedContestIds = activeTeamMatches.map(match => match.contestId)

    const where = { status:ContestStatus.ACTIVE, id:{notIn:excludedContestIds} }

    const [contests, total] = await Promise.all([
        prisma.contest.findMany({where, skip, take, select:{id:true, title:true, banner:true, startDate:true, endDate:true}}),
        prisma.contest.count({where})
    ])

    const mappedContest = await Promise.all(contests.map(async (contest:any) => {
        const isJoined = await prisma.contestParticipant.findFirst({where:{contestId:contest.id, userId}})

        contest.hasJoined = isJoined ? true : false
        return contest;
    }))

    return { data:mappedContest, meta:paginationHelper.getPaginationMetaData(currentPage, take, total) }
}

const findRivalTeam = async (teamId:string, skillLevel:LevelName) => {
    const teamsWithActiveMatch = await prisma.teamMatch.findMany({where:{status:MatchStatus.ACTIVE}, select:{team1Id:true, team2Id:true}})
    const busyTeamIds = new Set<string>([teamId])
    teamsWithActiveMatch.forEach(match => {
        if(match.team1Id){
            busyTeamIds.add(match.team1Id)
        }
        if(match.team2Id){
            busyTeamIds.add(match.team2Id)
        }
    })

    const rival = await prisma.team.findFirst({
        where:{id:{notIn:Array.from(busyTeamIds)}, skill_level:skillLevel},
        orderBy:{score:'desc'}
    }) ?? await prisma.team.findFirst({
        where:{id:{notIn:Array.from(busyTeamIds)}},
        orderBy:{score:'desc'}
    })

    return rival
}

const startTeamMatchWithAutoRival = async (teamId:string, contestId:string, userId:string, files:Express.Multer.File[]) => {
    const team = await getTeam(teamId)

    const actingMember = await isTeamMemberExist(userId, teamId)
    if(!actingMember || (actingMember.level !== MemberLevel.LEADER && actingMember.level !== MemberLevel.MODERATOR)){
        throw new ApiError(httpstatus.FORBIDDEN, "Only the team leader or moderator can start a match")
    }

    const existingActiveMatch = await prisma.teamMatch.findFirst({where:{OR:[{team1Id:teamId}, {team2Id:teamId}], status:MatchStatus.ACTIVE}})
    if(existingActiveMatch){
        throw new ApiError(httpstatus.BAD_REQUEST, "This team already has an active match")
    }

    const contest = await prisma.contest.findUnique({where:{id:contestId}})
    if(!contest || contest.status !== ContestStatus.ACTIVE){
        throw new ApiError(httpstatus.BAD_REQUEST, "Contest is not open for team matches")
    }

    const rivalTeam = await findRivalTeam(teamId, team.skill_level)
    if(!rivalTeam){
        throw new ApiError(httpstatus.NOT_FOUND, "No available rival team found right now")
    }

    let participant = await prisma.contestParticipant.findUnique({where:{contestId_userId:{contestId, userId}}})
    if(!participant){
        participant = await prisma.contestParticipant.create({data:{contestId, userId, memberId:actingMember.id}})
    }

    for(const file of files){
        const uploadedPhoto = await profileService.uploadUserPhoto(userId, file)
        await prisma.contestPhoto.create({data:{contestId, participantId:participant.id, photoId:uploadedPhoto.id}})
    }

    const match = await startTeamMatch(contestId, teamId, rivalTeam.id)

    await Promise.all([
        prisma.team.update({where:{id:teamId}, data:{active_match_id:match.id}}),
        prisma.team.update({where:{id:rivalTeam.id}, data:{active_match_id:match.id}}),
        ensureTeamParticipation(teamId, contestId),
        ensureTeamParticipation(rivalTeam.id, contestId)
    ])

    return await prisma.teamMatch.findUnique({
        where:{id:match.id},
        include:{team1:{select:{id:true, name:true, badge:true}}, team2:{select:{id:true, name:true, badge:true}}, contest:{select:{id:true, title:true}}}
    })
}


export const teamService = {
    createTeam, getTeams, getTeamDetails, updateTeam, deleteTeam, joinATeam, isTeamExist, isTeamMemberExist, getAllTeamMember, getMyTeamDetails,
    startTeamMatch,
    inviteUser,
    joinByInvitation,
    getMatchDetails,
    getMyTeamMatches,
    leaveATeam,
    removeFromTeam,
    getSuggestedTeams,
    assignMemberRole,
    revokeMemberRole,
    sendJoinRequest,
    getJoinRequests,
    approveJoinRequest,
    rejectJoinRequest,
    getTeamLeaderboard,
    getTeamHistory,
    recordMatchResult,
    getActiveMatch,
    getAvailableTeamContests,
    startTeamMatchWithAutoRival
}
