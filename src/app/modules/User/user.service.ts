import ApiError from "../../../errors/ApiError"
import prisma from "../../../shared/prisma"
import { IPasswordUpdate } from "./user.interface"
import httpstatus from 'http-status'
import { UserDto } from "../../dtos/user.dto"
import { fileUploader } from "../../../helpers/fileUploader"
import { generateOtp } from "../../../helpers/generateOtp"
import mailer from "../../../shared/mailSender"
import { hashing } from "../../../helpers/hash"
import { OtpStatus, UserRole } from "../../../prismaClient"
import { userAdminUpdateData, userUpdateData } from "./user.types"
import bcrypt from 'bcryptjs'




const getUsers = async ()=>{
    const users = await prisma.user.findMany({omit:{password:true, createdAt:true, updatedAt:true,accessToken:true}})

    // const mappedUsers = users.map((user)=>{
    //     return UserDto(user)
    // })

    return users
}


const updateProfilePhoto = async (userId:string, file: Express.Multer.File)=>{
    const user = await prisma.user.findUnique({where:{id:userId}})

    if(!user){
        throw new ApiError(httpstatus.NOT_FOUND, "user not found")
    }
    if(!file){
        throw new ApiError(httpstatus.BAD_REQUEST, "avatar photo is required")
    }

    let url = await fileUploader.uploadToDigitalOcean(file)

    await prisma.user.update({where:{id:userId}, data:{avatar:url.Location}})

    return "Cover photo updated!"
}


const updateCoverPhoto = async (userId:string, file: Express.Multer.File)=>{
    const user = await prisma.user.findUnique({where:{id:userId}})

    if(!user){
        throw new ApiError(httpstatus.NOT_FOUND, "user not found")
    }
    if(!file){
        throw new ApiError(httpstatus.BAD_REQUEST, "cover photo is required")
    }

    let url = await fileUploader.uploadToDigitalOcean(file)

    await prisma.user.update({where:{id:userId}, data:{cover:url.Location}})

    return "Cover photo updated!"
}



const updateUser = async (adminId:string,userId:string,userData:userAdminUpdateData)=>{
    const admin = await prisma.user.findUnique({where:{id:adminId}})

    if(!admin || (admin.role !== UserRole.ADMIN)){
        throw new ApiError(httpstatus.FORBIDDEN, "you can not update the profile")
    }

    const user = await prisma.user.findUnique({where:{id:userId}})

    if(!user){
        throw new ApiError(httpstatus.NOT_FOUND, "User not found")
    }


    const updatedUser = await prisma.user.update({where:{id:user.id}, data:{
        firstName:userData.firstName,
        lastName:userData.lastName,
        location:userData.location,
        level: userData.level
    }})

    return UserDto(updatedUser)
}


const updateProfile = async (userId:string,userData:userUpdateData)=>{


    const user = await prisma.user.findUnique({where:{id:userId}})
    
    if(!user){
        throw new ApiError(httpstatus.NOT_FOUND, "User not found")
    }


    const updatedUser = await prisma.user.update({where:{id:user.id}, data:{
        firstName:userData.firstName,
        lastName:userData.lastName,
        location:userData.location,
    }})

    return UserDto(updatedUser)
}

const getUserDetails = async (userId:string)=>{

    const user = await prisma.user.findUnique({where:{id:userId},include:{store:{select:{trades:true, promotes:true, charges:true}}}, omit:{password:true, createdAt:true, updatedAt:true,accessToken:true}})
    if(!user){
        throw new ApiError(httpstatus.NOT_FOUND, "User not found")
    }

    return user
}

const changePassword = async (userId:string,oldPassword:string, newPassword:string)=>{
    const user =  await prisma.user.findUnique({where:{id:userId}})
    if(!user){
        throw new ApiError(httpstatus.NOT_FOUND,"User not found");
    }
    const oldPasswordMatched = await bcrypt.compare(oldPassword, user.password as string)
    if(!oldPasswordMatched){
        throw new ApiError(httpstatus.BAD_REQUEST, "Password does not mathced!")
    }

    const hashedPassword = await hashing.hashPassowrd(newPassword)
    await prisma.user.update({where:{id:userId}, data:{password:hashedPassword}})

    return "Password updated successfully";

}

