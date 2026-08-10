import ApiError from "../../../errors/ApiError"
import { fileUploader } from "../../../helpers/fileUploader"
import prisma from "../../../shared/prisma"
import httpStatus from 'http-status'
import { achievementService } from "../Achievements/achievement.service"
import { MappedPhoto } from "./profile.types"
import { voteService } from "../Vote/vote.service"
import { followService } from "../Follow/followe.service"
import { paginationHelper } from "../../../helpers/paginationHelper"

const fetchUserUploads = async (targetUserId:string, pagination:{page?:number, limit?:number}, viewerId?:string)=>{
    let page = pagination.page || 1

    let limit = pagination.limit || 20

    let skip = (page - 1) * limit

    const totalUploads = await prisma.userPhoto.count({where:{userId:targetUserId}})

    const uploads = await prisma.userPhoto.findMany({
        where:{userId:targetUserId},include:{
            contestUpload:{select:{achievements:{orderBy:{createdAt:'desc'}, take:1,
            select:{category:true},},
            id:true}},_count:{select:{likes:true}}},
            take:limit, skip
    })

    const likedPhotoIds = viewerId
        ? new Set((await prisma.like.findMany({where:{providerId:viewerId, photoId:{in:uploads.map(photo => photo.id)}}, select:{photoId:true}})).map(like => like.photoId))
        : new Set<string>()

    const newUploads = await Promise.all(uploads.map( async photo => {
        const contestUploadVotes = await Promise.all(photo.contestUpload.map(contestUpload => voteService.getVoteCount(contestUpload.id)))
        const totalVotes = contestUploadVotes.reduce((sum, votes) => sum + votes, 0)
        return { ...photo, totalVotes,likes:photo._count.likes,_count:undefined, isLiked:likedPhotoIds.has(photo.id)}
    }))

    return {data:newUploads, meta:paginationHelper.getPaginationMetaData(page, limit, totalUploads)}
}

export const handleGetUserUploads = async (userId:string, pagination:{page?:number, limit?:number}, viewerId?:string)=>{
    return fetchUserUploads(userId, pagination, viewerId)
}

export const handleGetUserPublicUploads = async (targetUserId:string, pagination:{page?:number, limit?:number}, viewerId?:string)=>{
    return fetchUserUploads(targetUserId, pagination, viewerId)
}

//Upload photo to cloud and then add to user profile

export const uploadUserPhoto = async (userId:string, file:Express.Multer.File)=>{
    if(!file){
        throw new ApiError(httpStatus.BAD_REQUEST, "Sorry, file is required")
    }

    const user = await prisma.user.findUnique({where:{id:userId}})

    if(!user){
        throw new ApiError(httpStatus.NOT_FOUND, "user not found")
    }

    const uploadedFile = await fileUploader.uploadToDigitalOcean(file)

    const addedPhoto =   await handleAddUpload(userId, uploadedFile.Location)

    return {...addedPhoto, contestUpload: [],
            totalVotes: 0,
            likes: 0}
}

export const handleAddUpload = async (userId:string, photoUrl:string)=>{

    const uploadedPhoto = await prisma.userPhoto.create({data:{url:photoUrl, userId}})

    return uploadedPhoto
}

export const getAvailablePhotoForContest = async (userId:string, contestId:string)=>{

    const user = await prisma.user.findUnique({where:{id:userId}})

    if(!user)
    {
        throw new ApiError(httpStatus.NOT_FOUND, "user does not exist!")
    }

    const photos = await prisma.userPhoto.findMany({where:{userId, contestUpload:{none:{contestId}}},omit:{states:true}})

    return photos
}

export const getParticipatedContest = async(userId:string)=> {
    const participatedContests = await prisma.contest.findMany({where:{participants:{some:{userId}}},select:{banner:true,title:true}})

    return participatedContests
}


export const getPhotos = async (userId:string, sortBy:string = 'votes')=>{

    const photos = await prisma.userPhoto.findMany({where:{userId}, select:{url:true, id:true, views:true,_count:{select:{likes:true}} ,contestUpload:{select:{id:true}}}})
    
    if(!photos || photos.length === 0){
        throw new ApiError(httpStatus.NOT_FOUND, "user does not have any photos")
    }
    // Map photos to include votes property without mutating the original type
    const mappedPhotos = await Promise.all(photos.map(async (photo) => {
        const contestUploadVotes = await Promise.all(photo.contestUpload.map(contestUpload => voteService.getVoteCount(contestUpload.id)))
        const votes = contestUploadVotes.reduce((acc, voteCount) => acc + voteCount, 0);

        // Omit contestUpload property when returning the object
        const { contestUpload,_count, ...rest } = photo;
        return {
            ...rest,
            votes,
            likes: _count.likes
        };
    }));

    sortPhotos(mappedPhotos, sortBy);

    

    return mappedPhotos
}

