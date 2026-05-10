import prisma from '../../../shared/prisma';
import ApiError from '../../../errors/ApiError';
import httpstatus from 'http-status';
import globalEventHandler from '../../event/eventEmitter';
import Events from '../../event/events.constant';
import { paginationHelper } from '../../../helpers/paginationHelper';


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


export const handleGetMyFollowers = async (userId:string, page: number = 1, limit: number = 10)=>{
    const { skip, limit: paginationLimit } = paginationHelper.calculatePagination({ page, limit });

    const followers = await prisma.follow.findMany({
        where:{followingId:userId}, 
        skip,
        take: paginationLimit,
        include:{follower:{select:{id:true, avatar:true, fullName:true, firstName:true, lastName:true}}},
        orderBy: { createdAt: 'desc' }
    })

    const total = await prisma.follow.count({where:{followingId:userId}});
    const meta = paginationHelper.getPaginationMetaData(page, paginationLimit, total);

    return { data: followers, meta };
}

export const handleGetMyFollowings = async (userId:string, page: number = 1, limit: number = 10) => {
    const { skip, limit: paginationLimit } = paginationHelper.calculatePagination({ page, limit });

    const followings = await prisma.follow.findMany({
        where:{followerId:userId}, 
        skip,
        take: paginationLimit,
        include:{following:{select:{id:true, avatar:true, fullName:true, firstName:true, lastName:true}}},
        orderBy: { createdAt: 'desc' }
    })

    const total = await prisma.follow.count({where:{followerId:userId}});
    const meta = paginationHelper.getPaginationMetaData(page, paginationLimit, total);

    return { data: followings, meta };
}


export const followService  ={
    getFollowerCount,
    getFollowingCount
}