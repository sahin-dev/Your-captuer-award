import prisma from '../../../shared/prisma';
import ApiError from '../../../errors/ApiError';
import httpstatus from 'http-status';

export const handleFollowUser = async (followerId: string, followingId: string) => {
    const follow = await prisma.follow.create({
        data: { followerId, followingId }
    });

    return follow;
};

export const handleUnfollowUser = async (followerId: string, followingId: string) => {
    const follow = await prisma.follow.findFirst({
        where: { followerId, followingId }
    });

    if (!follow) {
        throw new ApiError(httpstatus.NOT_FOUND, 'Follow relation not found');
    }

    await prisma.follow.delete({ where: { id: follow.id } });
};
