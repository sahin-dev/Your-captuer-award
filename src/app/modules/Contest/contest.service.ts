import prisma from '../../../shared/prisma';
import ApiError from '../../../errors/ApiError';
import httpstatus from 'http-status';
import { fileUploader } from '../../../helpers/fileUploader';
import { ContestMode, ContestParticipant, ContestPhoto, ContestStatus, PrizeType, YCLevel } from '../../../prismaClient';
import { IContest } from './contest.interface';
import { contestData } from './contest.type';
import { contestRuleService } from './ContestRules/contestRules.service';
import { addContestPrizes, getContestPrizes } from './ContestPrizes/contestPrize.service';
import { ContestRule } from './ContestRules/contestRules.type';
import { ContestPrize } from './ContestPrizes/contestPrize.type';
import { profileService } from '../Profile/profile.service';
import agenda from '../Agenda';
import { validateContestDate } from '../../../helpers/validateDate';
import { userStoreService } from '../User/UserStore/userStore.service';
import { voteService } from '../Vote/vote.service';
import { use } from 'passport';
import { achievementService } from '../Achievements/achievement.service';





//This approach is not final yet. Currently in testing phase
/*

const createContestBuilderApproach = async (creatorId:string, body:contestData, banner:Express.Multer.File)=> {

    let contestBuilder: SimpleContestBuilder | RecurringContestBuilder | null = null

    if(body.recurring){
        contestBuilder  = ContestBuilderFactory.create("recurring", creatorId) as RecurringContestBuilder
        
        contestBuilder.recurrence(body.recurringType || RecurringType.DAILY)
    }else{
        contestBuilder = ContestBuilderFactory.create("normal", creatorId) as SimpleContestBuilder
    }

    let bannerUrl = banner? (await fileUploader.uploadToDigitalOcean(banner)).Location: null

     contestBuilder
        .title(body.title)
        .description(body.description)
        .banner(bannerUrl)
        .levelRequirements(body.level_requirements)
        .dates(body.startDate, body.endDate)


    if (body.isMoneyContest) {


        if(!body.minPrize || !body.maxPrize || (body.minPrize > body.maxPrize)){
            throw new ApiError(httpstatus.BAD_REQUEST, "Contest prize data is invalid")
        }  
        //Add contest prize data in builder
        contestBuilder.moneyContest(body.minPrize, body.maxPrize)
    }
    if(body.recurring){
        // return await prisma.recurringContest.create({data:contestBuilder.build() as RecurringContest})
    }

    return await prisma.contest.create({data:contestBuilder.build()})

}

*/

//Create a new contest
//mode: ContestMode

const createContest = async (creatorId: string, body: contestData, banner:Express.Multer.File) => {

    
    if(!validateContestDate(body.startDate, body.endDate)){
        throw new ApiError(httpstatus.BAD_REQUEST, "Start date cannot be after end date");
    }

    //If contest is recurring , save recurring data separately
    if(body.recurring){
       return createRecurringContest(creatorId, body, banner)
    }


    let bannerUrl = banner? (await fileUploader.uploadToDigitalOcean(banner)).Location: null

    let levels = body.level_requirements.map(levels => parseInt(levels))
  
    const contestData:any = {
        creatorId,
        title: body.title,
        description: body.description,
        status: ContestStatus.UPCOMING,
        level_requirements:levels,
        maxUploads: Number(body.maxUploads),
        ...(bannerUrl && {banner:bannerUrl})
    }
    // If contest is money contest, add money contest data like max prize and min prize for the paerticipants
    // If isMoneyContest is not provided, it will default to false

     if (body.isMoneyContest) {

        if((!body.minPrize) || (!body.maxPrize )|| (Number(body.minPrize) > Number(body.maxPrize))){
            throw new ApiError(httpstatus.BAD_REQUEST, "Maximum price must be greater than minimum price.")
        } 

        contestData.isMoneyContest = true; 
        contestData.maxPrize = Number(body.maxPrize) || 0;
        contestData.minPrize = Number(body.minPrize) || 0;
    }

    //If contest is recurring, Add recurring data to the contest object
    // By default every object is recurring false, so if conetest is not recurring, it will not have recurring data
    contestData.startDate = new Date(body.startDate) < new Date(Date.now()) ? new Date(Date.now()) : new Date(body.startDate)
    contestData.endDate = new Date(body.endDate)

    // Create a normal contest entry for all type of contest
       let contest = await prisma.contest.create({
            data: contestData
        });

        let createdRules, createdPrizes

    if(body.rules){
        const rules:ContestRule[] = body.rules
    
        createdRules = await contestRuleService.addContestRules(contest.id, rules)
    }
   
    if(body.prizes){
         const prizes:ContestPrize[] = body.prizes
        createdPrizes = await addContestPrizes(contest.id, prizes)
    }

    const updatedContest = await prisma.contest.update({where:{id:contest.id}, data:{rules:body.rules, prizes:body.prizes}})

    return {contest, rules:updatedContest.rules, prizes:updatedContest.prizes};
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

    contestData.rules = JSON.stringify(body.rules)
    contestData.prizes = JSON.stringify(body.prizes)
   
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

    const recurringContest = await prisma.recurringContest.create({data:contestData})

    return recurringContest

      
}




