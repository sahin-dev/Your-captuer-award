import prisma from '../../../shared/prisma';
import ApiError from '../../../errors/ApiError';
import httpstatus from 'http-status';
import { fileUploader } from '../../../helpers/fileUploader';
import { Contest, ContestParticipant, ContestPhoto, ContestStatus, PrizeType, RecurringContest, RecurringData, YCLevel } from '../../../prismaClient';
import { IContest } from './contest.interface';
import { contestData } from './contest.type';
import { contestRuleService } from './ContestRules/contestRules.service';
import { addContestPrizes } from './ContestPrizes/contestPrize.service';
import { ContestRule } from './ContestRules/conetstRules.type';
import { ContestPrizeData } from './ContestPrizes/contestPrize.type';
import { profileService } from '../Profile/profile.service';
import agenda from '../Agenda';
import { UserStoreService } from '../User/UserStore/userStore.service';
import { validateContestDate } from '../../../helpers/validateDate';
import { calculateNextOccurance } from '../../../helpers/nextOccurance';




//Create a new contest


export const createContest = async (creatorId: string, body: contestData, banner:Express.Multer.File) => {

    //If contest is recurring , save recurring data separately
    if(body.recurring){
       return createRecurringContest(creatorId, body, banner)
    }
    let bannerUrl = null;


    let levels = body.level_requirements.map(levels => parseInt(levels))
    
    const contestData:any = {
        creatorId,
        title: body.title,
        description: body.description,
        status: ContestStatus.UPCOMING,
        level_requirements:levels
    }

    if (banner){
        bannerUrl = (await fileUploader.uploadToDigitalOcean(banner)).Location;
        contestData.banner = bannerUrl
    }

    
    const isDateValid = validateContestDate(body.startDate, body.endDate);

    if(!isDateValid){
        throw new ApiError(httpstatus.BAD_REQUEST, "Start date cannot be after end date");
    }

    
    // If contest is money contest, add money contest data like max prize and min prize for the paerticipants
    // If isMoneyContest is not provided, it will default to false

     if (body.isMoneyContest) {


        if(!body.minPrize || !body.maxPrize || (body.minPrize > body.maxPrize)){
            throw new ApiError(httpstatus.BAD_REQUEST, "Contest prize data is invalid")
        }  
        contestData.isMoneyContest = true; 
        contestData.maxPrize = body.maxPrize || 0;
        contestData.minPrize = body.minPrize || 0;
    }

    //If contest is recurring, Add recurring data to the contest object
    // By default every object is recurring false, so if conetest is not recurring, it will not have recurring data
    contestData.startDate = new Date(body.startDate)
    contestData.endDate = new Date(body.endDate)

    // Create a normal contest entry for all type of contest
       let contest = await prisma.contest.create({
            data: contestData
        });

    

    // if(body.rules){
    //     const rules:ContestRule[] = JSON.parse(body.rules)
        
    //     await contestRuleService.addContestRules(contest.id, rules)
    // }
   
    // if(body.prizes){
    //      const prizes:ContestPrizeData[] = JSON.parse(body.prizes)
    //     await addContestPrizes(contest.id, prizes)
    // }

    return contest;
};


//manage recurring contest separately

const createRecurringContest  =  async (creatorId: string, body: contestData, banner:Express.Multer.File)=>{
    if(!body.recurring){
        throw new Error("Contest is not a recurring contest!")
    }

    const isDateValid = validateContestDate(body.startDate, body.endDate);

    if(!isDateValid){
        throw new ApiError(httpstatus.BAD_REQUEST, "Start date cannot be after end date");
    }
    

    const startDate = new Date(body.startDate)
    const endDate = new Date(body.endDate)

    let levels = body.level_requirements.map(levels => parseInt(levels))

    const contestData:any = {
        creatorId,
        title: body.title,
        description: body.description,
        level_requirements: levels,
        startDate,
        endDate

    }
    if(!body.rules || !body.prizes){
        throw new ApiError(httpstatus.BAD_REQUEST, "contest rules and prizes are required")
    }

    contestData.rules = body.rules
    contestData.prizes = body.prizes
   
    let bannerUrl = null
    if (banner){
        bannerUrl = (await fileUploader.uploadToDigitalOcean(banner)).Location;
        contestData.banner = bannerUrl
    }

    if (body.isMoneyContest) {
        if(!body.minPrize || !body.maxPrize || (body.minPrize > body.maxPrize)){
            throw new ApiError(httpstatus.BAD_REQUEST, "Contest prize data is invalid")
        }  
        contestData.isMoneyContest = true; 
        contestData.maxPrize = body.maxPrize || 0;
        contestData.minPrize = body.minPrize || 0;
    }

    contestData.recurring ={set: {
        recurringType:body.recurringType,
        previousOccurrence:null,
        nextOccurrence:startDate,
        duration:new Date(body.endDate).getTime() - new Date(body.startDate).getTime()
    }
    }
    console.log(contestData)

    const recurringContest = await prisma.recurringContest.create({data:contestData})

    return recurringContest

      
}




