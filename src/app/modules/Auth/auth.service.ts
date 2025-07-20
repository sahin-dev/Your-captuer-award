import ApiError from "../../../errors/ApiError"
import prisma from "../../../shared/prisma"
import { UserSignIn } from "./auth.interface"
import httpstatus from "http-status"
import bcrypt from "bcryptjs"
import { jwtHelpers } from "../../../helpers/jwt"
import config from "../../../config"
import { Secret } from "jsonwebtoken"
import { UserDto } from "../../dtos/user.dto"


export const handleSignIn = async(body:UserSignIn)=>{
    
    const user = await prisma.user.findFirst({where:{OR:[{email:body.emailorusername}, {username:body.emailorusername}]}})

    if (!user){
        throw new ApiError(httpstatus.NOT_FOUND,"User not found")
    }

    if (await bcrypt.compare(body.password, user.password!)){
        if (!(config.jwt.jwt_secret && config.jwt.expires_in)){
            throw new Error("Jwt tokens are not valid")
        }
        let token = jwtHelpers.generateToken({id:user.id, role:user.role},config.jwt.jwt_secret as Secret, config.jwt.expires_in)

        await prisma.user.update({where:{id:user.id}, data:{accessToken:token}})

        // const userData = {
        //     id:user.id,
        //     firstName:user.firstName,
        //     lastName: user.lastName,
        //     username:user.username,
        //     email: user.email,
        //     role: user.role,
        //     phone: user.phone
        // }
        return {user:UserDto(user), token}
    }else{
        throw new ApiError(httpstatus.BAD_REQUEST, "Invalid credentials")
    }
}

export const getAutheticatedUser = async (userId:string)=>{
    const user = await prisma.user.findUnique({where:{id:userId}})

    if (!user){
        throw new ApiError(httpstatus.NOT_FOUND, "user not found")
    }

    return UserDto(user)
}

export const handleSignout = async (userId:string)=>{
    const user  = await prisma.user.findUnique({where:{id:userId}})
    if (!user){
        throw new ApiError(httpstatus.NOT_FOUND, 'User not found')
    }

    await prisma.user.update({where:{id:userId}, data:{accessToken:null}})
}