const updateContest = async (contestId:string, contestData:Partial<IContest>)=>{

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

const joinContest = async (userId:string,contestId:string)=>{
    const contest = await prisma.contest.findUnique({where:{id:contestId}})

    if (!contest || contest.status != ContestStatus.ACTIVE){
        throw new ApiError(httpstatus.NOT_FOUND, "Contest is not available to participate")
    }
    
    if (contest.mode === ContestMode.TEAM){
        const team = await prisma.teamMember.findFirst({where:{member:{id:userId}}})
        if(!team){
            throw new ApiError(httpstatus.NOT_FOUND, 'Team not found')
        }
        const teamContest = await prisma.teamParticipation.findUnique({where:{teamId_contestId:{teamId:team.id, contestId}}})
       
    }

    const participant = await prisma.contestParticipant.create({data:{contestId,userId}})
    
    if (participant){
        console.log("User has joined the contest")
    }

    return {contest_id:contestId, participant_id:participant.id}

}


const getContestByUserId = async ( userId:string, contestId: string) => {
    const contest = await prisma.contest.findUnique({
        where: { id: contestId },
        include: { creator: {omit:{password:true, accessToken:true}}}
    });
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }

    const rules = await contestRuleService.getContestRules(contestId)
    const prizes = await getContestPrizes(contestId)
    const totalVotes = await voteService.getContestTotalVotes(contestId)

    if(contest.status === ContestStatus.CLOSED){

        const winners = await achievementService.getAchievements(contestId)

        console.log(winners)
        console.log(contest)

        return {...contest, prizes, totalVotes, winners};
    }

    if( (await isContestParticipantExist(userId, contestId)) && (contest.status === ContestStatus.ACTIVE)){
        const contestPhotoCount =  await prisma.contestPhoto.count({where:{contestId, photo:{userId}}})

        return {...contest, joined:true,rules, prizes, totalVotes, uploadCount:contestPhotoCount}
    }


    return {...contest, rules, prizes, totalVotes, joined:false};
}


//get the contest by it's id

const getContestById = async ( contestId: string) => {
    const contest = await prisma.contest.findUnique({
        where: { id: contestId },
        include: { creator: {omit:{password:true, accessToken:true}}}
    });
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }

    const rules = await contestRuleService.getContestRules(contestId)
    const prizes = await getContestPrizes(contestId)
    const totalVotes = await voteService.getContestTotalVotes(contestId)

    if(contest.status === ContestStatus.CLOSED){

        const winners = await achievementService.getAchievements(contestId)

        console.log(winners)
        console.log(contest)

        return {...contest, prizes, totalVotes, winners};
    }


    return {...contest, rules, prizes, totalVotes};
}



//Return all the contests
const getAllContests = async () => {
    const contests = await prisma.contest.findMany({    
        include: { creator: true}
    });
    return contests;
};

