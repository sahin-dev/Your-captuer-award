import prisma from '../../../shared/prisma';
import ApiError from '../../../errors/ApiError';
import httpstatus from 'http-status';
import globalEventHandler from '../../event/eventEmitter';
import Events from '../../event/events.constant';


export const handleFollowUnfollow = async (followerId:string, followingId:string) => {

    const existingFollow = await prisma.follow.findUnique({where:{followerId_followingId:{followerId, followingId}}})

    if (existingFollow){
        return handleUnfollowUser(existingFollow.id)
    }
    return handleFollowUser(followerId, followingId)
}

//If user does not follow previously, Add a new follower

export const handleFollowUser = async (followerId: string, followingId: string) => {
    const follow = await prisma.follow.create({
        data: { followerId, followingId }
    });

    //Publish new follower event
    globalEventHandler.publish(Events.NEW_FOLLOWER,followingId)

    return follow;
};



export const handleUnfollowUser = async (followId:string) => {
    await prisma.follow.delete({ where: { id: followId } });
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
    const followers = await prisma.follow.findMany({where:{followingId:userId}, include:{follower:{select:{id:true, avatar:true, fullName:true, firstName:true, lastName:true}}}})

    return followers
}

export const handleGetMyFollowings = async (userId:string) => {
    const followings = await prisma.follow.findMany({where:{followerId:userId}, include:{following:{select:{id:true, avatar:true, fullName:true, firstName:true, lastName:true}}}})

    return followings
}


export const followService  ={
    getFollowerCount,
    getFollowingCount
}