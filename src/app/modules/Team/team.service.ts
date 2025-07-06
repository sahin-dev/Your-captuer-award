import prisma from '../../../shared/prisma';
import ApiError from '../../../errors/ApiError';
import httpstatus from 'http-status';
import { fileUploader } from '../../../helpers/fileUploader';

export const createTeam = async (creatorId: string, body: any, file:Express.Multer.File) => {

    const badgeUrl = await fileUploader.uploadToDigitalOcean(file)

    const team = await prisma.team.create({
        data: {
            creatorId,
            name:body.name,
            level: body.level,
            language: body.language,
            country: body.country,
            description: body.description,
            accessibility: body.accessibility,
            badge: badgeUrl.Location,
        },
    });
    return team;
};

export const getTeams = async () => {
    const teams = await prisma.team.findMany({
        include: { creator: true, members: { include: { member: true } } },
    });
    return teams;
};

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

const getTheUpdatedObject =  (body:any)=>{
    const updatedObject:{[key:string]:any} = {}
    const properynames = Object.getOwnPropertyNames(body)
    properynames.forEach((value)=> updatedObject[value] = body[value])

    return updatedObject
}

export const updateTeam = async (teamId: string, body: any, file?:Express.Multer.File) => {
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
            accessibility: body.accessibility || existingTeam.accessibility,
            badge: badgeUrl,
        },
    });

    return updatedTeam;
};

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