//Search contest by contest status
const getContestsByStatus = async (userId:string,status: ContestStatus) => {

    if(status === ContestStatus.COMPLETED){

        const completedContests =  await getMyCompletedContest(userId)

        const mappedContest = await Promise.all(completedContests.map(async contest => {
            // const achievements = await achievementService.getMyAchievementsByContest(userId, contest.id)
            const rank = (await getParticipantLevelData(contest.id, userId)).currentLevel
        
            return {...contest, rank}
        }))

       
        return mappedContest
    }

   

    // if(status === ContestStatus.CLOSED){
    //     const closedContests = await prisma.contest.findMany({where:{participants:{none:{userId}}}})

    //     closedContests.map( async contest => {
    //         const winners = await getContestWinners(contest.id)

    //         return {...contest, winners}
    //     })

        
    // }

    if(status === ContestStatus.ACTIVE){

        const contests = await prisma.contest.findMany({
            where:{status, participants:{none:{userId}}},
            include: { creator: {select:{id:true, avatar:true,fullName:true,cover:true, firstName:true, lastName:true}}}
        });

        const contestDetails = contests.map(async contest => {
            const details = getContestById(contest.id)

            return details

        })
        return await Promise.all(contestDetails);
    }

    if(status === ContestStatus.CLOSED){

        const contests = await prisma.contest.findMany({
            where:{status, participants:{none:{userId}}},
            include: { creator: {select:{id:true, avatar:true,fullName:true,cover:true, firstName:true, lastName:true}}}
        });

        const contestDetails = contests.map(async contest => {
            const details = getContestById(contest.id)

            return details

        })
        return await Promise.all(contestDetails);
    }

    
    const contests = await prisma.contest.findMany({
        where:{status},
        include: { creator: {select:{id:true, avatar:true,fullName:true,cover:true, firstName:true, lastName:true}}}
    });

    const contestDetails = contests.map(async contest => {
        const details = getContestById(contest.id)

        return details

    })

    


    return await Promise.all(contestDetails);
};


//Get all uploads of a user

const getContestUploadsByUserId = async (contestId:string, userId:string)=>{
    const userUploads = await prisma.contestPhoto.findMany({where:{contestId:contestId, photo:{userId}}, include:{photo:{select:{url:true}}}})
   const mappedPhotos  = userUploads.map(upload => {

    const {photo, ...rest} = upload

    return {...rest,url:upload.photo.url}
   })

    return mappedPhotos
}


const deleteContestUploadById = async (contestId:string, userId:string, photoId:string)=>{  

    const contestUpload = await prisma.contestPhoto.findUnique({where:{id:photoId, contestId}, include:{participant:true}})
    if(!contestUpload){
        throw new ApiError(httpstatus.NOT_FOUND, "Contest upload not found")
    }
    if (contestUpload.participant.userId !== userId){
        throw new ApiError(httpstatus.FORBIDDEN, "You are not allowed to delete this contest upload")
    }
    await prisma.contestPhoto.delete({where:{id:photoId}})
    return "Contest upload deleted successfully"    
 }




// Get all the contests
// This will be used to display all the contests in the contest page

const getMyActiveContests = async (userId:string) => {

    

    const contests = await prisma.contest.findMany({
        where:{status:ContestStatus.ACTIVE, participants:{some:{userId}}},
        include: { creator: {select:{id:true, avatar:true,fullName:true,cover:true, firstName:true, lastName:true}},}
    });

    const contestDetails = contests.map (async (contest) => {
        const levelData = await getParticipantLevelData(contest.id, userId)
        const photos = await getContestUploadsByUserId(contest.id,userId)
        
        
        return {...contest, level_data:levelData, photos}
    })

    return await Promise.all(contestDetails);
};

const getUpcomingContest = async () => {
    const contests = await prisma.contest.findMany({
        where: { status: ContestStatus.UPCOMING },
        include: { creator: {select:{id:true, avatar:true,fullName:true,cover:true, firstName:true, lastName:true}}}
    });
    return contests;
};

//Get my contests which are completed

const getMyCompletedContest = async (userId:string) => {

    if (!userId){
        throw new ApiError(httpstatus.BAD_REQUEST, "User id is not provided")
    }
    const user = await prisma.user.findUnique({where:{id:userId}})

    if (!user){
        throw new ApiError(httpstatus.NOT_FOUND, "User not found")
    }

    const myParticipatedContest = await prisma.contest.findMany({where:{status:ContestStatus.CLOSED, participants:{some:{userId}}}})

    const mappetdCompletedContest =await Promise.all( myParticipatedContest.map(async contest => {
        const details = await getContestById(contest.id)
        const photos = await getContestUploads(userId, contest.id)
        const achievements = await achievementService.getContestAchievementsByUser(userId)
        const totalVotes =  photos.reduce((pre, photo) => photo.voteCount + pre, 0)
        return {...details, photos, totalVotes, achievements}
    }))

 

    // const myCompletedContests = await prisma.contest.findMany({where:{status:ContestStatus.COMPLETED, participants:{some:{userId}}},include:{_count:{select:{votes:true}}}})
    
    return mappetdCompletedContest
}



