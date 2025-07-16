import prisma from "../../../shared/prisma"


//user can toggole like on a photo
//if like exists, remove it, if not, create it

export const handleToggleLike = async (userId:string,photoId:string)=>{
    const existingLike = await prisma.like.findFirst({
        where: {
            providerId: userId,
            photoId
        }
    });

    if (existingLike) {
        // If like exists, remove it
        return removeLike(userId, photoId);
    } else {
        // If like does not exist, create it
        return provideLike(userId, photoId);
    }
}

//user can provide like on a photo

export const provideLike = (userId:string,photoId:string)=>{
    return prisma.like.create({
        data:{
            providerId:userId,
            photoId
        }
    })
}

//user can remove like on a photo

export const removeLike = (userId:string,photoId:string)=>{
    return prisma.like.deleteMany({
        where:{
            providerId:userId,
            photoId
        }
    })
}

//user can get all likes on a photo

export const getLikes = (photoId:string)=>{
    return prisma.like.findMany({
        where:{
            photoId
        },
        include:{
            provider:true
        }
    })
}

//user can get all photos liked by a user

export const handleGetLikedPhotos = (userId:string)=>{
    return prisma.like.findMany({
        where:{
            providerId:userId
        },
        include:{
            photo:true
        }
    })
}