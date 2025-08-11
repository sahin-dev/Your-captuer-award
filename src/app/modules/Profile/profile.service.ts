import prisma from "../../../shared/prisma"


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

    const photos = await prisma.userPhoto.findMany({where:{userId, contestUpload:{none:{contestId}}},omit:{states:true}})

    return photos
}


export const getPhotos = async (userId:string)=>{

    const photos = await prisma.userPhoto.findMany({where:{userId}})

    return photos
}