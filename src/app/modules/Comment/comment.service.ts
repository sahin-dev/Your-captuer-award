import ApiError from '../../../errors/ApiError';
import prisma from '../../../shared/prisma';
import httpStatus from 'http-status'
import { paginationHelper } from '../../../helpers/paginationHelper';

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

export const handleGetUserComments = async (photoId: string, page: number = 1, limit: number = 10) => {
    const { skip, limit: paginationLimit } = paginationHelper.calculatePagination({ page, limit });

    const comments = await prisma.comment.findMany({
        where: { photoId },
        skip,
        take: paginationLimit,
        include: { provider: {select:{avatar:true, fullName:true, firstName:true, lastName:true}} ,commentReplies:
    {include:{commentReplies:{include:{provider:{select:{avatar:true, firstName:true,lastName:true, fullName:true}}}}, provider:{select:{avatar:true, fullName:true, firstName:true, lastName:true}}},}},
        orderBy:{createdAt:"desc"}
    });
    
    const total = await prisma.comment.count({where: { photoId }});
    const meta = paginationHelper.getPaginationMetaData(page, paginationLimit, total);

    return { data: comments, meta };
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