const resetPassword = async (email:string,passwordData:IPasswordUpdate, token:string)=>{

    
    const user = await prisma.user.findFirst({where:{email}})
    if(!user){
        throw new ApiError(httpstatus.NOT_FOUND, 'user not found')
    }
    const otp = await prisma.otp.findFirst({where:{id:token, otpStatus:OtpStatus.VALIDATED}})
    if (!otp){
        throw new ApiError(httpstatus.BAD_REQUEST, "Sorry, password reset request is invalid")
    }
    
    if (passwordData.password !== passwordData.confirmPassword){
        throw new ApiError(httpstatus.BAD_REQUEST, "Password does not matched")
        
    }
    // crypt.hash(userData.password, config.bcrypt_salt_rounds as string)
    const hashedPassword = await hashing.hashPassowrd(passwordData.password)

    const updatedUser = await prisma.user.update({where:{id:user.id}, data:{password:hashedPassword}})
    await prisma.otp.delete({where:{id:otp.id}})

    return UserDto(updatedUser)
}

const uploadAvatar = async (userId:string,file:Express.Multer.File)=>{

    if (!file){
        throw new ApiError(httpstatus.BAD_REQUEST, "File is required")
    }

    const uploadedFile = await fileUploader.uploadToDigitalOcean(file)

    await prisma.user.update({where:{id:userId}, data:{avatar:uploadedFile.Location}})

    return "avatar updated successfully"

}


const uploadCover = async (userId:string,file:Express.Multer.File)=>{

    if (!file){
        throw new ApiError(httpstatus.BAD_REQUEST, "File is required")
    }

    const uploadedFile = await fileUploader.uploadToDigitalOcean(file)

    await prisma.user.update({where:{id:userId}, data:{cover:uploadedFile.Location}})

    return "cover updated successfully"

}

const forgetPassword = async ( email:string)=>{
    const user = await prisma.user.findFirst({where:{email}})

    if(!user){
        throw new ApiError(httpstatus.NOT_FOUND, "User not found with this email")
    }

    const existingOtp = await prisma.otp.findUnique({where:{userId:user.id}})
    const otp = generateOtp()
    const expires_in = new Date(Date.now() + 5 * 60 * 1000)



    if(existingOtp){
        await prisma.otp.update({where:{userId:user.id}, data:{code:otp,expires_in, expiresAt:expires_in}})
    }else{
        await prisma.otp.create({data:{code:otp, expires_in,userId:user.id, expiresAt:expires_in}})
    }


    const html = `<div class="email-body">
      <h2>Password Reset</h2>
      <p>We got a request to reset your password</p>
      <div class="otp-code">Reset password code: ${otp}</div>
      <p>This OTP will expire in <strong>5 minutes</strong>.</p>
      <p>If you did not request this, please contact our support team immediately.</p>
    </div>`

    mailer(email,html, "Your Capture Award")
    
    return "Otp send successfully"
}

const verifyOtp = async (email:string, otp:string)=>{
    const user = await prisma.user.findUnique({where:{email}})

    if (!user){
        throw new ApiError(httpstatus.NOT_FOUND, "Usre not found")
    }

    const existingOtp = await prisma.otp.findUnique({where:{userId:user.id}})

    if(!existingOtp){
        throw new ApiError(httpstatus.BAD_REQUEST,"Otp does not exist")
    }
 
 
    if (existingOtp.code !== otp ){
        throw new ApiError(httpstatus.BAD_REQUEST, 'Otp incorrect')
    }

    if (existingOtp.expiresAt <= new Date()){
         await prisma.otp.update({where:{id:existingOtp?.id}, data:{expiresAt:new Date(Date.now())}})
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
    getUsers,
    updateUser,
    resetPassword,
    updateCoverPhoto,
    updateProfilePhoto,
    forgetPassword,
    getUserBySocialId,
    verifyOtp,
    getUserDetails,
    changePassword,
    updateProfile
    
}