export const updateContest = async (contestId:string, contestData:Partial<IContest>)=>{

    const updatedContest = await prisma.contest.update({where:{id:contestId}, data:contestData})

    return updatedContest

}


//delete a contest by the contest id
const deleteContestByContestId =async (contestId:string)=>{
    const contest = await prisma.contest.findUnique({where:{id:contestId}})
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found!")
    }

    await prisma.contest.delete({where:{id:contestId}})
    return "contest deleted!"
}  





// add a user to the contest participant list

export const joinContest = async (userId:string,contestId:string)=>{
    const contest = await prisma.contest.findUnique({where:{id:contestId}})

    if (!contest || contest.status != ContestStatus.ACTIVE){
        throw new ApiError(httpstatus.NOT_FOUND, "Contest is not available to participate")
    }

    const participant = await prisma.contestParticipant.create({data:{contestId,userId}})
    
    if (participant){
        console.log("User has joined the contest")
    }

    return {contest_id:contestId, participant_id:participant.id}

}


//get the contest by it's id

export const getContestById = async (contestId: string) => {
    const contest = await prisma.contest.findUnique({
        where: { id: contestId },
        include: { creator: true, participants: true }
    });

    return contest;
}

// Get all the contests
// This will be used to display all the contests in the contest page

export const getContests = async () => {
    const contests = await prisma.contest.findMany({
        include: { creator: true}
    });

    return contests;
};

//Return all the contests
export const getAllContests = async () => {
    const contests = await prisma.contest.findMany({    
        include: { creator: true}
    });
    return contests;
};

//Search contest by contest status
export const getContestsByStatus = async (userId:string,status: ContestStatus) => {
    let contests :Contest[]= []
    
    let strStatus = status as string
    switch(strStatus){
        case "COMPLETED":
            contests = await prisma.contest.findMany({
                where: { status: ContestStatus.CLOSED,participants: { some: { userId } } },
                include: { creator: true, participants: true }
            });
            break
        case 'UPCOMING':
            contests = await prisma.contest.findMany({
                where: { status: ContestStatus.UPCOMING } ,
                include: { creator: true, participants: true }
            });
            break
        case 'ACTIVE':
            contests = await prisma.contest.findMany({
                where: { status: ContestStatus.ACTIVE, participants:{some:{userId}} },
                include: { creator: true, participants: true }
            });
            break
        case 'CLOSED':
            contests = await prisma.contest.findMany({
                where: { status: ContestStatus.CLOSED },
                include: { creator: true, participants: true }
             });
            break
        default:
            console.log(`No status matched with ${strStatus}`)
            break

    }

    return contests;
};

export const getUpcomingContest = async () => {
    const contests = await prisma.contest.findMany({
        where: { status: ContestStatus.UPCOMING },
        include: { creator: true}
    });
    return contests;
};

//Get my contests which are completed

export const getMyCompletedContest = async (userId:string) => {
    if (!userId){
        throw new ApiError(httpstatus.BAD_REQUEST, "User id is not provided")
    }
    const user = await prisma.user.findUnique({where:{id:userId}})

    if (!user){
        throw new ApiError(httpstatus.NOT_FOUND, "User not found")
    }

    const myParticipatedContest = await prisma.contestParticipant.findMany(
        {where:{userId,contest:{status:ContestStatus.CLOSED, participants:{some:{userId}}}}, 
        select:{contest:{select:{_count:{select:{votes:true}},title:true,banner:true,description:true,}},contestAchievement:true,level:true,photos:{where:{participantId:userId}}}})

    // const myCompletedContests = await prisma.contest.findMany({where:{status:ContestStatus.COMPLETED, participants:{some:{userId}}},include:{_count:{select:{votes:true}}}})
    

    return myParticipatedContest
}


