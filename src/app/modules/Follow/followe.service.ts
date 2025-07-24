import prisma from '../../../shared/prisma';
import ApiError from '../../../errors/ApiError';
import httpstatus from 'http-status';
import globalEventHandler from '../../event/eventEmitter';
import Events from '../../event/events.constant';


export const handleFollowUnfollow = async (followerId:string, followingId:string) => {

    const existingFollow = await prisma.follow.findUnique({where:{followerId_followingId:{followerId, followingId}}})

    if (existingFollow){
        return handleUnfollowUser(followerId, followingId)
    }
    return handleFollowUser(followerId, followingId)
}

export const handleFollowUser = async (followerId: string, followingId: string) => {
    const follow = await prisma.follow.create({
        data: { followerId, followingId }
    });

    //Publish new follower event
    globalEventHandler.publish(Events.NEW_FOLLOWER,followingId)

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

export const getFollowerCount = async (userId:string) => {
    const count = await prisma.follow.count({where:{followingId:userId}})

    return count
}

export const getFollowingCount = async (userId:string)=>{
    const count = await prisma.follow.count({where:{followerId:userId}})
    return count
}


export const handleGetMyFollowers = async (userId:string)=>{
    const followers = await prisma.follow.findMany({where:{followingId:userId}, include:{follower:true}})

    return followers
}

export const handleGetMyFollowings = async (userId:string) => {
    const follwoings = await prisma.follow.findMany({where:{followerId:userId}, include:{following:true}})

    return follwoings
}
