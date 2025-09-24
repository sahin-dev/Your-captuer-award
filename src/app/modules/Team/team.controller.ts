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

export const teamController = {
    createTeam,
    getTeams,
    getTeamDetails,
    updateTeam,
    deleteTeam,
    joinTeam,
    getAllTeamMembers,
    getMyTeamDetails
};
