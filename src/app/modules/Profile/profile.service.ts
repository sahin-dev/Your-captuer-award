import ApiError from "../../../errors/ApiError"
import { fileUploader } from "../../../helpers/fileUploader"
import prisma from "../../../shared/prisma"
import httpStatus from 'http-status'
import { achievementService } from "../Achievements/achievement.service"
import { MappedPhoto } from "./profile.types"
import { voteService } from "../Vote/vote.service"
import { followService } from "../Follow/followe.service"
import { paginationHelper } from "../../../helpers/paginationHelper";
import { handleGetUserComments } from "../Comment/comment.service";


export const handleGetUserUploads = async (userId:string, pagination:{page?:number, limit?:number}, viewerId?:string)=>{
    let page = pagination.page || 1

    let limit = pagination.limit || 20

    const { skip, limit: paginationLimit } = paginationHelper.calculatePagination({ page, limit });

    const totalUploads = await prisma.userPhoto.count({where:{userId}})

    const uploads = await prisma.userPhoto.findMany({
        where:{userId},include:{
            contestUpload:{select:{achievements:{orderBy:{createdAt:'desc'}, take:1,
            select:{category:true},},
            _count:{select:{votes:true}}}},_count:{select:{likes:true}}},
            take: paginationLimit, 
            skip
    })

    // Fetch liked photo IDs for the viewer in one query
    let likedPhotoIds = new Set<string>()
    if (viewerId) {
        const likedPhotos = await prisma.like.findMany({
            where: { providerId: viewerId, photoId: { in: uploads.map(p => p.id) } },
            select: { photoId: true }
        })
        likedPhotoIds = new Set(likedPhotos.map(l => l.photoId))
    }

    const newUploads = uploads.map( photo => {
        const totalVotes = photo.contestUpload.reduce ( (sum, contestUploads)=>{
            return sum + (contestUploads?._count?.votes ?? 0)
        },0)
        return { ...photo, totalVotes, likes: photo._count.likes, isLiked: likedPhotoIds.has(photo.id), _count: undefined }
    })

    const meta = paginationHelper.getPaginationMetaData(page, paginationLimit, totalUploads);

    return {data: newUploads, meta}
} 


