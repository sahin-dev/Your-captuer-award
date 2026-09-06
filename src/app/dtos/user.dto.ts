import { User } from "../../prismaClient";

type JoinedTeamSummary = {
    team: {id:string; name:string; badge:string}
} | null

export const UserDto = (user:User, joinedTeam?:JoinedTeamSummary)=>{

    return {
        id:user.id,
        firstName:user.firstName,
        lastName: user.lastName,
        fullName:user.fullName,
        username:user.username,
        email: user.email,
        role: user.role,
        phone: user.phone,
        dateOfBirth:user.dateOfBirth,
        avatar: user.avatar,
        cover: user.cover,
        location: user.location,
        joinedTeam: joinedTeam ?? null
    }
}
