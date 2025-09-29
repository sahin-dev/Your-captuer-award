import ApiError from "../../../errors/ApiError"
import { fileUploader } from "../../../helpers/fileUploader"
import prisma from "../../../shared/prisma"
import httpStatus from 'http-status'
import { achievementService } from "../Achievements/achievement.service"
import { UserPhoto } from "../../../prismaClient"
import { MappedPhoto } from "./profile.types"
import { voteService } from "../Vote/vote.service"
import { followService } from "../Follow/followe.service"

export const handleGetUserUploads = async (userId:string)=>{
    const uploads = await prisma.userPhoto.findMany({
        where:{userId},include:{contestUpload:{select:{achievements:{orderBy:{createdAt:'desc'}, take:1,select:{category:true},}, _count:{select:{votes:true}}}},_count:{select:{likes:true}}},
    })
    const newUploads = uploads.map( photo => {
        const totalVotes = photo.contestUpload.reduce ( (sum, contestUploads)=>{
            return sum + (contestUploads?._count?.votes ?? 0)
        },0)
        return { ...photo, totalVotes,likes:photo._count.likes,_count:undefined}
    })
    return newUploads
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

    return addedPhoto
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

    const contestPhotos = await prisma.contestPhoto.findMany({where:{photo:{userId}}, select:{_count:{select:{votes:true}}}})

    const photos = await prisma.userPhoto.findMany({where:{userId}, select:{url:true, id:true, views:true,_count:{select:{likes:true}} ,contestUpload:{select:{_count:{select:{votes:true}}}}}})
    
    if(!photos || photos.length === 0){
        throw new ApiError(httpStatus.NOT_FOUND, "user does not have any photos")
    }
    // Map photos to include votes property without mutating the original type
    const mappedPhotos = photos.map((photo) => {
        const votes = photo.contestUpload.reduce((acc: number, obj: any) => {
            return acc + (obj._count.votes || 0);
        }, 0);

        // Omit contestUpload property when returning the object
        const { contestUpload,_count, ...rest } = photo;
        return {
            ...rest,
            votes,
            likes: _count.likes
        };
    });

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
            photos.sort((a, b) => (b._count.likes || 0) - (a._count.likes || 0));
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

    return {...userStates?._count, follower:followerCount, following:followingCount, achievements: (achievementsCount.top_photo + achievementsCount.top_photographer)}
}

const getUserProfileDetails = async (userId:string)=>{
    const user = await prisma.user.findUnique({where:{id:userId}, select:{avatar:true, location:true,fullName:true, cover:true}})
    if(!user){
        throw new ApiError(httpStatus.NOT_FOUND, "User not found")
    }

    const totalVotes = (await voteService.getTotalOrganicVotes(userId)) +  (await voteService.getTotalPromotedVotes(userId))

    return {...user, totalVotes}
}


const getUserPhotoDetails = async (userId:string, photoId:string) => {
    const photo = await prisma.userPhoto.findUnique({where:{id:photoId,userId}})
    if(!photo){
        throw new ApiError(httpStatus.NOT_FOUND, "photo not found")
    }

    const votes = await voteService.getVoteCount(photo.id)
    const comments = await prisma.comment.findMany({where:{photoId}})
    const achievememnts = await achievementService.getPhotoAchievements(photoId)

    return {photo, votes, comments, achievememnts}
}

export const profileService = {
    uploadUserPhoto,
    getStates,
    getAvailablePhotoForContest,
    getParticipatedContest,
    getPhotos,
    handleAddUpload,
    getUserProfileDetails,
    getUserPhotoDetails
 
}