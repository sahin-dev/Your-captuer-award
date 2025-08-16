import prisma from '../../../shared/prisma';

export const handlePostComment = async (providerId: string, receiverId: string, text: string, replyTo?:string ) => {

    if(replyTo){
        const comment = await prisma.comment.create({
            data: { providerId, receiverId, text,parentId:replyTo}
        });
        return comment
    }
    const comment = await prisma.comment.create({
        data: { providerId, receiverId, text }
    });

    return comment;
};

export const handleGetUserComments = async (userId: string) => {
    const comments = await prisma.comment.findMany({
        where: { receiverId: userId },
        include: { provider: true ,CommentReplies:true}
    });
    

    return comments;
};


export const getAll = async (receiverId:string)=>{
    const comments = await prisma.comment.findMany({where:{receiverId}})

    return comments
}

export const handlDeleteComment = async (commentId:string)=>{
    const deletedComment = await prisma.comment.delete({where:{id:commentId}})

    return deletedComment
}

export const handleUpdateComment = async (commentId:string, updatedText:string)=>{
    const updatedComment = await prisma.comment.update({where:{id:commentId}, data:{text:updatedText}})
    return updatedComment
}