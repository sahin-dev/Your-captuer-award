import ApiError from "../../../errors/ApiError"
import { fileUploader } from "../../../helpers/fileUploader"
import prisma from "../../../shared/prisma"
import httpStatus from 'http-status'
import { achievementService } from "../Achievements/achievement.service"

export const handleGetUserUploads = async (userId:string)=>{
    const uploads = await prisma.userPhoto.findMany({
        where:{userId},select:{id:true,url:true,contestUpload:{select:{achievements:{orderBy:{createdAt:'desc'}, take:1,select:{category:true}}}}},
    })

    return uploads
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


export const getPhotos = async (userId:string, sortBy:string = '')=>{

    const photos = await prisma.userPhoto.findMany({where:{userId}, select:{url:true, id:true, views:true,_count:{select:{likes:true}} ,contestUpload:{select:{_count:{select:{votes:true}}}}}})
    
    if(!photos || photos.length === 0){
        throw new ApiError(httpStatus.NOT_FOUND, "user does not have any photos")
    }
    // Map photos to include votes property without mutating the original type
    const mappedPhotos:any = photos.map((photo) => {
        const votes = photo.contestUpload.reduce((acc: number, obj: any) => {
            return acc + (obj._count.votes || 0);
        }, 0);

        sortPhotos(mappedPhotos, sortBy);
    
        return {
            ...mappedPhotos,
            votes
        };
    });

    

    return mappedPhotos
}

const sortPhotosByVotes = (photos: any[], start:number, end:number) => {
   
    if(end >= start){
        return photos
    }

    let mid = (start + (end- start)) >> 1;

    sortPhotosByVotes(photos, start, mid);
    sortPhotosByVotes(photos, mid + 1, end);
    merge(photos, start, mid, end);

}

const merge = (photos: any[], start:number, mid:number, end:number) => {
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

    const userStates = await prisma.user.findUnique({where:{id:userId},select:{_count:{select:{followers:true,followings:true,likes:{where:{photo:{userId}}}, userPhotos:true, }}}})
    const achievementsCount = await achievementService.getAchievementCount(userId)

    return {...userStates?._count, achievements: (achievementsCount.top_photo + achievementsCount.top_photographer)}
}


export const profileService = {
    uploadUserPhoto,
    getStates,
    getAvailablePhotoForContest,
    getParticipatedContest,
    getPhotos,
    handleAddUpload
 
}