// handleGetUserPublicUploads delegates to handleGetUserUploads with viewerId for isLiked
export const handleGetUserPublicUploads = async (userId:string, pagination:{page?:number, limit?:number}, viewerId?:string)=>{
    return handleGetUserUploads(userId, pagination, viewerId)
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

    // Upload file to filesystem with BASE_URL prefix
    const uploadedFile = await fileUploader.uploadToFilesystem(file)
    const addedPhoto = await handleAddUpload(userId, uploadedFile.Location)

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

const getUserProfileDetails = async (userId:string, viewerId?:string)=>{
    const user = await prisma.user.findUnique({
        where:{id:userId},
        select:{id:true, avatar:true, location:true, fullName:true, firstName:true, lastName:true, username:true, cover:true}
    })
    if(!user){
        throw new ApiError(httpStatus.NOT_FOUND, "User not found")
    }

    const totalVotes = (await voteService.getTotalOrganicVotes(userId)) + (await voteService.getTotalPromotedVotes(userId))

    // Check if the viewer follows this user
    let isFollowed = false
    if (viewerId && viewerId !== userId) {
        const follow = await prisma.follow.findUnique({
            where: { followerId_followingId: { followerId: viewerId, followingId: userId } }
        })
        isFollowed = !!follow
    }

    return {...user, totalVotes, isFollowed}
}


const getUserPhotoDetails = async (userId:string, photoId:string, viewerId?:string) => {
    const photo = await prisma.userPhoto.findUnique({
        where:{id:photoId},
        include:{
            user:{
                select:{
                    id:true, avatar:true, fullName:true, firstName:true,
                    lastName:true, username:true, location:true, cover:true
                }
            },
            _count:{ select:{ likes:true } }
        }
    })
    if(!photo){
        throw new ApiError(httpStatus.NOT_FOUND, "photo not found")
    }

    const votes = await voteService.getVoteCount(photo.id)
    const { data: comments } = await handleGetUserComments(photoId, 1, 10)
    const achievememnts = await achievementService.getPhotoAchievements(photoId)

    // Check if viewer follows the photo owner
    let isFollowed = false
    if (viewerId && viewerId !== userId) {
        const follow = await prisma.follow.findUnique({
            where: { followerId_followingId: { followerId: viewerId, followingId: userId } }
        })
        isFollowed = !!follow
    }

    // Check if viewer has liked this photo
    let isLiked = false
    if (viewerId) {
        const like = await prisma.like.findFirst({
            where: { providerId: viewerId, photoId }
        })
        isLiked = !!like
    }

    const { _count, ...photoData } = photo

    return {
        photo: {
            ...photoData,
            likes: _count.likes,
            isLiked,
            isFollowed
        },
       
        votes,
        comments,
        achievememnts
    }
}

const deleteUserPhoto = async (userId:string, photoId:string)=> {
    const photo = await prisma.userPhoto.findUnique({
        where: { id: photoId, userId },
        include: { contestUpload: true }
    })

    if(!photo){
        throw new ApiError(httpStatus.NOT_FOUND, "photo not found")
    }

    const contestPhotoIds = photo.contestUpload.map(cp => cp.id)

    // Gather comment replies to prevent relation/orphan issues
    let commentIdsToDelete: string[] = []
    if (contestPhotoIds.length > 0) {
        const rootComments = await prisma.comment.findMany({
            where: { photoId: { in: contestPhotoIds } },
            select: { id: true }
        })
        const rootCommentIds = rootComments.map(c => c.id)
        commentIdsToDelete.push(...rootCommentIds)

        if (rootCommentIds.length > 0) {
            // Level 1 replies
            const repliesL1 = await prisma.comment.findMany({
                where: { parentId: { in: rootCommentIds } },
                select: { id: true }
            })
            const repliesL1Ids = repliesL1.map(c => c.id)
            commentIdsToDelete.push(...repliesL1Ids)

            if (repliesL1Ids.length > 0) {
                // Level 2 replies
                const repliesL2 = await prisma.comment.findMany({
                    where: { parentId: { in: repliesL1Ids } },
                    select: { id: true }
                })
                const repliesL2Ids = repliesL2.map(c => c.id)
                commentIdsToDelete.push(...repliesL2Ids)
            }
        }
    }

    const queries = [
        // Delete votes on contest photos
        ...(contestPhotoIds.length > 0 ? [
            prisma.vote.deleteMany({ where: { photoId: { in: contestPhotoIds } } })
        ] : []),
        // Delete winners pointing to contest photos
        ...(contestPhotoIds.length > 0 ? [
            prisma.contestWinner.deleteMany({ where: { contestPhotoId: { in: contestPhotoIds } } })
        ] : []),
        // Delete achievements on contest photos
        ...(contestPhotoIds.length > 0 ? [
            prisma.contestAchievement.deleteMany({ where: { photoId: { in: contestPhotoIds } } })
        ] : []),
        // Delete comments and replies
        ...(commentIdsToDelete.length > 0 ? [
            prisma.comment.deleteMany({ where: { id: { in: commentIdsToDelete } } })
        ] : []),
        // Delete contest photos
        ...(contestPhotoIds.length > 0 ? [
            prisma.contestPhoto.deleteMany({ where: { id: { in: contestPhotoIds } } })
        ] : []),
        // Delete likes on user photo
        prisma.like.deleteMany({ where: { photoId: photo.id } }),
        // Delete the user photo
        prisma.userPhoto.delete({ where: { id: photo.id } })
    ]

    const results = await prisma.$transaction(queries)
    const deletedPhoto = results[results.length - 1] as typeof photo

    return deletedPhoto
}


// Fetch any photo by its ID (for viewing another user's photo detail)
const getPublicPhotoDetails = async (photoId: string, viewerId?: string) => {
    const photo = await prisma.userPhoto.findUnique({
        where: { id: photoId },
        include: {
            user: {
                select: {
                    id: true, avatar: true, fullName: true, firstName: true,
                    lastName: true, username: true, location: true, cover: true
                }
            },
            _count: { select: { likes: true } }
        }
    })
    if (!photo) {
        throw new ApiError(httpStatus.NOT_FOUND, "photo not found")
    }

    const votes = await voteService.getVoteCount(photo.id)
    const { data: comments, meta: commentsMeta } = await handleGetUserComments(photoId, 1, 20)
    const achievememnts = await achievementService.getPhotoAchievements(photoId)

    // Check if viewer follows the photo owner
    let isFollowed = false
    if (viewerId && viewerId !== photo.userId) {
        const follow = await prisma.follow.findUnique({
            where: { followerId_followingId: { followerId: viewerId, followingId: photo.userId } }
        })
        isFollowed = !!follow
    }

    // Check if viewer has liked this photo
    let isLiked = false
    if (viewerId) {
        const like = await prisma.like.findFirst({
            where: { providerId: viewerId, photoId }
        })
        isLiked = !!like
    }

    const { _count, ...photoData } = photo

    return {
        photo: {
            ...photoData,
            likes: _count.likes,
            isLiked,
        },
        photoOwner: {
            ...photo.user,
            isFollowed,
        },
        votes,
        comments,
        commentsMeta,
        achievememnts
    }
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