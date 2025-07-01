import prisma from '../../../shared/prisma';

export const handlePostComment = async (providerId: string, receiverId: string, text: string) => {
    const comment = await prisma.comment.create({
        data: { providerId, receiverId, text }
    });

    return comment;
};

export const handleGetUserComments = async (userId: string) => {
    const comments = await prisma.comment.findMany({
        where: { receiverId: userId },
        include: { provider: true }
    });
    

    return comments;
};
