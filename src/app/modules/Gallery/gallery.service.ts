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


export const getPhotos = async (userId:string)=>{

    const photos = await prisma.userPhoto.findMany({where:{userId}})

    return photos
}