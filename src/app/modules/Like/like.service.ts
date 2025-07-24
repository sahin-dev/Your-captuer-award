import prisma from "../../../shared/prisma"
import globalEventHandler from "../../event/eventEmitter";
import Events from "../../event/events.constant";


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
        return  await removeLike(userId, photoId);
    } else {
        // If like does not exist, create it
        return  await provideLike(userId, photoId);
    }
}

//user can provide like on a photo

export const provideLike = async (userId:string,photoId:string)=>{
    const like =  await prisma.like.create({
        data:{
            providerId:userId,
            photoId
        }
    })

    globalEventHandler.publish(Events.NEW_LIKE, photoId)

    return like
}

// // give like
// export const like = async (userId:string, photoId:string)=>{
//     const existingLike = await prisma.like.findUnique({where:{photoId_providerId:{photoId,providerId:userId}}})

//     if(existingLike){
//         return existingLike
//     }
//     const createdLike = await prisma.like.create({data:{providerId:userId, photoId}})

//     return createdLike
// }

// export const unlike = async (userId:string, photoId:string)=>{
//     const existingLike = await prisma.like.findUnique({where:{photoId_providerId:{photoId,providerId:userId}}})

//     if (!existingLike){
//         return;
//     }
//     const createdLike = await prisma.like.create({data:{providerId:userId, photoId}})

//     return createdLike
// }

//user can remove like on a photo

export const removeLike = async (userId:string,photoId:string)=>{
    return await prisma.like.deleteMany({
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