const getContestWinners = async (contestId:string) => {
    const contest = await prisma.contest.findUnique({where:{id:contestId, status:ContestStatus.CLOSED}})

    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }

    const winners = await prisma.contestAchievement.findMany({where:{contestId:contest.id}, include:{participant:{include:{user:{select:{avatar:true, fullName:true, firstName:true, lastName:true}}}}}})

    return winners
}


// Fetch completed contest details with winner
const getClosedContestsWithWinner = async () => {
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

const identifyWinner = async (contestId:string)=>{
    console.log('Identifying winners....')

    const contest = await getContestById(contestId)
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }

    if(contest.mode === ContestMode.TEAM){
        return await identifyTeamWinner(contestId)
    }
    let winners:ContestParticipant[];

    const participants = await getContestParticipants(contestId)

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


const awardTeams = async (contestId:string) => {
    const teamMatches = await prisma.teamMatch.findMany({where:{contestId}})

    if(!teamMatches || teamMatches.length <= 0){
        console.log("No team match found for this contest")
        return
    }

    teamMatches.forEach(async teamMatch => {
       await awardTeam(teamMatch.id)
    }) 
}

const awardTeam = async (matchId:string) => {
    const teamMatch = await prisma.teamMatch.findUnique({where:{id:matchId}})

    if(!teamMatch){
        console.log("match not found")
        return
    }

    const team1Votes = await voteService.getTeamTotalVotes(teamMatch.contestId, teamMatch.team1Id)
    const team2Votes = await voteService.getTeamTotalVotes(teamMatch.contestId, teamMatch.team2Id)

    await prisma.team.update({where:{id:teamMatch.team1Id}, data:{score:{increment:team1Votes}, }})
    await prisma.team.update({where:{id:teamMatch.team2Id}, data:{score:{increment:team2Votes}}})

    if(team1Votes > team2Votes){
        await prisma.team.update({where:{id:teamMatch.team1Id}, data:{win:{increment:1}}})
        await prisma.team.update({where:{id:teamMatch.team2Id}, data:{ lost:{increment:1}}})
    }else if(team1Votes === team2Votes) {
        await prisma.team.update({where:{id:teamMatch.team1Id}, data:{ win:{increment:1}}})
        await prisma.team.update({where:{id:teamMatch.team2Id}, data:{ win:{increment:1}}})
    }else {
        await prisma.team.update({where:{id:teamMatch.team1Id}, data:{ lost:{increment:1}}})
        await prisma.team.update({where:{id:teamMatch.team2Id}, data:{ win:{increment:1}}})       
    }

}

const getTeamParticipant = async (contestId:string, teamId:string) => {
    const participants = await prisma.contestParticipant.findMany({where:{user:{joinedTeam:{id:teamId}}, contestId, }})

    return participants
}


const identifyTopPhoto = async (contestId:string)=>{
    const contest = await prisma.contest.findUnique({where:{id:contestId}})

    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }

    const contestPhoto = await prisma.vote.groupBy({by:['photoId'], where:{contestId}, _count:{photoId:true},orderBy:{_count:{photoId:'desc'}}, take:1})
}

const identifyTeamWinner = async (contestId:string)=>{
    const contest = await getContestById(contestId)
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }

    if(contest.mode !== ContestMode.TEAM){
        throw new ApiError(httpstatus.BAD_REQUEST, "contest is not for team")
    }

    const participants = await getContestParticipants(contestId)

    let participantVote = await Promise.all(participants.map( async participant => {
        let votes = await prisma.vote.count({where:{contestId, photo:{participant:{id:participant.id}}}})

        return {id:participant.id, voteCount:votes}
    }))
}

//Award prize to the winners

const awardWinner = async (winner:ContestParticipant, contestId:string, prizeType:PrizeType)=>{

    const contestPrize = await prisma.contestPrize.findFirst({where:{contestId, category:prizeType}})

    if(!contestPrize){
        throw new Error("Prize is not available")
    }

    const winnerStore = await prisma.userStore.findFirst({where:{userId:winner.userId as string}})
    if(!winnerStore){
        throw new Error('Winner store is not available')
    }

    await prisma.userStore.update({where:{id:winnerStore.id}, data:{trades: winnerStore.trades + contestPrize.trades , charges: winnerStore.charges + contestPrize.charges, promotes: winnerStore.promotes + contestPrize.keys}})

}