const sortPhotosByVotes = (photos: MappedPhoto[], start:number, end:number) => {
   
    if(end >= start){
        return photos
    }

    let mid = (start + (end- start)) >> 1;

    sortPhotosByVotes(photos, start, mid);
    sortPhotosByVotes(photos, mid + 1, end);
    merge(photos, start, mid, end);

}

const merge = (photos: MappedPhoto[], start:number, mid:number, end:number) => {
    if (start >= mid || mid + 1 > end) {
        return;
    }
    
    while( start<=mid && mid <= end){
        if (photos[start].votes < photos[mid].votes){
            const tmp = photos[start];
            photos[start] = photos[mid];
            photos[mid] = tmp;
            start++;
        }
        else{
            mid++;
        }
    }
   
}

const sortPhotos = (photos: any[], sortBy: string) => {

    switch (sortBy) {
        case 'votes':
            sortPhotosByVotes(photos,0, photos.length);
            break;
        case 'views':
            photos.sort((a, b) => b.views - a.views);
            break;
        case 'likes':
            photos.sort((a, b) => (b.likes || 0) - (a.likes || 0));
            break; 

        default:
            photos.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());   
    }
}

const getStates = async (userId:string)=>{

    const user = await prisma.user.findUnique({where:{id:userId}})

    if(!user){
        throw new ApiError(httpStatus.NOT_FOUND, "user not found")
    }

    const userStates = await prisma.user.findUnique({where:{id:userId},select:{_count:{select:{likes:{where:{photo:{userId}}}, userPhotos:true, }}}})
    const achievementsCount = await achievementService.getAchievementCount(userId)
    const followerCount = await followService.getFollowerCount(userId)
    const followingCount = await followService.getFollowingCount(userId)

    return {...userStates?._count, follower:followerCount, following:followingCount, achievements: achievementsCount.total}
}

const isFollowedByViewer = async (targetUserId:string, viewerId?:string)=>{
    if(!viewerId || viewerId === targetUserId){
        return false
    }
    const follow = await prisma.follow.findUnique({where:{followerId_followingId:{followerId:viewerId, followingId:targetUserId}}})
    return follow != null
}

const getUserProfileDetails = async (userId:string, viewerId?:string)=>{
    const user = await prisma.user.findUnique({where:{id:userId}, select:{avatar:true, location:true,fullName:true, cover:true}})
    if(!user){
        throw new ApiError(httpStatus.NOT_FOUND, "User not found")
    }

    const totalVotes = (await voteService.getTotalOrganicVotes(userId)) +  (await voteService.getTotalPromotedVotes(userId))
    const isFollowed = await isFollowedByViewer(userId, viewerId)

    return {...user, totalVotes, isFollowed}
}


const getUserPhotoDetails = async (userId:string, photoId:string, viewerId?:string) => {
    const photo = await prisma.userPhoto.findUnique({where:{id:photoId,userId}})
    if(!photo){
        throw new ApiError(httpStatus.NOT_FOUND, "photo not found")
    }

    const votes = await voteService.getUserPhotoVoteCount(photo.id)
    const comments = await prisma.comment.findMany({where:{photoId}})
    const achievememnts = await achievementService.getPhotoAchievements(photoId)
    const isLiked = viewerId ? (await prisma.like.findFirst({where:{providerId:viewerId, photoId}})) != null : false

    return {photo, votes, comments, achievememnts, isLiked}
}

const getPublicPhotoDetails = async (photoId:string, viewerId?:string) => {
    const photo = await prisma.userPhoto.findUnique({where:{id:photoId}})
    if(!photo){
        throw new ApiError(httpStatus.NOT_FOUND, "photo not found")
    }

    const votes = await voteService.getUserPhotoVoteCount(photo.id)
    const comments = await prisma.comment.findMany({where:{photoId}})
    const achievememnts = await achievementService.getPhotoAchievements(photoId)
    const isLiked = viewerId ? (await prisma.like.findFirst({where:{providerId:viewerId, photoId}})) != null : false
    const isFollowed = await isFollowedByViewer(photo.userId, viewerId)

    return {photo, votes, comments, achievememnts, isLiked, isFollowed}
}

const deleteUserPhoto = async (userId:string, photoId:string)=> {
    const photo = await prisma.userPhoto.findUnique({where:{id:photoId, userId}})

    if(!photo){
        throw new ApiError(httpStatus.NOT_FOUND, "photo not found")
    }

    const deletedPhoto = await prisma.userPhoto.delete({where:{id:photo.id}})

    return deletedPhoto
}

export const profileService = {
    uploadUserPhoto,
    getStates,
    getAvailablePhotoForContest,
    getParticipatedContest,
    getPhotos,
    handleAddUpload,
    getUserProfileDetails,
    getUserPhotoDetails,
    getPublicPhotoDetails,
    deleteUserPhoto

}
