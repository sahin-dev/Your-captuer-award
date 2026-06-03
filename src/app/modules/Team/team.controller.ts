import catchAsync from '../../../shared/catchAsync';
import { Request, Response } from 'express';
import sendResponse from '../../../shared/ApiResponse';
import httpstatus from 'http-status';
import {teamService} from './team.service'
import ApiError from '../../../errors/ApiError';


const createTeam = catchAsync(async (req: Request, res: Response) => {
    const creatorId = req.user.id;
   
    const body = req.body;
   
     const file = req.file;

    if (!file) {
        throw new ApiError(httpstatus.BAD_REQUEST, 'Badge file is required');
    }

    const team = await teamService.createTeam(creatorId, body, file);

    sendResponse(res, {
        success: true,
        statusCode: httpstatus.CREATED,
        message: 'Team created successfully',
        data: team,
    });
});

const getTeams = catchAsync(async (req: Request, res: Response) => {
    const { s, page, limit } = req.query;
    const result = await teamService.getTeams(
        s?.toString(),
        page ? Number(page) : undefined,
        limit ? Number(limit) : undefined
    );

    sendResponse(res, {
        success: true,
        statusCode: httpstatus.OK,
        message: 'Teams fetched successfully',
        data: result.data,
        meta: result.meta
    });
});



const getTeamDetails = catchAsync(async (req: Request, res: Response) => {
    const { teamId } = req.params;

    const team = await teamService.getTeamDetails(teamId);

    sendResponse(res, {
        success: true,
        statusCode: httpstatus.OK,
        message: 'Team details fetched successfully',
        data: team,
    });
});

const getMyTeamDetails = catchAsync( async (req:Request, res:Response)=>{

    const userId = req.user.id
    const team = await teamService.getMyTeamDetails(userId)

    sendResponse(res, {
        success:true,
        statusCode:httpstatus.OK,
        message:"user team found successfully",
        data:team
    })

})

const updateTeam = catchAsync(async (req: Request, res: Response) => {
    const { teamId } = req.params;

    const body = req.body
    const file = req.file
    console.log(body)   

    const updatedTeam = await teamService.updateTeam(teamId, body, file);

    sendResponse(res, {
        success: true,
        statusCode: httpstatus.OK,
        message: 'Team updated successfully',
        data: updatedTeam,
    });
});

const deleteTeam = catchAsync(async (req: Request, res: Response) => {
    const { teamId } = req.params;
    const userId = req.user.id

    const result = await teamService.deleteTeam(userId, teamId);

    sendResponse(res, {
        success: true,
        statusCode: httpstatus.OK,
        message: result.message,
        data: {},
    });
});

const joinTeam = catchAsync( async (req:Request, res:Response)=>{
    const {teamId} = req.params
    const userId = req.user.id

    const result = await teamService.joinATeam(userId, teamId)

    sendResponse(res, {
        statusCode:httpstatus.CREATED,
        success:true,
        message:"user joined the team",
        data:result
    })
})

const getAllTeamMembers = catchAsync(async (req:Request, res:Response)=>{
    const {teamId} = req.params
    const { page, limit } = req.query
    console.log("members", teamId)
    const result = await teamService.getAllTeamMember(
        teamId,
        page ? Number(page) : undefined,
        limit ? Number(limit) : undefined
    )

    sendResponse(res, {
        statusCode:httpstatus.OK,
        success:true,
        message:"Team member fetched successfully",
        data:result.data,
        meta:result.meta
    })
})

const inviteUser = catchAsync(async (req:Request, res:Response) => {
    const {teamId, receiverId} = req.body
    const userId = req.user.id
    const invitation = await teamService.inviteUser(userId,teamId,receiverId)

    sendResponse(res, {
        success:true,
        statusCode:httpstatus.CREATED,
        message:"invitation sent successfully",
        data:invitation
    })
})

const joinByInvitation = catchAsync(async (req:Request, res:Response) => {
    const {code} = req.body
    const userId = req.user.id
    const result =  await teamService.joinByInvitation(userId,code)

    sendResponse(res, {
        success:true,
        statusCode:httpstatus.OK,
        message:"invitation accepted successfully",
        data:result
    })
})

const leaveTeam = catchAsync(async (req:Request, res:Response) => {
    const {teamId, memberId} = req.body
    const userId = req.user.id

    const result = await teamService.leaveATeam(userId,teamId, memberId)

    sendResponse(res, {
        success:true,
        statusCode:httpstatus.OK,
        message:"leave team successfully",
        data:result
    })

})

