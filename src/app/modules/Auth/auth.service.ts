import ApiError from "../../../errors/ApiError"
import prisma from "../../../shared/prisma"
import { UserSignIn } from "./auth.interface"
import httpstatus from "http-status"
import bcrypt from "bcryptjs"
import { jwtHelpers } from "../../../helpers/jwt"
import config from "../../../config"
import { Secret } from "jsonwebtoken"
import { UserDto } from "../../dtos/user.dto"
import { IUser } from "../User/user.interface"
import globalEventHandler from "../../event/eventEmitter"
import Events from "../../event/events.constant"
import { UserRegistrationData, UserSignInData } from "./auth.types"


export const handleRegister = async (body:UserRegistrationData)=>{

    const existingUser = await prisma.user.findFirst({where:{email:body.email}})
   

    if (existingUser){
        throw new ApiError(httpstatus.CONFLICT, "user already exist with this email")
    }

    if ( body.confirmPassword && (body.password !== body.confirmPassword)){
        throw new ApiError(httpstatus.BAD_REQUEST, "Password does not not matched")
    }

    const hashedPassword = await bcrypt.hash(body.password as string, parseInt(config.bcrypt_salt_rounds as string))



    const createdUser = await prisma.user.create({data:{firstName:body.firstName, lastName:body.lastName,email:body.email as string, password:hashedPassword,phone:body.phone}})

    //Publish a event: New user registered

    globalEventHandler.publish(Events.USER_REGISTERED, createdUser)
    
    const token = jwtHelpers.generateToken({id:createdUser.id, role:createdUser.role, email:createdUser.email})

    await prisma.user.update({where:{id:createdUser.id}, data:{accessToken:token}})

    // const userData = {
    //         id:createdUser.id,
    //         firstName:createdUser.firstName,
    //         lastName: createdUser.lastName,
    //         username:createdUser.username,
    //         email: createdUser.email,
    //         role: createdUser.role,
    //         phone: createdUser.phone
    //     }

    return {user:UserDto(createdUser), token}
}


export const handleSignIn = async(body:UserSignInData)=>{
    
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