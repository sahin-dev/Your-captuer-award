import prisma from '../../../shared/prisma';
import ApiError from '../../../errors/ApiError';
import httpstatus from 'http-status';
import { fileUploader } from '../../../helpers/fileUploader';
import { Contest, ContestParticipant, ContestStatus, RecurringData } from '../../../prismaClient';
import { IContest } from './contest.interface';




//Create a new contest


export const createContest = async (creatorId: string, body: IContest, banner:Express.Multer.File) => {
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
    // If contest is not recurring, create a normal contest
       let contest = await prisma.contest.create({
            data: contestData
        });

    // agenda.schedule(startDate, 'contest:checkUpcoming', {
    //     contestId: contest.id
    // });

    return contest;
};

const handleRecurringConetst = async ()=>{

}


export const updateContest = async (contestId:string, contestData:Partial<IContest>)=>{

    const updatedContest = await prisma.contest.update({where:{id:contestId}, data:contestData})

    return updatedContest

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
        include: { creator: true, participants: true }
    });

    return contests;
};

export const getAllContests = async () => {
    const contests = await prisma.contest.findMany({    
        include: { creator: true, participants: true }
    });
    return contests;
};


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

//Get contest uploaded images

export const getContestUploads = async (contestId:string)=>{

    const contestUploads = await prisma.contestPhoto.findMany({where:{contestId}})
    return contestUploads
}   

export const uploadPhotoToContest = async (contestId:string,userId:string, photoId:string)=>{
    const contest = prisma.contestParticipant.findFirst({where:{userId}})

    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }
    const uploadImage = prisma.contestPhoto.create({data:{contestId,participantId:userId,photoId}})

    return uploadImage
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
    uploadPhotoToContest
}