// Fetch completed contest details with winner
export const getClosedContestsWithWinner = async () => {
    // Fetch contests with status 'COMPLETED' (enum)
    const contests = await prisma.contest.findMany({
        where: { status: ContestStatus.CLOSED },
        include: {
            creator: true,
            participants: {
                include: {
                    user: true,
                }
            },
        }
    });

    // For each contest, fetch photos and determine the winner
    const results = [];
    for (const contest of contests) {
        // Fetch all contest photos for this contest
        const contestPhotos = await prisma.contestPhoto.findMany({
            where: { contestId: contest.id },
            include: { photo: true }
        });
        let winner = null;
        if (contestPhotos && contestPhotos.length > 0) {
            let maxVotes = -1;
            for (const contestPhoto of contestPhotos) {
                const voteCount = await prisma.vote.count({ where: { photoId: contestPhoto.id } });
                if (voteCount > maxVotes) {
                    maxVotes = voteCount;
                    winner = contestPhoto.photo;
                }
            }
        }
        results.push({
            ...contest,
            winner,
        });
    }
    return results;
};

// Identify the winner after contest ended

export const identifyWinner = async (contestId:string)=>{
    let winners:ContestParticipant[];

    const participants = await prisma.contestParticipant.findMany({where:{contestId}})

    let participant = await Promise.all(participants.map(async participant => {
        const uploadedPhotos = await prisma.contestPhoto.findMany({where:{contestId,participantId:participant.id}})
        let maxVote = Number.MIN_SAFE_INTEGER
        let maxPhoto:ContestPhoto | null = null

        uploadedPhotos.forEach(async photo => {
            const votes = await prisma.vote.count({where:{contestId,photoId:photo.id}})
            if (votes > maxVote){
                maxVote = votes
                maxPhoto = photo
            }

        })
        const totalVotes = await prisma.vote.count({where:{contestId, photo:{participantId:participant.id}}})
        return {...participant, totalVotes, singlePhotoVote:maxVote, maxPhoto}
    }))

    let top_photographer = participant.sort((a, b) => b.totalVotes - a.totalVotes)[0]
    await awardWinner(top_photographer, contestId, PrizeType.TOP_PHOTOGRAPHER)
    let top_photo = participant.sort((a,b) => b.singlePhotoVote - a.singlePhotoVote)[0]

    await awardWinner(top_photo, contestId, PrizeType.TOP_PHOTO)

}

//Award prize to the winners

export const awardWinner = async (winner:ContestParticipant, contestId:string, prizeType:PrizeType)=>{

    const contestPrize = await prisma.contestPrize.findFirst({where:{contestId, category:prizeType}})

    if(!contestPrize){
        throw new Error("Prize is not available")
    }
    const winnerStore = await prisma.userStore.findFirst({where:{userId:winner.userId}})
    if(!winnerStore){
        throw new Error('Winner store is not available')
    }
    await prisma.userStore.update({where:{id:winnerStore.id}, data:{trades: winnerStore.trades + contestPrize.trades , charges: winnerStore.charges + contestPrize.charges, promotes: winnerStore.promotes + contestPrize.keys}})

}


export const getRemainingPhotos = async (userId:string, contestId:string)=>{
    
}



export const rankingParticipant = async (participantId:string, contestId:string)=>{
    const contest =  await prisma.contest.findUnique({where:{id:contestId}})

    if(!contest){
        return
    }

    const lastParticipant = await prisma.contestParticipant.findFirst({where:{contestId},select:{rank:true}, orderBy:{createdAt:"desc"}});
    
    if (lastParticipant && lastParticipant.rank){
        return lastParticipant.rank + 1
    }

    return 1
}

//Get all uploads of a user

const getContestUploadsByUserId = async (contestId:string, userId:string)=>{
    const userUploads = await prisma.contestPhoto.findMany({where:{contestId:contestId, photo:{userId}}})

    return userUploads
}

//Get all contest uploaded images

export const getContestUploads = async (contestId:string)=>{

    const contestUploads = await prisma.contestPhoto.findMany({where:{contestId}})
    return contestUploads
}   


//Upload photo to a contest, user can upload photo from pforile or can upload directly from computer

export const uploadPhotoToContest = async (contestId:string,userId:string, photoId:string, file:Express.Multer.File)=>{

    const contestParticipant = await prisma.contestParticipant.findFirst({where:{id:contestId, userId:userId},include:{contest:true, _count:{select:{photos:true}}}})

     if(!contestParticipant){
        throw new ApiError(httpstatus.NOT_FOUND, "Sorry, You are not allowed to upload photo in this contest")
    }

    if (contestParticipant._count.photos>= contestParticipant.contest.maxUploads ){
        throw new ApiError(httpstatus.BAD_REQUEST, "maximum photo upload limit has reached!")
    }

    let uploadImage = null;

    if(file){

        let uploadedPhoto = await profileService.uploadUserPhoto(userId, file)

        uploadImage = await prisma.contestPhoto.create({data:{contestId,participantId:userId,photoId:uploadedPhoto.id}})
    }else{
        uploadImage = await prisma.contestPhoto.create({data:{contestId,participantId:userId,photoId}})
    }
   
    

    return uploadImage
}


