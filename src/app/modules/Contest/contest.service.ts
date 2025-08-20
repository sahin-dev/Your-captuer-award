import prisma from '../../../shared/prisma';
import ApiError from '../../../errors/ApiError';
import httpstatus from 'http-status';
import { fileUploader } from '../../../helpers/fileUploader';
import { Contest, ContestParticipant, ContestStatus, RecurringData, RecurringType, Vote, YCLevel } from '../../../prismaClient';
import { IContest } from './contest.interface';
import { contestData } from './contest.type';
import { contestRuleService } from './ContestRules/contestRules.service';
import { addContestPrizes } from './ContestPrizes/contestPrize.service';
import { ContestRule } from './ContestRules/conetstRules.type';
import { ContestPrizeData } from './ContestPrizes/contestPrize.type';
import { profileService } from '../Profile/profile.service';
import agenda from '../Agenda';
import { UserStoreService } from '../User/UserStore/userStore.service';




//Create a new contest


export const createContest = async (creatorId: string, body: contestData, banner:Express.Multer.File) => {
    let bannerUrl = null;

    
    const contestData:any = {
        creatorId,
        title: body.title,
        description: body.description,
    }

    if (banner){
        bannerUrl = (await fileUploader.uploadToDigitalOcean(banner)).Location;
        contestData.banner = bannerUrl
    }
    
    // Validate start and end dates
    const startDate = new Date(body.startDate);
    const endDate = new Date(body.endDate);
    const currentDate = new Date();
    
    //Check contest start date and end date
         //that start date is not after end date and start date is in the future
    if (startDate >= endDate) {
        throw new ApiError(httpstatus.BAD_REQUEST, 'Start date must be before end date');
    }
    // If start date is in the past, throw an error
    // if (currentDate> startDate){
    //     throw new ApiError(httpstatus.BAD_REQUEST, 'Start date must be in the future');
    // }


    // create separate contestData Object to pass prisma to ctreate contest
    
    // If contest is money contest, add money contest data like max prize and min prize for the paerticipants
    // If isMoneyContest is not provided, it will default to false

     if (body.isMoneyContest) {
        contestData.isMoneyContest = true;   
        contestData.maxPrize = body.maxPrize || 0;
        contestData.minPrize = body.minPrize || 0;
    }

    //If contest is recurring, Add recurring data to the contest object
    // By default every object is recurring false, so if conetest is not recurring, it will not have recurring data
    contestData.startDate = startDate
    contestData.endDate = endDate

    if (body.recurring) {

        const recurringData:RecurringData = {
            recurringType: body.recurringType!,
            previousOccurrence: new Date(),
            nextOccurrence: new Date(body.startDate),
            duration:new Date(body.endDate).getTime() - new Date(body.startDate).getTime()
        }
        contestData.recurringData = recurringData;

        console.log(contestData)

        let recurringContest = await prisma.recurringContest.create({
            data: contestData
        });
        return recurringContest;
    }

    // Create a normal contest entry for all type of contest
       let contest = await prisma.contest.create({
            data: contestData
        });

   
    if(body.rules){
        const rules:ContestRule[] = JSON.parse(body.rules)
        
        await contestRuleService.addContestRules(contest.id, rules)
    }
   
    if(body.prizes){
         const prizes:ContestPrizeData[] = JSON.parse(body.prizes)
        await addContestPrizes(contest.id, prizes)
    }

    //If contest is recurring , save recurring data separately
    if(body.recurring){
        handleRecurringContest(contest.id, body)
    }

    return contest;
};


//manage recurring contest separately

const handleRecurringContest  =  async (contestId:string,body:contestData)=>{
    if (body.recurring) {

        const recurringData:RecurringData = {
            recurringType: body.recurringType!,
            previousOccurrence: new Date(body.startDate),
            nextOccurrence: calculateNextOccurance(body.startDate, body.recurringType),
            duration:new Date(body.endDate).getTime() - new Date(body.startDate).getTime()
        }
      

        let recurringContest = await prisma.recurringContestData.create({
            data: {
                lastRunAt:recurringData.previousOccurrence,
                nextRunAt:recurringData.nextOccurrence,
                contestId,
                recurringType:recurringData.recurringType

            }
        });
        return recurringContest;
    }
}


//Calculate next occurance time of a recurring contest based on recurring type
const calculateNextOccurance = (date:string, type:RecurringType = 'DAILY'):Date=>{

    let result;
    
    switch(type){
        case RecurringType.DAILY:
            result = new Date(date)
            break
        case RecurringType.WEEKLY:
            result = new Date(date)
            break
        case RecurringType.MONTHLY:
            result = new Date(date)
            break
        default:
            result = new Date(date)

    }

    return result
    
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

    if (!contest || contest.status != ContestStatus.OPEN){
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

    return winners!

}

//Award prize to the winners

export const awardWinners = async (winners:ContestParticipant[])=>{

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