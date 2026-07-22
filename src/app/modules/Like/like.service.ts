import prisma from "../../../shared/prisma"
import globalEventHandler from "../../event/eventEmitter";
import Events from "../../event/events.constant";
import { paginationHelper } from "../../../helpers/paginationHelper";


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
    } 

    // If like does not exist, create it
    return  await provideLike(userId, photoId);
    
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

export const getLikes = async (photoId:string)=>{
    return await prisma.like.findMany({
        where:{
            photoId
        },
        include:{
            provider:true
        }
    })
}

//user can get all photos liked by a user

export const handleGetLikedPhotos = async (userId:string, page: number = 1, limit: number = 10)=>{
    const { skip, limit: paginationLimit } = paginationHelper.calculatePagination({ page, limit });

    const likes = await prisma.like.findMany({
        where:{
            providerId:userId
        },
        skip,
        take: paginationLimit,
        include:{
            photo:true
        },
        orderBy: { createdAt: 'desc' }
    });

    const total = await prisma.like.count({where:{providerId:userId}});
    const meta = paginationHelper.getPaginationMetaData(page, paginationLimit, total);

    return { data: likes, meta };
}