const getRemainingPhotos = async (userId:string, contestId:string)=>{

    const contest = await prisma.contest.findUnique({where:{id:contestId}})
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "conetest not found")
    }
    
    const contestUploads = await prisma.contestPhoto.findMany({where:{contestId, participant:{userId}}})
    const userPhotos = await prisma.userPhoto.findMany({where:{userId, contestUpload:{none:{contestId}}}, select:{id:true, url:true}})
    
    return userPhotos
}

// const rankingParticipant = async (participantId:string, contestId:string)=>{
//     const contest =  await prisma.contest.findUnique({where:{id:contestId}})

//     if(!contest){
//         return
//     }

//     const lastParticipant = await prisma.contestParticipant.findFirst({where:{contestId},select:{rank:true}, orderBy:{createdAt:"desc"}});
    
//     if (lastParticipant && lastParticipant.rank){
//         return lastParticipant.rank + 1
//     }

//     return 1
// }


const isContestParticipantExist = async (userId:string, contestId:string)=>{
    const participantData =  await prisma.contestParticipant.findUnique({where:{contestId_userId:{contestId,userId}}})

    return participantData? participantData: false;
}

const getContestUploadsToVote = async (userId:string, contestId:string)=> {
     const contest = await prisma.contest.findUnique({where:{id:contestId}})
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }
    const participant = await isContestParticipantExist(userId, contestId)

    if( !participant){
        throw new ApiError(httpstatus.NOT_FOUND, "user is not in the participation list")
    }


    const contestUploads = await prisma.contestPhoto.findMany({where:{contestId, participant:{NOT:{userId}}, votes:{none:{providerId:participant.userId}}}, include:{photo:{select:{id:true, url:true}}}})

    if(contest.status === ContestStatus.ACTIVE){
        contestUploads.sort((a: ContestPhoto, b: ContestPhoto) => {
            
            if (a.promoted && !b.promoted) return -1;
            if (!a.promoted && b.promoted) return 1;
            
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        })
    }
    return contestUploads.map(upload => ({url:upload.photo.url, id:upload.id}))
}


//Get completed contest uploaded images

const getCompletedContestUploads = async (userId:string,contestId:string)=>{

    const contest = await prisma.contest.findUnique({where:{id:contestId}})
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }
    const participant = await isContestParticipantExist(userId, contestId)

    if( !participant){
        throw new ApiError(httpstatus.NOT_FOUND, "user is not in the participation list")
    }


    const contestUploads = await prisma.contestPhoto.findMany({where:{contestId, votes:{none:{providerId:participant.userId}}}, include:{photo:{select:{id:true, url:true}}}})

    if(contest.status === ContestStatus.ACTIVE){
        contestUploads.sort((a: ContestPhoto, b: ContestPhoto) => {
            
            if (a.promoted && !b.promoted) return -1;
            if (!a.promoted && b.promoted) return 1;
            
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        })
    }
    return contestUploads.map(upload => ({url:upload.photo.url, id:upload.id}))
}   

//Get all contest uploaded images

const getContestUploads = async (userId:string,contestId:string)=>{

    const contest = await prisma.contest.findUnique({where:{id:contestId}})
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }
    const participant = await isContestParticipantExist(userId, contestId)

    if( !participant){
        throw new ApiError(httpstatus.NOT_FOUND, "user is not in the participation list")
    }


    const contestUploads = await prisma.contestPhoto.findMany({where:{contestId, votes:{none:{providerId:participant.userId}}}, include:{photo:{select:{id:true, url:true}}}})

    if(contest.status === ContestStatus.ACTIVE){
        contestUploads.sort((a: ContestPhoto, b: ContestPhoto) => {
            
            if (a.promoted && !b.promoted) return -1;
            if (!a.promoted && b.promoted) return 1;
            
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        })
    }
    const uploads =  await Promise.all(contestUploads.map(async upload => {
        const voteCount = await prisma.vote.count({where:{contestId, photoId:upload.id}})

        return {id:upload.photo.id, url:upload.photo.url, voteCount}
    }))

    return uploads
}   




//Upload photo to a contest, user can upload photo from pforile or can upload directly from computer