const removeMemberFromTeam =  catchAsync(async (req:Request, res:Response) => {
    const {memberId, teamId} = req.body
    const userId = req.user.id
    
    const result = await teamService.removeFromTeam(userId, memberId, teamId)
    
    sendResponse(res, {
        success:true,
        statusCode:httpstatus.OK,
        message:"member removed successfully",
        data:result
    })
})

const assignMemberRole = catchAsync(async (req: Request, res: Response) => {
    const { memberId, teamId } = req.params
    const { role } = req.body
    const userId = req.user.id

    if (!role) {
        throw new ApiError(httpstatus.BAD_REQUEST, 'Role is required (MODERATOR or LEADER)')
    }

    const result = await teamService.assignMemberRole(userId, memberId, teamId, role)

    sendResponse(res, {
        success: true,
        statusCode: httpstatus.OK,
        message: `Member promoted to ${role} successfully`,
        data: result
    })
})

const revokeMemberRole = catchAsync(async (req: Request, res: Response) => {
    const { memberId, teamId } = req.params
    const userId = req.user.id

    const result = await teamService.revokeMemberRole(userId, memberId, teamId)

    sendResponse(res, {
        success: true,
        statusCode: httpstatus.OK,
        message: 'Member role revoked successfully',
        data: result
    })
})

const getSuggestedTeams = catchAsync(async (req:Request, res:Response) => {
    const userId = req.user.id
    const { page, limit } = req.query
    const result = await teamService.getSuggestedTeams(
        userId,
        page ? Number(page) : undefined,
        limit ? Number(limit) : undefined
    )

    sendResponse(res, {
        success:true,
        statusCode:httpstatus.OK,
        message:"suggested teams fetched successfully",
        data:result.data,
        meta:result.meta
    })
})

// NEW: Join Request System Controllers

const sendJoinRequest = catchAsync(async (req: Request, res: Response) => {
    const userId = req.user.id
    const { teamId } = req.params

    const joinRequest = await teamService.sendJoinRequest(userId, teamId)

    sendResponse(res, {
        success: true,
        statusCode: httpstatus.CREATED,
        message: 'Join request sent successfully',
        data: joinRequest
    })
})

const getJoinRequests = catchAsync(async (req: Request, res: Response) => {
    const userId = req.user.id
    const { teamId } = req.params
    const { page, limit } = req.query

    const result = await teamService.getJoinRequests(
        teamId,
        userId,
        page ? Number(page) : undefined,
        limit ? Number(limit) : undefined
    )

    sendResponse(res, {
        success: true,
        statusCode: httpstatus.OK,
        message: 'Join requests fetched successfully',
        data: result.data,
        meta: result.meta
    })
})

const approveJoinRequest = catchAsync(async (req: Request, res: Response) => {
    const userId = req.user.id
    const { joinRequestId } = req.params

    const result = await teamService.approveJoinRequest(joinRequestId, userId)

    sendResponse(res, {
        success: true,
        statusCode: httpstatus.OK,
        message: 'Join request approved successfully',
        data: result
    })
})

const rejectJoinRequest = catchAsync(async (req: Request, res: Response) => {
    const userId = req.user.id
    const { joinRequestId } = req.params

    const result = await teamService.rejectJoinRequest(joinRequestId, userId)

    sendResponse(res, {
        success: true,
        statusCode: httpstatus.OK,
        message: 'Join request rejected successfully',
        data: result
    })
})

// NEW: Leaderboard & Matching Controllers

const getTeamLeaderboard = catchAsync(async (req: Request, res: Response) => {
    const { contestId, page, limit, period } = req.query

    if (period && !['weekly', 'monthly', 'yearly'].includes(period as string)) {
        throw new ApiError(httpstatus.BAD_REQUEST, 'Period must be weekly, monthly, or yearly')
    }

    const result = await teamService.getTeamLeaderboard(
        contestId as string | undefined,
        page ? Number(page) : undefined,
        limit ? Number(limit) : undefined,
        (period as 'weekly' | 'monthly' | 'yearly') || 'weekly'
    )

    sendResponse(res, {
        success: true,
        statusCode: httpstatus.OK,
        message: `Team ${result.period} leaderboard fetched successfully`,
        data: result.data,
        meta: result.meta
    })
})