export const uploadPhotoFromComputer = async (contestId:string, userId:string, file:Express.Multer.File)=>{
    if(!file){
        throw new ApiError(httpstatus.BAD_REQUEST, "file is required to upload")
    }

    const uploadedUserPhoto = await profileService.uploadUserPhoto(userId,file)

    return uploadedUserPhoto
}

const getContestDetails = async (contestId:string)=>{
    
    return (await prisma.contest.findUnique({where:{id:contestId},include:{votes:true, participants:true}}))
}


//Get currently active contest data like total vote and level
const getContestSummary = async (contestId:string, userId:string)=>{

    const contestData = await prisma.contest.findUnique({where:{id:contestId},include:{participants:{where:{userId}}}})

    const participant = contestData?.participants[0]
    if(!participant){
        throw new ApiError(httpstatus.NOT_FOUND, "Participant not found")
    }

    const totalVoteCoaunt = await getParticipantTotalVotes(contestId, participant.id)


    
    return {level:participant?.level, votees:totalVoteCoaunt}

}


const getParticipantTotalVotes =  async(contestId:string, participantId:string)=>{
    
    const votes = await prisma.vote.count({where:{contestId, photo:{participantId}}})
    
    return votes
}

const getParticipantLevelRank = async (contestId:string, participantId:string, participantLevel:YCLevel)=>{

    const participant = await prisma.contestParticipant.findUnique({where:{id:participantId}})
   

    if(!participant){
        return new ApiError(httpstatus.NOT_FOUND, "participant not found")
    }
    const targetVoteCount = await getParticipantTotalVotes(contestId, participant.id)
    const otherParticipantsInSameLevel = await prisma.contestParticipant.findMany({where:{contestId, level:participant.level}})
    const totalInSameLevel = otherParticipantsInSameLevel.length
}

const getParticipantRank = async (contestId:string, participantId:string)=>{

    const partipantsVoteCount = await prisma.contestParticipant
}


const promoteContestPhoto = async (contestId:string, photoId:string, userId:string)=>{
    const contestPhoto = await prisma.contestPhoto.findUnique({where:{id:photoId}})
    
    if(!contestPhoto){
        throw new ApiError(httpstatus.NOT_FOUND, "Contest photo not found")
    }

    if (contestPhoto.promoted){
        throw new ApiError(httpstatus.BAD_REQUEST, "Contest photo is already promoted")
    }

    const contest = await prisma.contest.findUnique({where:{id:contestId, status:ContestStatus.ACTIVE}})

    if (!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "Contest not found")
    }

    if (contest.creatorId !== userId){
        throw new ApiError(httpstatus.FORBIDDEN, "You are not allowed to promote this contest photo")
    }

    const promotionExpiresAt = new Date(Date.now() + 30 * 60 * 1000) //30 minutes from now

    const userStore = await UserStoreService.getStoreData(userId)
    if ( !userStore || userStore.promotes <= 0){
        throw new ApiError(httpstatus.BAD_REQUEST, "You don't have enough promotes")
    }
    await prisma.$transaction(async (tx) => {
        // Decrement the user's promotes count
        await tx.userStore.update({
            where: { userId },
            data: { promotes: { decrement: 1 } }
        });

        // Update the contest photo to mark it as promoted
        await tx.contestPhoto.update({
            where: { id: photoId },
            data: { promoted: true, promotionExpiresAt }
        });
    });


    // Shcedule a job to remove promotion after 30 minutes
    agenda.schedule('in 30 minutes', 'promotion:remove', {
        photoId: photoId
    });

    console.log(`Contest photo with ID ${photoId} has been promoted until ${promotionExpiresAt}`);

    return { message: `Contest photo with ID ${photoId} has been promoted until ${promotionExpiresAt}` };
}

const getContestPhotoToVote = async (contestId:string)=>{
    const contestPhoto = await prisma.contestPhoto.findMany({where:{contestId}})

    let start = 0;
    let length = contestPhoto.length;
    let idx = 1

    while(idx < length){

        let photo = contestPhoto[idx]
        if (photo.promoted && photo.promotionExpiresAt && photo.promotionExpiresAt > new Date()){
            continue
        }
        idx++;
    }

}

export const contestService = {
    createContest,
    updateContest,
    joinContest,
    getContestById,
    getAllContests,
    getContests,
    getContestsByStatus,
    getUpcomingContest,
    getMyCompletedContest,
    getClosedContestsWithWinner,
    getContestUploads,
    uploadPhotoToContest,
    deleteContestByContestId,
    getContestUploadsByUserId,
    promoteContestPhoto,
}