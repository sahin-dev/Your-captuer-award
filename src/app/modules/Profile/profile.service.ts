import ApiError from "../../../errors/ApiError"
import prisma from "../../../shared/prisma"
import httpStatus from 'http-status'

export const handleGetUserUploads = async (userId:string)=>{
    const uploads = await prisma.userPhoto.findMany({
        where:{userId}, include:{}
    })

    return uploads
} 

export const handleAddUpload = async (userId:string, photoUrl:string)=>{

    const uploadedPhoto = await prisma.userPhoto.create({data:{url:photoUrl, userId}})

    return uploadedPhoto
}

export const getAvailablePhotoForContest = async (userId:string, contestId:string)=>{

    const user = await prisma.user.findUnique({where:{id:userId}})

    if(!user)
    {
        throw new ApiError(httpStatus.NOT_FOUND, "user does not exist!")
    }

    const photos = await prisma.userPhoto.findMany({where:{userId, contestUpload:{none:{contestId}}},omit:{states:true}})

    return photos
}

export const getParticipatedContest = async(userId:string)=> {
    const participatedContests = await prisma.contest.findMany({where:{participants:{some:{userId}}},select:{banner:true,title:true}})

}


export const getPhotos = async (userId:string)=>{

    const photos = await prisma.userPhoto.findMany({where:{userId}})

    return photos
}