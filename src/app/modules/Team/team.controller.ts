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
    const teams = await teamService.getTeams();

    sendResponse(res, {
        success: true,
        statusCode: httpstatus.OK,
        message: 'Teams fetched successfully',
        data: teams,
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
    const body = JSON.parse(req.body.data);
    const file = req.file


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

    const result = await teamService.deleteTeam(teamId);

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

    const result = await teamService.getAllTeamMember(teamId)

    sendResponse(res, {
        statusCode:httpstatus.OK,
        success:true,
        message:"Team member getched successfully",
        data:result
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
    const result =  await teamService.joinByInvitation(code)

    sendResponse(res, {
        success:true,
        statusCode:httpstatus.OK,
        message:"invitation accepted successfully",
        data:result
    })
})

const leaveTeam = catchAsync(async (req:Request, res:Response) => {
    const {teamId} = req.body
    const userId = req.user.id

    const result = await teamService.leaveATeam(userId,teamId)

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

const getSuggestedTeams = catchAsync(async (req:Request, res:Response) => {
    const userId = req.user.id
    const suggestedteams = await teamService.getSuggestedTeams(userId)

    sendResponse(res, {
        success:true,
        statusCode:httpstatus.OK,
        message:"suggested teams fetched successfully",
        data:suggestedteams
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

    const requests = await teamService.getJoinRequests(teamId, userId)

    sendResponse(res, {
        success: true,
        statusCode: httpstatus.OK,
        message: 'Join requests fetched successfully',
        data: requests
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
    const { contestId } = req.query

    const leaderboard = await teamService.getTeamLeaderboard(contestId as string | undefined)

    sendResponse(res, {
        success: true,
        statusCode: httpstatus.OK,
        message: 'Team leaderboard fetched successfully',
        data: leaderboard
    })
})

const getTeamHistory = catchAsync(async (req: Request, res: Response) => {
    const { teamId } = req.params

    const history = await teamService.getTeamHistory(teamId)

    sendResponse(res, {
        success: true,
        statusCode: httpstatus.OK,
        message: 'Team match history fetched successfully',
        data: history
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

export const teamController = {
    createTeam,
    getTeams,
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
    // NEW: Join Request System
    sendJoinRequest,
    getJoinRequests,
    approveJoinRequest,
    rejectJoinRequest,
    // NEW: Leaderboard & Matching
    getTeamLeaderboard,
    getTeamHistory,
    recordMatchResult,
    getActiveMatch
};
