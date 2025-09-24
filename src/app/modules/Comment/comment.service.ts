import ApiError from '../../../errors/ApiError';
import prisma from '../../../shared/prisma';
import httpStatus from 'http-status'

export const handlePostComment = async (providerId: string,  text: string,photoId?: string, replyTo?:string ) => {
    

    if(replyTo){
        const parentComment = await prisma.comment.findUnique({where:{id:replyTo}})
        if(!parentComment){
            throw new ApiError(httpStatus.NOT_FOUND, "comment not found to reply")
        }
        const comment = await prisma.comment.create({
            data: { providerId,  text,parentId:replyTo},
            include:{provider:{select:{avatar:true, fullName:true, firstName:true, lastName:true}}}
        });
        return comment
    }
    if(!photoId){
        throw new ApiError(httpStatus.BAD_REQUEST, "photo id is required")
    }
     const photo = await prisma.userPhoto.findUnique({where:{id:photoId}})

    if(!photo){
        throw new ApiError(httpStatus.NOT_FOUND, "photo not found")
    }
    const comment = await prisma.comment.create({
        data: { providerId, photoId, text },
        include:{provider:{select:{avatar:true, fullName:true, firstName:true, lastName:true}}}
    });

    return comment;
};

export const handleGetUserComments = async (photoId: string) => {
    const comments = await prisma.comment.findMany({
        where: { photoId },
        include: { provider: {select:{avatar:true, fullName:true, firstName:true, lastName:true}} ,commentReplies:
    {include:{commentReplies:{include:{provider:{select:{avatar:true, firstName:true,lastName:true, fullName:true}}}}, provider:{select:{avatar:true, fullName:true, firstName:true, lastName:true}}},}},
        orderBy:{createdAt:"desc"}
    });
    

    return comments;
};


export const getAll = async (photoId:string)=>{
    const comments = await prisma.comment.findMany({where:{photoId}})

    return comments
}

export const handlDeleteComment = async (userId:string,commentId:string)=>{
    const comment = await prisma.comment.findUnique({where:{id:commentId}})
    if(!comment || comment.providerId !== userId){
        throw new ApiError(httpStatus.BAD_REQUEST, "unable to delete the comment")
    }
    const deletedComment = await prisma.comment.delete({where:{id:commentId}})

    return deletedComment
}

export const handleUpdateComment = async (commentId:string, updatedText:string)=>{
    const updatedComment = await prisma.comment.update({where:{id:commentId}, data:{text:updatedText}})
    return updatedComment
}