const uploadPhotoToContest = async (contestId:string,userId:string, photoIds:string[], file:Express.Multer.File)=>{

    if(!contestId){
        throw new ApiError(httpstatus.BAD_REQUEST, "contest id is required")
    }
    const contest = await prisma.contest.findUnique({where:{id:contestId, status:ContestStatus.ACTIVE}})

    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found or contest closed")
    }

    let user = await prisma.user.findUnique({where:{id:userId}})

    if(!user){
        throw new ApiError(httpstatus.NOT_FOUND, "user not found")
    }

    let contestParticipant:ContestParticipant | null = await prisma.contestParticipant.findUnique({where:{contestId_userId:{contestId,userId}}})


     if(!contestParticipant){
        contestParticipant = await prisma.contestParticipant.create({data:{contestId:contest.id,userId:userId}, include:{contest:true, _count:{select:{photos:true}}}})
    }

    const contestPhotosCount = await prisma.contestPhoto.count({where:{contestId:contest.id, participantId:contestParticipant.id}})

    if (contestPhotosCount >= contest.maxUploads) {
        throw new ApiError(httpstatus.BAD_REQUEST, "maximum photo upload limit has reached!")
    }

    let uploadImage:ContestPhoto | null = null;
    let images:Array<ContestPhoto> = []

    if(file){

        let uploadedPhoto = await profileService.uploadUserPhoto(userId, file)

        uploadImage = await prisma.contestPhoto.create({data:{contestId,participantId:contestParticipant.id,photoId:uploadedPhoto.id}})

    }else{
        if(!photoIds || photoIds.length <= 0){
            throw new ApiError(httpstatus.BAD_REQUEST,"photoIds is empty or missing")
        }

        const alreadyUploadedPhotosCount = await prisma.contestPhoto.count({where:{contestId,photo:{userId}}})

        if((photoIds.length > contest.maxUploads) || (photoIds.length > (contest.maxUploads - alreadyUploadedPhotosCount))){
            throw new ApiError(httpstatus.BAD_REQUEST, `maximum upload limit exceeded`)
        }

        photoIds.forEach(async photoId => {
            const userPhoto = await prisma.userPhoto.findUnique({where:{id:photoId}})
            if(userPhoto){
                uploadImage = await prisma.contestPhoto.create({data:{contestId,participantId:contestParticipant.id,photoId:userPhoto.id}, include:{photo:true} })
                images.push(uploadImage)
                if(uploadImage){
                    agenda.every("1 minute", "exposure:watcher",{contestPhotoId:uploadImage.id})
    }
                }
        })

 
    }
    //add watcher for exposure bonus

   

    return images
}


// const uploadPhotoFromComputer = async (contestId:string, userId:string, file:Express.Multer.File)=>{
//     if(!file){
//         throw new ApiError(httpstatus.BAD_REQUEST, "file is required to upload")
//     }

//     const uploadedUserPhoto = await profileService.uploadUserPhoto(userId,file)

//     return uploadedUserPhoto
// }

// const getContestDetails = async (contestId:string)=>{
    
//     return (await prisma.contest.findUnique({where:{id:contestId},include:{votes:true, participants:true}}))
// }


//Get currently active contest data like total vote and level
// const getContestSummary = async (contestId:string, userId:string)=>{

//     const contestData = await prisma.contest.findUnique({where:{id:contestId},include:{participants:{where:{userId}}}})

//     const participant = contestData?.participants[0]
//     if(!participant){
//         throw new ApiError(httpstatus.NOT_FOUND, "Participant not found")
//     }

//     const totalVoteCount = await getParticipantTotalVotes(contestId, participant.id)

//     return {level:participant?.level, votes:totalVoteCount}

// }


const getParticipantTotalVotes =  async(contestId:string, participantId:string)=>{

    // const contestPhotos = await prisma.contestPhoto.findMany({where:{contestId, participantId}})
    // contestPhotos.forEach(async photo => {
    //     const vote = await  voteService.getVoteCount(photo.id)
    // })
    
    const votes = await prisma.vote.count({where:{contestId, photo:{participant:{id:participantId}}}})
    
    return votes
}

// const getParticipantLevelRank = async (contestId:string, participantId:string, participantLevel:YCLevel)=>{

//     const participant = await prisma.contestParticipant.findUnique({where:{id:participantId}})
   