const getTeamHistory = catchAsync(async (req: Request, res: Response) => {
    const { teamId } = req.params
    const { page, limit } = req.query

    const result = await teamService.getTeamHistory(
        teamId,
        page ? Number(page) : undefined,
        limit ? Number(limit) : undefined
    )

    sendResponse(res, {
        success: true,
        statusCode: httpstatus.OK,
        message: 'Team match history fetched successfully',
        data: result.data,
        meta: result.meta
    })
})

const recordMatchResult = catchAsync(async (req: Request, res: Response) => {
    const { matchId, team1Score, team2Score } = req.body

    const result = await teamService.recordMatchResult(matchId, team1Score, team2Score)

    sendResponse(res, {
        success: true,
        statusCode: httpstatus.OK,
        message: 'Match result recorded successfully',
        data: result
    })
})

const getActiveMatch = catchAsync(async (req: Request, res: Response) => {
    const { teamId } = req.params

    const activeMatch = await teamService.getActiveMatch(teamId)

    sendResponse(res, {
        success: true,
        statusCode: httpstatus.OK,
        message: 'Active match fetched successfully',
        data: activeMatch
    })
})

/**
 * Get list of available TEAM contests for team to join
 * Admin can see all active TEAM contests to select from
 */
const getAvailableTeamContests = catchAsync(async (req: Request, res: Response) => {
    const { teamId } = req.params
    const { page, limit } = req.query

    const result = await teamService.getAvailableTeamContests(
        teamId,
        page ? Number(page) : undefined,
        limit ? Number(limit) : undefined
    )

    sendResponse(res, {
        success: true,
        statusCode: httpstatus.OK,
        message: 'Available team contests fetched successfully',
        data: result.data,
        meta: result.meta
    })
})

/**
 * Start team match with automatic rival finding
 * Only LEADER and MODERATOR can start matches
 * Admin selects a contest, system automatically finds a rival team and starts the match
 * Requires minimum 1 photo and maximum based on contest's maxUploads
 * @body { contestId: string }
 * @files photo files required (minimum 1, maximum = contest.maxUploads)
 */
const startTeamMatchWithAutoRival = catchAsync(async (req: Request, res: Response) => {
    const { teamId } = req.params
    const { contestId } = req.body
    const userId = req.user.id
    const files = req.files as Express.Multer.File[] || []

    if (!contestId) {
        throw new ApiError(httpstatus.BAD_REQUEST, 'Contest ID is required')
    }

    if (!files || files.length === 0) {
        throw new ApiError(httpstatus.BAD_REQUEST, 'Minimum 1 photo file is required to start a team match')
    }

    const match = await teamService.startTeamMatchWithAutoRival(teamId, contestId, userId, files)

    sendResponse(res, {
        success: true,
        statusCode: httpstatus.CREATED,
        message: 'Team match started successfully with auto-matched rival',
        data: match
    })
})

const searchTeamsByName = catchAsync(async (req: Request, res: Response) => {
    const { name, page, limit } = req.query;

    if (!name || name.toString().trim() === '') {
        throw new ApiError(httpstatus.BAD_REQUEST, 'Team name is required for search');
    }

    const result = await teamService.getTeams(
        name.toString(),
        page ? Number(page) : undefined,
        limit ? Number(limit) : undefined
    );

    sendResponse(res, {
        success: true,
        statusCode: httpstatus.OK,
        message: 'Teams searched successfully',
        data: result.data,
        meta: result.meta
    });
});

export const teamController = {
    createTeam,
    getTeams,
    searchTeamsByName,
    getTeamDetails,
    updateTeam,
    deleteTeam,
    joinTeam,
    getAllTeamMembers,
    getMyTeamDetails,
    inviteUser,
    joinByInvitation,
    leaveTeam,
    removeMemberFromTeam,
    getSuggestedTeams,
    // NEW: Role Management
    assignMemberRole,
    revokeMemberRole,
    // NEW: Join Request System
    sendJoinRequest,
    getJoinRequests,
    approveJoinRequest,
    rejectJoinRequest,
    // NEW: Leaderboard & Matching
    getTeamLeaderboard,
    getTeamHistory,
    recordMatchResult,
    getActiveMatch,
    // NEW: Auto Match System
    getAvailableTeamContests,
    startTeamMatchWithAutoRival
};
