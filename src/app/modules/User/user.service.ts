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



const register = async (body:IUserRegister)=>{

    const existingUser = await prisma.user.findFirst({where:{email:body.email}})

    if (existingUser){
        throw new ApiError(httpstatus.CONFLICT, "user already exist with this email")
    }

    if (body.password !== body.confirmPassword){
        throw new ApiError(httpstatus.BAD_REQUEST, "Password not matched")
    }

    const hashedPassword = await bcrypt.hash(body.password, parseInt(config.bcrypt_salt_rounds as string))



    const createdUser = await prisma.user.create({data:{firstName:body.firstName, lastName:body.lastName,email:body.email, password:hashedPassword,phone:body.phone}})

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

const updateUser = async (userId:string,userData:IUserUpdate)=>{
    const user = await prisma.user.findUnique({where:{id:userId}})
    if(!user){
        throw new ApiError(httpstatus.NOT_FOUND, "User not found")
    }

    const updatedUser = await prisma.user.update({where:{id:user.id}, data:{
        firstName:userData.firstName,
        lastName:userData.lastName,
        phone:userData.phone
    }})

    return UserDto(updatedUser)
}

const setPassword = async (userId:string,userData:IPasswordUpdate)=>{
    const user = await prisma.user.findUnique({where:{id:userId}})
    if(!user){
        throw new ApiError(httpstatus.NOT_FOUND, 'user not found')
    }
    if (userData.password !== userData.confirmPassword){
        throw new ApiError(httpstatus.BAD_REQUEST, "Password does not matched")
        
    }

    const hashedPassword = await bcrypt.hash(userData.password, config.bcrypt_salt_rounds as string)

    const updatedUser = await prisma.user.update({where:{id:userId}, data:{password:hashedPassword}})

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

    if (existingOtp.code !== otp && existingOtp.expires_in <= new Date()){
        throw new ApiError(httpstatus.BAD_REQUEST, 'Otp expired')
    }
    await 
}

export const userService = {
    register,
    updateUser,
    setPassword,
    uploadAvatar,
    forgetPassword
}