//     if(!participant){
//         return new ApiError(httpstatus.NOT_FOUND, "participant not found")
//     }
//     const targetVoteCount = await getParticipantTotalVotes(contestId, participant.id)
//     const otherParticipantsInSameLevel = await prisma.contestParticipant.findMany({where:{contestId, level:participant.level}})
//     const totalInSameLevel = otherParticipantsInSameLevel.length
// }


const getYCLevelByOrder = ()=>{

    return [
       
        YCLevel.AMATEUR,
        YCLevel.SUPERIOR,
        YCLevel.SUPREME,
        YCLevel.TALENTED,
        YCLevel.TOP_NOTCH
    ]
    
}

const getContestLevelRequirements = async (contestId:string)=>{
    const contest = await prisma.contest.findUnique({where:{id:contestId}})
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }
    let ycLevels = getYCLevelByOrder()

    let levels = contest.level_requirements.map((level, idx) => ({levelName:ycLevels[idx], point: level}))

    return levels
}

const getParticipantLevelData = async (contestId:string,userId:string)=>{

    const participant = await prisma.contestParticipant.findFirst({where:{userId, contestId,}})

    if (!participant){
        throw new Error("Participant not found")
    }

    const totalVotes = await getParticipantTotalVotes(contestId, participant.id)
    const contestLevelRequirement = await getContestLevelRequirements(contestId)
    let currentLevel = YCLevel.NEW.toString()
    let currentIdx = -1
    
    contestLevelRequirement.forEach( (contestLevel,idx) => {
        if(contestLevel.point <= totalVotes){
            currentLevel = contestLevel.levelName.toString()
            currentIdx = idx
        }else {
            return
        }
    })
    

    return {currentLevel, totalVotes, nextLevel:contestLevelRequirement[currentIdx+1], exposure_bonus: participant.exposure_bonus}

}

const promoteContestPhoto = async (contestId:string, photoId:string, userId:string)=>{

     const contest = await prisma.contest.findUnique({where:{id:contestId, status:ContestStatus.ACTIVE}})

    if (!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "Contest not found")
    }
    const contestPhoto = await prisma.contestPhoto.findUnique({where:{id:photoId},include:{participant:true}})
    
    if(!contestPhoto){
        throw new ApiError(httpstatus.NOT_FOUND, "Contest photo not found")
    }

    if (contestPhoto.promoted){
        throw new ApiError(httpstatus.BAD_REQUEST, "Contest photo is already promoted")
    }

   

    if (contestPhoto.participant.userId !== userId){
        throw new ApiError(httpstatus.FORBIDDEN, "You are not allowed to promote this contest photo")
    }

    const promotionExpiresAt = new Date(Date.now() + 30 * 60 * 1000) //30 minutes from now
    const userStore = await userStoreService.getStoreData(userId)

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

// const getContestPhotoToVote = async (contestId:string)=>{
//     const contestPhoto = await prisma.contestPhoto.findMany({where:{contestId}})

//     let start = 0;
//     let length = contestPhoto.length;
//     let idx = 1

//     while(idx < length){

//         let photo = contestPhoto[idx]
//         if (photo.promoted && photo.promotionExpiresAt && photo.promotionExpiresAt > new Date()){
//             continue
//         }
//         idx++;
//     }

// }


const getContestParticipants = async (contestId:string)=>{
    const contest = await prisma.contest.findUnique({where:{id:contestId}})

    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "Contest not found")
    }

    return await prisma.contestParticipant.findMany({where:{contestId}})

}


const identifyContestTopPhoto = async (contestId:string)=>{

    const contest = await prisma.contest.findUnique({where:{id:contestId}})
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }

    const contestVote = await prisma.contestPhoto.count({where:{contestId}})

}


const tradePhoto = async (userId:string,contestId:string, contestPhotoId:string, photoId:string, file:Express.Multer.File) => {
    const contestPhoto = await prisma.contestPhoto.findUnique({where:{id:contestPhotoId, contestId}, include:{photo:true}})
    

    if(!contestPhoto){
        throw new ApiError(httpstatus.NOT_FOUND, "contest photo not found")
    }

    const userStore = await userStoreService.getStoreData(userId)
    if (!userStore || userStore.trades <= 0 ){
        throw new ApiError(httpstatus.BAD_REQUEST, "you does not have enough trade")
    }
    const vote = await voteService.getVoteCount(contestPhoto.photo.id)
    await prisma.contestPhoto.delete({where:{id:contestPhoto.id}})

    const uploadedPhoto = await uploadPhotoToContest(contestId,userId,[photoId], file)
    //decrease trade by 1
    await userStoreService.updateStoreData(userId,{trades:-1})

    return await prisma.contestPhoto.update({where:{id:uploadedPhoto[0].id}, data:{initialVotes:vote}})
    
}

