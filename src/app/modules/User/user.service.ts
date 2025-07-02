import ApiError from "../../../errors/ApiError"
import prisma from "../../../shared/prisma"
import { IPasswordUpdate, IUserRegister, IUserUpdate } from "./user.interface"
import httpstatus from 'http-status'
import bcrypt from 'bcrypt'
import config from "../../../config"
import { jwtHelpers } from "../../../helpers/jwt"
import { UserDto } from "../../dtos/user.dto"
import { fileUploader } from "../../../helpers/fileUploader"
import { generateOtp } from "../../../helpers/generateOtp"
import mailer from "../../../shared/mailSender"
import { OtpStatus } from "@prisma/client"
import globalEventHandler from "../../event/eventEmitter"
import Events from "../../event/events.contant"



const register = async (body:IUserRegister)=>{

    const existingUser = await prisma.user.findFirst({where:{email:body.email}})
    globalEventHandler.emit(Events.USER_REGISTERED)

    if (existingUser){
        throw new ApiError(httpstatus.CONFLICT, "user already exist with this email")
    }

    if (body.password !== body.confirmPassword){
        throw new ApiError(httpstatus.BAD_REQUEST, "Password not matched")
    }

    const hashedPassword = await bcrypt.hash(body.password as string, parseInt(config.bcrypt_salt_rounds as string))



    const createdUser = await prisma.user.create({data:{firstName:body.firstName, lastName:body.lastName,email:body.email as string, password:hashedPassword,phone:body.phone}})

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

const getUsers = async ()=>{
    const users = await prisma.user.findMany()

    const mappedUsers = users.map((user)=>{
        return UserDto(user)
    })

    return mappedUsers
}

const updateUser = async (userId:string,userData:IUserUpdate, file?:Express.Multer.File)=>{
    const user = await prisma.user.findUnique({where:{id:userId}})
    if(!user){
        throw new ApiError(httpstatus.NOT_FOUND, "User not found")
    }
    let updatedAvatarUrl = null

    if(file){
        let fileData = await fileUploader.uploadToDigitalOcean(file)
        updatedAvatarUrl = fileData.Location
    }

    const updatedUser = await prisma.user.update({where:{id:user.id}, data:{
        firstName:userData.firstName,
        lastName:userData.lastName,
        phone:userData.phone,
        avatar:updatedAvatarUrl || user.avatar
    }})

    return UserDto(updatedUser)
}

const getUserDetails = async (userId:string)=>{

    const user = await prisma.user.findUnique({where:{id:userId}})
    if(!user){
        throw new ApiError(httpstatus.NOT_FOUND, "User not found")
    }

    return UserDto(user)
}

const resetPassword = async (email:string,userData:IPasswordUpdate, token:string)=>{
    
    const user = await prisma.user.findFirst({where:{email}})
    if(!user){
        throw new ApiError(httpstatus.NOT_FOUND, 'user not found')
    }
    const otp = await prisma.otp.findFirst({where:{id:token, otpStatus:OtpStatus.VALIDATED}})
    if (!otp){
        throw new ApiError(httpstatus.BAD_REQUEST, "Sorry, You are not able to reset your password")
    }
    await prisma.otp.delete({where:{id:otp.id}})
    
    if (userData.password !== userData.confirmPassword){
        throw new ApiError(httpstatus.BAD_REQUEST, "Password does not matched")
        
    }

    const hashedPassword = await bcrypt.hash(userData.password, config.bcrypt_salt_rounds as string)

    const updatedUser = await prisma.user.update({where:{id:user.id}, data:{password:hashedPassword}})

    return UserDto(updatedUser)
}

const uploadAvatar = async (file:Express.Multer.File)=>{

    if (!file){
        throw new ApiError(httpstatus.BAD_REQUEST, "File is required")
    }

    const uploadedFile = fileUploader.uploadToDigitalOcean(file)

    return uploadedFile

}

const forgetPassword = async ( email:string)=>{
    const user = await prisma.user.findFirst({where:{email}})

    if(!user){
        throw new ApiError(httpstatus.NOT_FOUND, "User not found with this email")
    }

    const existingOtp = await prisma.otp.findUnique({where:{userId:user.id}})

    if(existingOtp){
        await prisma.otp.deleteMany({where:{userId:user.id}})
    }

    const otp = generateOtp()
    const expires_in = new Date(Date.now() + 5 * 60 * 1000)

    await prisma.otp.create({data:{code:otp, expires_in,userId:user.id, expiresAt:expires_in}})

    // const html = `<div class="email-body">
    //   <h2>Password Reset</h2>
    //   <p>We got a request to reset your password</p>
    //   <div class="otp-code">Reset password code: ${otp}</div>
    //   <p>This OTP will expire in <strong>5 minutes</strong>.</p>
    //   <p>If you did not request this, please contact our support team immediately.</p>
    // </div>`

    // mailer(email,html, "Your Capture Award")
}

const verifyOtp = async (email:string, otp:string)=>{
    const user = await prisma.user.findUnique({where:{email}})

    if (!user){
        throw new ApiError(httpstatus.NOT_FOUND, "Usre not found")
    }

    const existingOtp = await prisma.otp.findUnique({where:{userId:user.id}})

    if(!existingOtp){
        throw new ApiError(httpstatus.BAD_REQUEST,"Invalid otp")
    }

    if (existingOtp.code !== otp ){
        throw new ApiError(httpstatus.BAD_REQUEST, 'Otp incorrect')
    }
    if (existingOtp.expires_in <=new Date()){
        throw new ApiError(httpstatus.BAD_REQUEST, "Otp expired")
    }

    await prisma.otp.update({where:{id:existingOtp.id}, data:{otpStatus:OtpStatus.VALIDATED}})

   return {reset_password_token: existingOtp.id}
     
}

const getUserBySocialId = async (socialProvider:string, socialId:string)=>{
    const user = await prisma.user.findFirst({where:{socialProvider, socialId}})

    return user
}

export const userService = {
    register,
    getUsers,
    updateUser,
    resetPassword,
    uploadAvatar,
    forgetPassword,
    getUserBySocialId,
    verifyOtp,
    getUserDetails
}