const chargePhoto = async (userId:string, contestId:string, contestPhotoId:string) => {
    const contestPhoto = await prisma.contestPhoto.findUnique({where:{id:contestPhotoId},include:{participant:true}})

    if(!contestPhoto){
        throw new ApiError(httpstatus.NOT_FOUND, "contest photo not found")
    }

    const userStore = await userStoreService.getStoreData(userId)

    if(!userStore || userStore.charges <= 0){
        throw new ApiError(httpstatus.NOT_FOUND, "you does not have enough charge")
    }
    const participant = await prisma.contestParticipant.findUnique({where:{id:contestPhoto.participant.id}})
    if(!participant){
        throw new ApiError(httpstatus.NOT_FOUND, "participant not found")
    }

    const newContestPhoto = await prisma.contestParticipant.update({where:{id:participant.id}, data:{exposure_bonus:100}})

   
    agenda.every("1 minute", "exposure:watcher",{contestPhotoId:contestPhoto.id})
    
    await userStoreService.updateStoreData(userId, {charges:-1})
    return newContestPhoto
}

const getContestPhotosSortedByVote = async (contestId:string, page?:number, limit?:number) => {

    const contest = await prisma.contest.findUnique({where:{id:contestId}})

    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, 'Contest not found')
    }
    const contestUploads = await prisma.contestPhoto.findMany({where:{contestId}, include:{participant:{include:{user:{select:{id:true, avatar:true, country:true, fullName:true}}}}, photo:{select:{id:true, url:true}}}})  

    const uploadsWithVotes = await Promise.all(contestUploads.map( async upload => {
        const voteCount = await voteService.getVoteCount(upload.id)

        const user = upload.participant.user
        const userPhoto = upload.photo
        return {id:upload.id, voteCount, user,userPhoto:userPhoto}
    }))

    const sortedUploads = uploadsWithVotes.sort((a,b) => b.voteCount - a.voteCount)
    return sortedUploads
}

const getContestTopPhotographers =  async (contestId:string, page?:number, limit?:number)=>{

    const contest = await prisma.contest.findUnique({where:{id:contestId}})

    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }


    const contestParticipants = await prisma.contestParticipant.findMany({where:{contestId},take:limit,
         include:{photos:{select:{photo:{select:{id:true, url:true}}, id:true}}, user:{select:{id:true, avatar:true, fullName:true}}}})

    const participantWithVote =  await Promise.all(contestParticipants.map(async  participant => {
        const photos = participant.photos
        const totalVotes = await voteService.totalVotesOfParticipant(participant.id, contestId)

        const user = participant.user
        const mappedPhotos = await Promise.all(photos.map(async photo => {
            const voteCount = await voteService.getVoteCount(photo.id)

            return {...photo, voteCount}
        }))

        return {...participant,user,photos:mappedPhotos, totalVotes}
    }))

    const sortedParticipant = participantWithVote.sort((a,b) => b.totalVotes - a.totalVotes)
    const contesttotalVotes = participantWithVote.reduce( (prev, curr) => prev + curr.totalVotes, 0)


    return {contestTotalVotes:contesttotalVotes, participants: sortedParticipant}

}




export const contestService = {
    createContest,
    updateContest,
    joinContest,
    getContestById,
    getAllContests,
    getMyActiveContests,
    getContestsByStatus,
    getUpcomingContest,
    getMyCompletedContest,
    getClosedContestsWithWinner,
    getContestUploads,
    uploadPhotoToContest,
    deleteContestByContestId,
    getContestUploadsByUserId,
    promoteContestPhoto,
    getParticipantLevelData,
    identifyWinner,
    getContestWinners,
    getRemainingPhotos,
    awardTeams,
    tradePhoto,
    chargePhoto,
    deleteContestUploadById,
    getContestPhotosSortedByVote,
    getContestTopPhotographers,
    getContestByUserId,
    getContestUploadsToVote

}