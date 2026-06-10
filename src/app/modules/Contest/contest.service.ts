import prisma from '../../../shared/prisma';
import ApiError from '../../../errors/ApiError';
import httpstatus from 'http-status';
import { fileUploader } from '../../../helpers/fileUploader';
import { paginationHelper } from '../../../helpers/paginationHelper';
import { ContestMode, ContestParticipant, ContestParticipantStatus, ContestPhoto, ContestPlan, ContestStatus, PrizeType, SubscriptionPlanEnum, SubscriptionStatus, YCLevel } from '../../../prismaClient';
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
import { teamService } from '../Team/team.service';





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

    let bannerUrl = banner? (await fileUploader.uploadToFilesystem(banner)).Location: null

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

const createContest = async (creatorId: string, body: contestData, banner: Express.Multer.File) => {

    try {
        if (!validateContestDate(body.startDate, body.endDate)) {
            throw new ApiError(httpstatus.BAD_REQUEST, "Start date cannot be after end date");
        }

        //If contest is recurring , save recurring data separately
        if (body.recurring) {
            return createRecurringContest(creatorId, body, banner)
        }


        let bannerUrl: string | null = null
        if (banner) {
            bannerUrl = (await fileUploader.uploadToFilesystem(banner)).Location;
        }

        if (body.coin_requirement) {
            if (!body.coin_required || body.coin_required < 0) {
                throw new ApiError(httpstatus.BAD_REQUEST, "Coin requirement is invalid")
            }

        }

        let levels = body.level_requirements.map(levels => parseInt(levels))

        const contestData: any = {
            creatorId,
            title: body.title,
            description: body.description,
            status: ContestStatus.UPCOMING,
            mode: body.mode || ContestMode.SOLO,
            level_requirements: levels,
            type: body.type || ContestPlan.OPEN,
            maxUploads: Number(body.maxUploads),
            ...(bannerUrl && { banner: bannerUrl }),

            ...(body.coin_requirement === true ? { coin_required: body.coin_required, coin_requirement: body.coin_requirement } : null)

        }
        // If contest is money contest, add money contest data like max prize and min prize for the paerticipants
        // If isMoneyContest is not provided, it will default to false

        if (body.isMoneyContest) {

            if ((Number(body.minPrize) > Number(body.maxPrize))) {
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

        console.log("contestdata", contestData)

        // Create a normal contest entry for all type of contest
        let contest = await prisma.contest.create({
            data: { ...contestData }
        });

        let createdRules, createdPrizes

        if (body.rules) {
            const rules: ContestRule[] = body.rules

            createdRules = await contestRuleService.addContestRules(contest.id, rules)
        }

        if (body.prizes) {
            const prizes: ContestPrize[] = body.prizes
            createdPrizes = await addContestPrizes(contest.id, prizes)
        }

        const updatedContest = await prisma.contest.update({ where: { id: contest.id }, data: { rules: createdRules, prizes: createdPrizes } })

        return updatedContest
    } catch (err) {
        console.log(err)
        throw new ApiError(httpstatus.BAD_REQUEST, 'contest creation failed')
    }

};


//manage recurring contest separately

const createRecurringContest = async (creatorId: string, body: contestData, banner: Express.Multer.File) => {
    if (!body.recurring) {
        throw new Error("Contest is not a recurring contest!")
    }

    const isDateValid = validateContestDate(body.startDate, body.endDate);

    if (!isDateValid) {
        throw new ApiError(httpstatus.BAD_REQUEST, "Start date cannot be after end date");
    }


    const startDate = new Date(body.startDate)
    const endDate = new Date(body.endDate)

    console.log(startDate)

    let levels = body.level_requirements.map(levels => parseInt(levels))

    if (body.coin_requirement) {
        if (!body.coin_required || body.coin_required < 0) {
            throw new ApiError(httpstatus.BAD_REQUEST, "Coin requirement is invalid")
        }

    }

    const contestData: any = {
        creatorId,
        title: body.title,
        description: body.description,
        mode: body.mode || ContestMode.SOLO,
        type: body.type || ContestPlan.OPEN,
        level_requirements: levels,
        ...(body.coin_requirement === true ? { coin_required: body.coin_required, coin_requirement: body.coin_requirement } : null),
        startDate,
        endDate

    }
    if (!body.rules || !body.prizes) {
        throw new ApiError(httpstatus.BAD_REQUEST, "contest rules and prizes are required")
    }

    contestData.rules = JSON.stringify(body.rules)
    contestData.prizes = JSON.stringify(body.prizes)

    let bannerUrl: string
    if (banner) {
        bannerUrl = (await fileUploader.uploadToFilesystem(banner)).Location;
        contestData.banner = bannerUrl
    }

    if (body.isMoneyContest) {
        if (!body.minPrize || !body.maxPrize || (body.minPrize > body.maxPrize)) {
            throw new ApiError(httpstatus.BAD_REQUEST, "Contest prize data is invalid")
        }
        contestData.isMoneyContest = true;
        contestData.maxPrize = body.maxPrize || 0;
        contestData.minPrize = body.minPrize || 0;
    }

    contestData.recurring = {
        set: {
            recurringType: body.recurringType,
            previousOccurrence: null,
            nextOccurrence: startDate,
            duration: new Date(body.endDate).getTime() - new Date(body.startDate).getTime()
        }
    }

    try {
        const recurringContest = await prisma.recurringContest.create({ data: contestData })
        return recurringContest
    } catch (err: any) {
        throw new ApiError(httpstatus.BAD_REQUEST, " recurring Contest creation failed")
    }

}


const updateContest = async (contestId: string, contestData: Partial<IContest>) => {

    const contest = await prisma.contest.findUnique({ where: { id: contestId } })
    if (!contest) {
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }

    if (contest.status === ContestStatus.ACTIVE) {
        throw new ApiError(httpstatus.BAD_REQUEST, "Editing active contest is not allowed")
    }

    if (contest.status === ContestStatus.CLOSED || contest.status === ContestStatus.COMPLETED) {
        throw new ApiError(httpstatus.BAD_REQUEST, "Editing closed or completed contest is not allowed")
    }

    if (contest.status === ContestStatus.UPCOMING || contest.status === ContestStatus.NEW) {
        const updatedContest = await prisma.contest.update({ where: { id: contestId }, data: contestData })

        return updatedContest
    }

    throw new ApiError(httpstatus.BAD_REQUEST, "Editing contest not allowed")
}


//delete a contest by the contest id
const deleteContestByContestId = async (contestId: string) => {
    const contest = await prisma.contest.findUnique({ where: { id: contestId } })
    if (!contest) {
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found!")
    }

    await prisma.$transaction([
        prisma.vote.deleteMany({ where: { contestId } }),
        prisma.contestWinner.deleteMany({ where: { contestId } }),
        prisma.contestAchievement.deleteMany({ where: { contestId } }),
        prisma.contestPhoto.deleteMany({ where: { contestId } }),
        prisma.contestParticipant.deleteMany({ where: { contestId } }),
        prisma.contestPrize.deleteMany({ where: { contestId } }),
        prisma.contestRule.deleteMany({ where: { contestId } }),
        prisma.teamMatch.deleteMany({ where: { contestId } }),
        prisma.teamParticipation.deleteMany({ where: { contestId } }),
        prisma.contest.delete({ where: { id: contestId } })
    ]);

    return "contest deleted!"
}


// add a user to the contest participant list

const joinContest = async (userId: string, contestId: string) => {
    const contest = await prisma.contest.findUnique({ where: { id: contestId } })

    if (!contest || contest.status != ContestStatus.ACTIVE) {
        throw new ApiError(httpstatus.NOT_FOUND, "Contest is not available to participate")
    }


    const teamMember = await prisma.teamMember.findFirst({ where: { memberId: userId } })
    let participant = await prisma.contestParticipant.create({ data: { contestId, userId } })
    if (teamMember) {
        await prisma.contestParticipant.update({ where: { id: participant.id }, data: { memberId: teamMember.id } })
    }

    if (participant) {
        console.log("User has joined the contest")
    }

    return { contest_id: contestId, participant_id: participant.id }

}


const getContestByUserId = async (userId: string, contestId: string) => {
    const contest = await prisma.contest.findUnique({
        where: { id: contestId },
        include: { creator: { omit: { password: true, accessToken: true } }, participants: true }
    });
    if (!contest) {
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }

    const rules = await contestRuleService.getContestRules(contestId)
    const prizes = await getContestPrizes(contestId)
    const totalVotes = await voteService.getContestTotalVotes(contestId)

    if (contest.status === ContestStatus.CLOSED) {

        const winners = await achievementService.getAchievements(contestId)

        console.log(winners)
        console.log(contest)

        return { ...contest, prizes, totalVotes, winners };
    }

    if (!userId) {
        return { ...contest, rules, prizes, totalVotes, joined: false };
    }

    if ((await isContestParticipantExist(userId, contestId)) && (contest.status === ContestStatus.ACTIVE)) {
        const contestPhotoCount = await prisma.contestPhoto.count({ where: { contestId, photo: { userId } } })

        return { ...contest, joined: true, rules, prizes, totalVotes, uploadCount: contestPhotoCount }
    }


    return { ...contest, rules, prizes, totalVotes, joined: false };
}


//get the contest by it's id

const getContestById = async (contestId: string) => {
    const contest = await prisma.contest.findUnique({
        where: { id: contestId },
        include: { creator: { omit: { password: true, accessToken: true } } }
    });
    if (!contest) {
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }

    const rules = await contestRuleService.getContestRules(contestId)
    const prizes = await getContestPrizes(contestId)
    const totalVotes = await voteService.getContestTotalVotes(contestId)

    if (contest.status === ContestStatus.CLOSED) {

        const winners = await achievementService.getAchievements(contestId)

        console.log(winners)
        console.log(contest)

        return { ...contest, prizes, totalVotes, winners };
    }


    return { ...contest, rules, prizes, totalVotes };
}



//Return all the contests
const getAllContests = async (page: number = 1, limit: number = 20) => {

    const skip = (page - 1) * limit

    const [contests, total] = await Promise.all([
        prisma.contest.findMany({
            include: { creator: { omit: { password: true } } },
            skip,
            take: limit,
            orderBy: { startDate: "desc" }
        }),
        prisma.contest.count()
    ])

    return { contests, total, page, limit };
};

//Search contest by contest status
const getContestsByStatus = async (userId: string, status: ContestStatus, page: number = 1, limit: number = 10) => {
    const { skip, limit: paginationLimit } = paginationHelper.calculatePagination({ page, limit });

    if (status === ContestStatus.COMPLETED) {

        const { data: completedContests, total } = await getMyCompletedContest(userId, page, limit)

        const mappedContest = await Promise.all(completedContests.map(async contest => {
            // const achievements = await achievementService.getMyAchievementsByContest(userId, contest.id)
            const rank = (await getParticipantLevelData(contest.id, userId)).currentLevel

            return { ...contest, rank }
        }))

        const paginationMetaData = paginationHelper.getPaginationMetaData(page, paginationLimit, total);

        return { data: mappedContest, meta: paginationMetaData };
    }



    // if(status === ContestStatus.CLOSED){
    //     const closedContests = await prisma.contest.findMany({where:{participants:{none:{userId}}}})

    //     closedContests.map( async contest => {
    //         const winners = await getContestWinners(contest.id)

    //         return {...contest, winners}
    //     })


    // }

    if (status === ContestStatus.ACTIVE) {

        const [contests, total] = await Promise.all([
            prisma.contest.findMany({
                where: { status, participants: { none: { userId } } },
                include: { creator: { select: { id: true, avatar: true, fullName: true, cover: true, firstName: true, lastName: true } } },
                skip,
                take: paginationLimit
            }),
            prisma.contest.count({
                where: { status, participants: { none: { userId } } }
            })
        ]);

        const contestDetails = contests.map(async contest => {
            const details = getContestById(contest.id)

            return details

        })
        const data = await Promise.all(contestDetails);
        const paginationMetaData = paginationHelper.getPaginationMetaData(page, paginationLimit, total);
        return { data, meta: paginationMetaData };
    }

    if (status === ContestStatus.CLOSED) {

        const [contests, total] = await Promise.all([
            prisma.contest.findMany({
                where: { status, participants: { none: { userId } } },
                include: { creator: { select: { id: true, avatar: true, fullName: true, cover: true, firstName: true, lastName: true } } },
                skip,
                take: paginationLimit
            }),
            prisma.contest.count({
                where: { status, participants: { none: { userId } } }
            })
        ]);

        const contestDetails = contests.map(async contest => {
            const details = getContestById(contest.id)

            return details

        })
        const data = await Promise.all(contestDetails);
        const paginationMetaData = paginationHelper.getPaginationMetaData(page, paginationLimit, total);
        return { data, meta: paginationMetaData };
    }


    const [contests, total] = await Promise.all([
        prisma.contest.findMany({
            where: { status },
            include: { creator: { select: { id: true, avatar: true, fullName: true, cover: true, firstName: true, lastName: true } } },
            skip,
            take: paginationLimit
        }),
        prisma.contest.count({
            where: { status }
        })
    ]);

    const contestDetails = contests.map(async contest => {
        const details = getContestById(contest.id)

        return details

    })


    const data = await Promise.all(contestDetails);
    const paginationMetaData = paginationHelper.getPaginationMetaData(page, paginationLimit, total);

    return { data, meta: paginationMetaData };
};


const getClosedContestsWithWinners = async () => {
}

//Get all uploads of a user

const getContestUploadsByUserId = async (contestId: string, userId: string) => {
    const userUploads = await prisma.contestPhoto.findMany({ where: { contestId: contestId, photo: { userId } }, include: { photo: { select: { url: true } } } })
    const mappedPhotos = userUploads.map(upload => {

        const { photo, ...rest } = upload

        return { ...rest, url: upload.photo.url }
    })

    return mappedPhotos
}


const deleteContestUploadById = async (contestId: string, userId: string, photoId: string) => {

    const contestUpload = await prisma.contestPhoto.findUnique({ where: { id: photoId, contestId }, include: { participant: true } })
    if (!contestUpload) {
        throw new ApiError(httpstatus.NOT_FOUND, "Contest upload not found")
    }
    if (contestUpload.participant.userId !== userId) {
        throw new ApiError(httpstatus.FORBIDDEN, "You are not allowed to delete this contest upload")
    }
    await prisma.contestPhoto.delete({ where: { id: photoId } })
    return "Contest upload deleted successfully"
}




// Get all the contests
// This will be used to display all the contests in the contest page

const getMyActiveContests = async (userId: string, page: number = 1, limit: number = 10) => {

    const { skip, limit: paginationLimit } = paginationHelper.calculatePagination({ page, limit });

    const [contests, total] = await Promise.all([
        prisma.contest.findMany({
            where: { status: ContestStatus.ACTIVE, participants: { some: { userId } } },
            include: { creator: { select: { id: true, avatar: true, fullName: true, cover: true, firstName: true, lastName: true } }, },
            skip,
            take: paginationLimit
        }),
        prisma.contest.count({
            where: { status: ContestStatus.ACTIVE, participants: { some: { userId } } }
        })
    ]);

    const contestDetails = contests.map(async (contest) => {
        const levelData = await getParticipantLevelData(contest.id, userId)
        const photos = await getContestUploadsByUserId(contest.id, userId)


        return { ...contest, level_data: levelData, photos }
    })

    const data = await Promise.all(contestDetails);
    const paginationMetaData = paginationHelper.getPaginationMetaData(page, paginationLimit, total);

    return { data, meta: paginationMetaData };
};

const getUpcomingContest = async () => {
    const contests = await prisma.contest.findMany({
        where: { status: ContestStatus.UPCOMING },
        include: { creator: { select: { id: true, avatar: true, fullName: true, cover: true, firstName: true, lastName: true } } }
    });
    return contests;
};

//Get my contests which are completed

const getMyCompletedContest = async (userId: string, page: number = 1, limit: number = 10) => {

    if (!userId) {
        throw new ApiError(httpstatus.BAD_REQUEST, "User id is not provided")
    }
    const user = await prisma.user.findUnique({ where: { id: userId } })

    if (!user) {
        throw new ApiError(httpstatus.NOT_FOUND, "User not found")
    }

    const { skip, limit: paginationLimit } = paginationHelper.calculatePagination({ page, limit });

    const [myParticipatedContest, total] = await Promise.all([
        prisma.contest.findMany({
            where: { status: ContestStatus.CLOSED, participants: { some: { userId } } },
            skip,
            take: paginationLimit
        }),
        prisma.contest.count({
            where: { status: ContestStatus.CLOSED, participants: { some: { userId } } }
        })
    ]);

    const mappetdCompletedContest = await Promise.all(myParticipatedContest.map(async contest => {
        const details = await getContestById(contest.id)
        const photos = await getCompletedContestUploads(userId, contest.id)
        const achievements = await achievementService.getContestAchievementsByUser(userId)
        const totalVotes = photos.data.reduce((pre, photo) => photo.voteCount + pre, 0)
        return { ...details, photos, totalVotes, achievements }
    }))



    // const myCompletedContests = await prisma.contest.findMany({where:{status:ContestStatus.COMPLETED, participants:{some:{userId}}},include:{_count:{select:{votes:true}}}})

    return { data: mappetdCompletedContest, total };
}



const getContestWinners = async (contestId: string, page: number = 1, limit: number = 10) => {
    const contest = await prisma.contest.findUnique({ where: { id: contestId, status: ContestStatus.CLOSED } })

    if (!contest) {
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }

    const { skip, limit: paginationLimit } = paginationHelper.calculatePagination({ page, limit });

    const winners = await prisma.contestAchievement.findMany({
        where: { contestId: contest.id },
        skip,
        take: paginationLimit,
        include: { participant: { include: { user: { select: { avatar: true, fullName: true, firstName: true, lastName: true } } } } }
    })

    const total = await prisma.contestAchievement.count({ where: { contestId: contest.id } });
    const paginationMetaData = paginationHelper.getPaginationMetaData(page, paginationLimit, total);

    return { data: winners, meta: paginationMetaData };
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
    const results: Array<any> = [];
    for (const contest of contests) {
        // Fetch all contest photos for this contest
        const contestPhotos = await prisma.contestPhoto.findMany({
            where: { contestId: contest.id },
            include: { photo: true }
        });
        let winner: any;
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

const identifyWinner = async (contestId: string) => {
    console.log('Identifying winners....')

    const contest = await getContestById(contestId)
    if (!contest) {
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }

    if (contest.mode === ContestMode.TEAM) {
        return await identifyTeamWinner(contestId)
    }

    const participants = await getContestParticipants(contestId)

    // Properly await all vote counts for each participant
    let participant = await Promise.all(participants.map(async participant => {
        const uploadedPhotos = await prisma.contestPhoto.findMany({ where: { contestId, participantId: participant.id } })
        let maxVote = 0
        let maxPhoto: ContestPhoto | null = null

        // FIX: Use for loop instead of forEach to properly await async operations
        for (const photo of uploadedPhotos) {
            const votes = await prisma.vote.count({ where: { contestId, photoId: photo.id } })

            if (votes > maxVote) {
                maxVote = votes
                maxPhoto = photo
            }
        }

        const totalVotes = await prisma.vote.count({ where: { contestId, photo: { participantId: participant.id } } })
        return { ...participant, totalVotes, singlePhotoVote: maxVote, maxPhoto }
    }))

    // Award TOP_PHOTOGRAPHER - participant with most total votes
    const top_photographer = participant.sort((a, b) => b.totalVotes - a.totalVotes)[0]
    if (top_photographer && top_photographer.totalVotes > 0) {
        await awardWinner(top_photographer, contestId, PrizeType.TOP_PHOTOGRAPHER, null)
        console.log(`TOP_PHOTOGRAPHER award given to participant ${top_photographer.id}`)
    }

    // Award TOP_PHOTO - participant with single photo having most votes
    const top_photo_participant = participant.sort((a, b) => b.singlePhotoVote - a.singlePhotoVote)[0]
    if (top_photo_participant && top_photo_participant.maxPhoto && top_photo_participant.singlePhotoVote > 0) {
        await awardWinner(top_photo_participant, contestId, PrizeType.TOP_PHOTO, top_photo_participant.maxPhoto.id)
        console.log(`TOP_PHOTO award given to photo ${top_photo_participant.maxPhoto.id} by participant ${top_photo_participant.id}`)
    }

    console.log('Winner identification completed')
}



const awardTeams = async (contestId: string) => {
    const teamMatches = await prisma.teamMatch.findMany({ where: { contestId, status: 'ACTIVE' } })

    if (!teamMatches || teamMatches.length <= 0) {
        console.log("No team match found for this contest")
        return
    }

    for (const teamMatch of teamMatches) {
        await awardTeam(teamMatch.id, contestId)
    }
}

const awardTeam = async (matchId: string, contestId: string) => {
    const teamMatch = await prisma.teamMatch.findUnique({ where: { id: matchId } })

    if (!teamMatch) {
        console.log("match not found")
        return
    }

    // TEAM MATCH SCORING:
    // Get total votes for each team
    // Score = Sum of all votes received by team members in the contest
    // When a team member participated in the contest with team badge (memberId set),
    // all votes they received count toward their team's total score
    const team1Votes = await voteService.getTeamTotalVotes(contestId, teamMatch.team1Id)
    const team2Votes = await voteService.getTeamTotalVotes(contestId, teamMatch.team2Id)

    // Delegate to teamService.recordMatchResult() which properly handles:
    // - TeamMatch status to CLOSED, scores, result, winner_id
    // - TeamMatchHistory for both teams
    // - Win/loss/draw correctly (not counting ties as wins)
    // - Clearing active_match_id from teams
    // - Incrementing total_matches
    await teamService.recordMatchResult(matchId, team1Votes, team2Votes)
    console.log(`Team match ${matchId} ended and moved to history: Team1=${team1Votes} vs Team2=${team2Votes}`)
}

const getTeamParticipant = async (contestId: string, teamId: string) => {
    const participants = await prisma.contestParticipant.findMany({ where: { user: { joinedTeam: { id: teamId } }, contestId, } })

    return participants
}


const identifyTopPhoto = async (contestId: string) => {
    const contest = await prisma.contest.findUnique({ where: { id: contestId } })

    if (!contest) {
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }

    const contestPhoto = await prisma.vote.groupBy({ by: ['photoId'], where: { contestId }, _count: { photoId: true }, orderBy: { _count: { photoId: 'desc' } }, take: 1 })
}

const identifyTeamWinner = async (contestId: string) => {
    const contest = await getContestById(contestId)
    if (!contest) {
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }

    if (contest.mode !== ContestMode.TEAM) {
        throw new ApiError(httpstatus.BAD_REQUEST, "contest is not for team")
    }

    const participants = await getContestParticipants(contestId)

    // Calculate votes for each participant (same pattern as solo identifyWinner)
    let participantData = await Promise.all(participants.map(async participant => {
        const uploadedPhotos = await prisma.contestPhoto.findMany({ where: { contestId, participantId: participant.id } })
        let maxVote = 0
        let maxPhoto: ContestPhoto | null = null

        for (const photo of uploadedPhotos) {
            const votes = await prisma.vote.count({ where: { contestId, photoId: photo.id } })
            if (votes > maxVote) {
                maxVote = votes
                maxPhoto = photo
            }
        }

        const totalVotes = await prisma.vote.count({ where: { contestId, photo: { participantId: participant.id } } })
        return { ...participant, totalVotes, singlePhotoVote: maxVote, maxPhoto }
    }))

    // Award TOP_PHOTOGRAPHER - participant with most total votes
    const top_photographer = participantData.sort((a, b) => b.totalVotes - a.totalVotes)[0]
    if (top_photographer && top_photographer.totalVotes > 0) {
        await awardWinner(top_photographer, contestId, PrizeType.TOP_PHOTOGRAPHER, null)
        console.log(`[TEAM] TOP_PHOTOGRAPHER award given to participant ${top_photographer.id}`)
    }

    // Award TOP_PHOTO - participant with single photo having most votes
    const top_photo_participant = participantData.sort((a, b) => b.singlePhotoVote - a.singlePhotoVote)[0]
    if (top_photo_participant && top_photo_participant.maxPhoto && top_photo_participant.singlePhotoVote > 0) {
        await awardWinner(top_photo_participant, contestId, PrizeType.TOP_PHOTO, top_photo_participant.maxPhoto.id)
        console.log(`[TEAM] TOP_PHOTO award given to photo ${top_photo_participant.maxPhoto.id} by participant ${top_photo_participant.id}`)
    }

    console.log('[TEAM] Winner identification completed')
}

//Award prize to the winners

const awardWinner = async (winner: ContestParticipant, contestId: string, prizeType: PrizeType, photoId: string | null = null) => {

    try {
        const contestPrize = await prisma.contestPrize.findFirst({ where: { contestId, category: prizeType } })

        if (!contestPrize) {
            throw new ApiError(httpstatus.NOT_FOUND, "Prize is not available")
        }

        const winnerStore = await prisma.userStore.findFirst({ where: { userId: winner.userId as string } })
        if (!winnerStore) {
            throw new ApiError(httpstatus.NOT_FOUND, 'Winner store is not available')
        }

        // Award prize to winner's store
        await prisma.userStore.update({
            where: { id: winnerStore.id },
            data: {
                key: winnerStore.key + contestPrize.key,
                boost: winnerStore.boost + contestPrize.boost,
                swap: winnerStore.swap + contestPrize.swap
            }
        })

        // FIX: Create achievement record for the winner
        await achievementService.addAchievement(
            winner.userId as string,
            contestId,
            prizeType,
            photoId || ''
        )

        console.log(`Award given to user ${winner.userId}: ${prizeType} - Key: ${contestPrize.key}, Boost: ${contestPrize.boost}, Swap: ${contestPrize.swap}`)
    } catch (err) {
        console.error(`Error awarding winner: ${err}`)
        throw err
    }
}

const getRemainingPhotos = async (userId: string, contestId: string, page: number = 1, limit: number = 10) => {

    const contest = await prisma.contest.findUnique({ where: { id: contestId } })
    if (!contest) {
        throw new ApiError(httpstatus.NOT_FOUND, "conetest not found")
    }

    const { skip, limit: paginationLimit } = paginationHelper.calculatePagination({ page, limit });

    const contestUploads = await prisma.contestPhoto.findMany({ where: { contestId, participant: { userId } } })
    const userPhotos = await prisma.userPhoto.findMany({ where: { userId, contestUpload: { none: { contestId } } }, select: { id: true, url: true }, skip, take: paginationLimit })

    const total = await prisma.userPhoto.count({ where: { userId, contestUpload: { none: { contestId } } } });
    const paginationMetaData = paginationHelper.getPaginationMetaData(page, paginationLimit, total);

    return { data: userPhotos, meta: paginationMetaData };
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


const isContestParticipantExist = async (userId: string, contestId: string) => {
    const participantData = await prisma.contestParticipant.findUnique({ where: { contestId_userId: { contestId, userId } } })

    return participantData ? participantData : false;
}

const getContestUploadsToVote = async (userId: string, contestId: string, page: number = 1, limit: number = 10) => {
    const contest = await prisma.contest.findUnique({ where: { id: contestId } })
    if (!contest) {
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }
    const participant = await isContestParticipantExist(userId, contestId)

    if (!participant) {
        throw new ApiError(httpstatus.NOT_FOUND, "user is not in the participation list")
    }

    const { skip, limit: paginationLimit } = paginationHelper.calculatePagination({ page, limit });

    const contestUploads = await prisma.contestPhoto.findMany({
        where: {
            contestId,
            participant: { NOT: { userId } },
            votes: { none: { providerId: participant.userId } }
        },
        include: {
            photo: { select: { id: true, url: true } },
            participant: { select: { exposure_bonus: true, createdAt: true } }
        },
        orderBy: contest.status === ContestStatus.ACTIVE ? [
            { promoted: 'desc' },
            { participant: { exposure_bonus: 'desc' } },
            { participant: { createdAt: 'desc' } }
        ] : undefined,
        skip,
        take: paginationLimit
    })

    if (contest.status === ContestStatus.ACTIVE) {
        contestUploads.sort((a, b) => {
            if (a.promoted && !b.promoted) return -1;
            if (!a.promoted && b.promoted) return 1;

            const aBonus = a.participant?.exposure_bonus ?? 0;
            const bBonus = b.participant?.exposure_bonus ?? 0;
            if (aBonus !== bBonus) {
                return bBonus - aBonus;
            }

            const aJoined = a.participant?.createdAt ? new Date(a.participant.createdAt).getTime() : 0;
            const bJoined = b.participant?.createdAt ? new Date(b.participant.createdAt).getTime() : 0;
            return bJoined - aJoined;
        })
    }

    const total = await prisma.contestPhoto.count({ where: { contestId, participant: { NOT: { userId } }, votes: { none: { providerId: participant.userId } } } });
    const paginationMetaData = paginationHelper.getPaginationMetaData(page, paginationLimit, total);
    const mappedUploads = contestUploads.map(upload => ({ url: upload.photo.url, id: upload.id }));

    return { data: mappedUploads, meta: paginationMetaData };
}


//Get completed contest uploaded images

// const getCompletedContestUploads = async (userId:string,contestId:string)=>{

//     const contest = await prisma.contest.findUnique({where:{id:contestId}})
//     if(!contest){
//         throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
//     }
//     const participant = await isContestParticipantExist(userId, contestId)

//     if( !participant){
//         throw new ApiError(httpstatus.NOT_FOUND, "user is not in the participation list")
//     }


//     const contestUploads = await prisma.contestPhoto.findMany({where:{contestId, votes:{none:{providerId:participant.userId}}}, include:{photo:{select:{id:true, url:true}}}})

//     if(contest.status === ContestStatus.ACTIVE){
//         contestUploads.sort((a: ContestPhoto, b: ContestPhoto) => {

//             if (a.promoted && !b.promoted) return -1;
//             if (!a.promoted && b.promoted) return 1;

//             return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
//         })
//     }
//     return contestUploads.map(upload => ({url:upload.photo.url, id:upload.id}))
// }   

//Get all contest uploaded images

const getContestUploads = async (userId: string, contestId: string, page: number = 1, limit: number = 10) => {

    const contest = await prisma.contest.findUnique({ where: { id: contestId } })
    if (!contest) {
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }
    const participant = await isContestParticipantExist(userId, contestId)

    if (!participant) {
        throw new ApiError(httpstatus.NOT_FOUND, "user is not in the participation list")
    }

    const { skip, limit: paginationLimit } = paginationHelper.calculatePagination({ page, limit });

    const contestUploads = await prisma.contestPhoto.findMany({ where: { contestId, photo: { userId: { not: userId } }, votes: { none: { providerId: userId } } }, include: { photo: { select: { id: true, url: true } } }, skip, take: paginationLimit })

    if (contest.status === ContestStatus.ACTIVE) {
        contestUploads.sort((a: ContestPhoto, b: ContestPhoto) => {

            if (a.promoted && !b.promoted) return -1;
            if (!a.promoted && b.promoted) return 1;

            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        })
    }
    const uploads = await Promise.all(contestUploads.map(async upload => {
        const voteCount = await prisma.vote.count({ where: { contestId, photoId: upload.id } })

        return { id: upload.photo.id, url: upload.photo.url, voteCount }
    }))

    const total = await prisma.contestPhoto.count({ where: { contestId, votes: { none: { providerId: participant.userId } } } });
    const paginationMetaData = paginationHelper.getPaginationMetaData(page, paginationLimit, total);

    return { data: uploads, meta: paginationMetaData };
}



const getCompletedContestUploads = async (userId: string, contestId: string, page: number = 1, limit: number = 10) => {

    const contest = await prisma.contest.findUnique({ where: { id: contestId } })
    if (!contest) {
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }
    const participant = await isContestParticipantExist(userId, contestId)

    if (!participant) {
        throw new ApiError(httpstatus.NOT_FOUND, "user is not in the participation list")
    }

    const { skip, limit: paginationLimit } = paginationHelper.calculatePagination({ page, limit });

    const contestUploads = await prisma.contestPhoto.findMany({ where: { contestId, photo: { userId: userId }, votes: { none: { providerId: userId } } }, include: { photo: { select: { id: true, url: true } } }, skip, take: paginationLimit })

    if (contest.status === ContestStatus.ACTIVE) {
        contestUploads.sort((a: ContestPhoto, b: ContestPhoto) => {

            if (a.promoted && !b.promoted) return -1;
            if (!a.promoted && b.promoted) return 1;

            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        })
    }
    const uploads = await Promise.all(contestUploads.map(async upload => {
        const voteCount = await prisma.vote.count({ where: { contestId, photoId: upload.id } })

        return { id: upload.photo.id, url: upload.photo.url, voteCount }
    }))

    const total = await prisma.contestPhoto.count({ where: { contestId, votes: { none: { providerId: participant.userId } } } });
    const paginationMetaData = paginationHelper.getPaginationMetaData(page, paginationLimit, total);

    return { data: uploads };
}



//Upload photo to a contest, user can upload photo from pforile or can upload directly from computer

const uploadPhotoToContest = async (contestId: string, userId: string, photoIds: string[], file: Express.Multer.File) => {

    if (!contestId) {
        throw new ApiError(httpstatus.BAD_REQUEST, "contest id is required")
    }
    const contest = await prisma.contest.findUnique({ where: { id: contestId, status: ContestStatus.ACTIVE } })

    if (!contest) {
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found or contest closed")
    }

    let user = await prisma.user.findUnique({ where: { id: userId }, include: { subscriptions: { where: { status: SubscriptionStatus.VALID } } } })

    if (!user) {
        throw new ApiError(httpstatus.NOT_FOUND, "user not found")
    }

    let contestParticipant: ContestParticipant | null = await prisma.contestParticipant.findUnique({ where: { contestId_userId: { contestId, userId } } })

    const images = await prisma.$transaction(async prisam => {


        if (!contestParticipant) {

            if (contest.coin_requirement) {
                const participant = await joinContestByCoin(userId, contestId)
                contestParticipant = participant
            }
            // const userSubscription = user.subscriptions && user.subscriptions.length > 0 ? user.subscriptions[0] : null

            // switch(contest.type){
            //     case ContestPlan.OPEN:
            //         // Open contest is available for all users, no subscription check needed
            //         break;
            //     case ContestPlan.PREMIUM:
            //         if (!userSubscription || userSubscription.plan !== SubscriptionPlanEnum.PREMIUM) {
            //             throw new ApiError(httpstatus.FORBIDDEN, `You are not allowed to upload photo to this contest. Please subscribe to premium plan to participate in this contest`)
            //         }
            //         break;
            //     case ContestPlan.PRO:
            //         if (!userSubscription || (userSubscription.plan !== SubscriptionPlanEnum.PRO && userSubscription.plan !== SubscriptionPlanEnum.PREMIUM)) {
            //             throw new ApiError(httpstatus.FORBIDDEN, `You are not allowed to upload photo to this contest. Please subscribe to pro plan to participate in this contest`)
            //         }
            //         break;
            //     default:
            //         throw new ApiError(httpstatus.INTERNAL_SERVER_ERROR, "Invalid contest type")
            // }

            // if( (contest.type !== ContestPlan.OPEN) || 
            //     !(userSubscription && 
            //         (userSubscription.plan === SubscriptionPlanEnum.PREMIUM || 
            //             userSubscription.plan === contest.type))){

            //         throw new ApiError(httpstatus.FORBIDDEN, `You are not allowed to upload photo to this contest. Please subscribe to ${contest.type.toLocaleLowerCase()} plan to participate in this contest`)
            // }
            contestParticipant = await prisma.contestParticipant.create({
                data: { contestId: contest.id, userId: userId }, include: { contest: true, _count: { select: { photos: true } } }
            })

            //add watcher for exposure bonus

            const exposureJob = agenda.create("exposure:watcher", { contestParticipantId: contestParticipant!.id })
            exposureJob.repeatEvery("1 minute")
            await exposureJob.save()
        }

        const contestPhotosCount = await prisma.contestPhoto.count({ where: { contestId: contest.id, participantId: contestParticipant!.id } })

        if (contestPhotosCount >= contest.maxUploads) {
            throw new ApiError(httpstatus.BAD_REQUEST, "maximum photo upload limit has reached!")
        }

        let uploadImage: ContestPhoto | null = null;
        let images: Array<ContestPhoto> = []

        if (file) {

            let uploadedPhoto = await profileService.uploadUserPhoto(userId, file)

            uploadImage = await prisma.contestPhoto.create({ data: { contestId, participantId: contestParticipant!.id, photoId: uploadedPhoto.id } })

        } else {
            if (!photoIds || photoIds.length <= 0) {
                throw new ApiError(httpstatus.BAD_REQUEST, "photoIds is empty or missing")
            }

            const alreadyUploadedPhotosCount = await prisma.contestPhoto.count({ where: { contestId, photo: { userId } } })

            if ((photoIds.length > contest.maxUploads) || (photoIds.length > (contest.maxUploads - alreadyUploadedPhotosCount))) {
                throw new ApiError(httpstatus.BAD_REQUEST, `maximum upload limit exceeded`)
            }

            // FIX: Use for loop instead of forEach to properly await async operations
            for (const photoId of photoIds) {
                const userPhoto = await prisma.userPhoto.findUnique({ where: { id: photoId } })
                if (userPhoto) {
                    uploadImage = await prisma.contestPhoto.create({ data: { contestId, participantId: contestParticipant!.id, photoId: userPhoto.id }, include: { photo: true } })
                    if (uploadImage) {
                        images.push(uploadImage)
                    }
                }
            }
        }


        const teamMember = await prisma.teamMember.findFirst({ where: { memberId: userId } })
        if (teamMember) {
            await prisma.contestParticipant.update({ where: { id: contestParticipant!.id }, data: { memberId: teamMember.id } })

            // OPTION 2: Dynamic team member registration on photo upload
            // When a team member uploads a photo in a contest with an active match,
            // automatically register all other active team members as contestants
            try {
                // Check if team has an active match in this contest
                const activeTeamMatch = await prisma.teamMatch.findFirst({
                    where: {
                        contestId,
                        status: 'ACTIVE',
                        OR: [
                            { team1Id: teamMember.teamId },
                            { team2Id: teamMember.teamId }
                        ]
                    }
                })

                // If active match exists, register all active team members
                if (activeTeamMatch) {
                    const allTeamMembers = await prisma.teamMember.findMany({
                        where: {
                            teamId: teamMember.teamId,
                            status: 'ACTIVE'
                        },
                        select: { id: true, memberId: true }
                    })

                    // Bulk register all team members who aren't already participants
                    for (const member of allTeamMembers) {
                        try {
                            // Check if already registered
                            const existingParticipant = await prisma.contestParticipant.findUnique({
                                where: { contestId_userId: { contestId, userId: member.memberId } }
                            })

                            // If not registered, create entry
                            if (!existingParticipant) {
                                await prisma.contestParticipant.create({
                                    data: {
                                        contestId,
                                        userId: member.memberId,
                                        memberId: member.id
                                    }
                                })
                            }
                        } catch (err) {
                            // Silently skip on constraint violations (already registered)
                            if (!(err instanceof Error && err.message.includes('Unique constraint'))) {
                                console.error(`Failed to register team member ${member.memberId}:`, err)
                            }
                        }
                    }

                    console.log(`Team members auto-registered for contest ${contestId} via member upload`)
                }
            } catch (err) {
                console.error(`Error during dynamic team member registration:`, err)
                // Don't throw - upload still succeeds even if auto-registration fails
            }
        }


        return images
    })

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


const joinContestByCoin = async (userId: string, contestId: string) => {
    console
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
        throw new ApiError(httpstatus.NOT_FOUND, "user not found")
    }
    const contest = await prisma.contest.findUnique({ where: { id: contestId } })
    if (!contest) {
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }

    const userStore = await prisma.userStore.findUnique({ where: { userId: user.id } })
    if (!userStore) {
        throw new ApiError(httpstatus.NOT_FOUND, "user store not found")
    }

    if (contest.coin_required! > userStore.coins) {
        throw new ApiError(httpstatus.BAD_REQUEST, "Insufficient coin balance")
    }
    await prisma.userStore.update({ where: { id: userStore.id }, data: { coins: userStore.coins - contest.coin_required! } })
    const participant = await prisma.contestParticipant.create({ data: { contestId, userId, status: ContestParticipantStatus.ACTIVE } })
    return participant
}

const getParticipantTotalVotes = async (contestId: string, participantId: string) => {

    // const contestPhotos = await prisma.contestPhoto.findMany({where:{contestId, participantId}})
    // contestPhotos.forEach(async photo => {
    //     const vote = await  voteService.getVoteCount(photo.id)
    // })

    const votes = await prisma.vote.count({ where: { contestId, photo: { participant: { id: participantId } } } })

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


const getYCLevelByOrder = () => {

    return [

        YCLevel.AMATEUR,
        YCLevel.SUPERIOR,
        YCLevel.SUPREME,
        YCLevel.TALENTED,
        YCLevel.TOP_NOTCH
    ]

}

const getContestLevelRequirements = async (contestId: string) => {
    const contest = await prisma.contest.findUnique({ where: { id: contestId } })
    if (!contest) {
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }
    let ycLevels = getYCLevelByOrder()

    let levels = contest.level_requirements.map((level, idx) => ({ levelName: ycLevels[idx], point: level }))

    return levels
}

const getParticipantLevelData = async (contestId: string, userId: string) => {

    const participant = await prisma.contestParticipant.findFirst({ where: { userId, contestId, } })

    if (!participant) {
        throw new Error("Participant not found")
    }

    const totalVotes = await getParticipantTotalVotes(contestId, participant.id)
    const contestLevelRequirement = await getContestLevelRequirements(contestId)
    let currentLevel = YCLevel.NEW.toString()
    let currentIdx = -1

    contestLevelRequirement.forEach((contestLevel, idx) => {
        if (contestLevel.point <= totalVotes) {
            currentLevel = contestLevel.levelName.toString()
            currentIdx = idx
        } else {
            return
        }
    })


    return { currentLevel, totalVotes, nextLevel: contestLevelRequirement[currentIdx + 1], exposure_bonus: participant.exposure_bonus }

}

const promoteContestPhoto = async (contestId: string, photoId: string, userId: string) => {

    const contest = await prisma.contest.findUnique({ where: { id: contestId, status: ContestStatus.ACTIVE } })

    if (!contest) {
        throw new ApiError(httpstatus.NOT_FOUND, "Contest not found")
    }
    const contestPhoto = await prisma.contestPhoto.findUnique({ where: { id: photoId }, include: { participant: true } })

    if (!contestPhoto) {
        throw new ApiError(httpstatus.NOT_FOUND, "Contest photo not found")
    }

    if (contestPhoto.promoted) {
        throw new ApiError(httpstatus.BAD_REQUEST, "Contest photo is already promoted")
    }

    if (contestPhoto.participant.userId !== userId) {
        throw new ApiError(httpstatus.FORBIDDEN, "You are not allowed to promote this contest photo")
    }

    const promotionExpiresAt = new Date(Date.now() + 30 * 60 * 1000) //30 minutes from now
    const userStore = await userStoreService.getStoreData(userId)

    if (!userStore || userStore.boost <= 0) {
        throw new ApiError(httpstatus.BAD_REQUEST, "You don't have enough trades")
    }
    await prisma.$transaction(async (tx) => {
        // Decrement the user's promotes count
        await tx.userStore.update({
            where: { userId },
            data: { boost: { decrement: 1 } }
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


const getContestParticipants = async (contestId: string) => {
    const contest = await prisma.contest.findUnique({ where: { id: contestId } })

    if (!contest) {
        throw new ApiError(httpstatus.NOT_FOUND, "Contest not found")
    }

    return await prisma.contestParticipant.findMany({ where: { contestId } })

}


const identifyContestTopPhoto = async (contestId: string) => {

    const contest = await prisma.contest.findUnique({ where: { id: contestId } })
    if (!contest) {
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }

    const contestVote = await prisma.contestPhoto.count({ where: { contestId } })

}


const tradePhoto = async (userId: string, contestId: string, contestPhotoId: string, photoId: string, file: Express.Multer.File) => {
    const contestPhoto = await prisma.contestPhoto.findUnique({ where: { id: contestPhotoId, contestId }, include: { photo: true } })

    if (!contestPhoto) {
        throw new ApiError(httpstatus.NOT_FOUND, "contest photo not found")
    }

    const userStore = await userStoreService.getStoreData(userId)
    if (!userStore || userStore.swap <= 0) {
        throw new ApiError(httpstatus.BAD_REQUEST, "you does not have enough trade")
    }
    const result = await prisma.$transaction(async (tx) => {
        const vote = await voteService.getVoteCount(contestPhoto.photo.id)
        await tx.contestPhoto.delete({ where: { id: contestPhoto.id } })

        const uploadedPhoto = await uploadPhotoToContest(contestId, userId, [photoId], file)
        //decrease trade by 1
        await tx.userStore.update({ where: { userId }, data: { swap: { decrement: 1 } } })

        return await tx.contestPhoto.update({ where: { id: uploadedPhoto[0].id }, data: { initialVotes: vote } })
    })
    return result
}

const chargePhoto = async (userId: string, contestId: string, contestPhotoId: string) => {
    const contestPhoto = await prisma.contestPhoto.findUnique({ where: { id: contestPhotoId }, include: { participant: true } })

    if (!contestPhoto) {
        throw new ApiError(httpstatus.NOT_FOUND, "contest photo not found")
    }

    const userStore = await userStoreService.getStoreData(userId)

    if (!userStore || userStore.key <= 0) {
        throw new ApiError(httpstatus.NOT_FOUND, "you does not have enough charge")
    }
    const participant = await prisma.contestParticipant.findUnique({ where: { id: contestPhoto.participant.id } })
    if (!participant) {
        throw new ApiError(httpstatus.NOT_FOUND, "participant not found")
    }

    const newContestPhoto = await prisma.contestParticipant.update({ where: { id: participant.id }, data: { exposure_bonus: 100 } })


    const exposureJob = agenda.create("exposure:watcher", { contestPhotoId: contestPhoto.id })
    exposureJob.repeatEvery("1 minute")
    await exposureJob.save()

    await userStoreService.updateStoreData(userId, { key: -1 })
    return newContestPhoto
}

const getContestPhotosSortedByVote = async (contestId: string, page: number = 1, limit: number = 10) => {

    const contest = await prisma.contest.findUnique({ where: { id: contestId } })

    if (!contest) {
        throw new ApiError(httpstatus.NOT_FOUND, 'Contest not found')
    }

    const { skip, limit: paginationLimit } = paginationHelper.calculatePagination({ page, limit });

    const contestUploads = await prisma.contestPhoto.findMany({ where: { contestId }, include: { participant: { include: { user: { select: { id: true, avatar: true, country: true, fullName: true } } } }, photo: { select: { id: true, url: true } } }, skip, take: paginationLimit })

    const uploadsWithVotes = await Promise.all(contestUploads.map(async upload => {
        const voteCount = await voteService.getVoteCount(upload.id)

        const user = upload.participant.user
        const userPhoto = upload.photo
        return { id: upload.id, voteCount, user, userPhoto: userPhoto }
    }))

    const sortedUploads = uploadsWithVotes.sort((a, b) => b.voteCount - a.voteCount)

    const total = await prisma.contestPhoto.count({ where: { contestId } });
    const paginationMetaData = paginationHelper.getPaginationMetaData(page, paginationLimit, total);

    return { data: sortedUploads, meta: paginationMetaData };
}

const getContestTopPhotographers = async (contestId: string, page: number = 1, limit: number = 20) => {

    const contest = await prisma.contest.findUnique({ where: { id: contestId } })

    if (!contest) {
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }

    const { skip, limit: paginationLimit } = paginationHelper.calculatePagination({ page, limit });

    const contestParticipants = await prisma.contestParticipant.findMany({
        where: { contestId }, skip, take: paginationLimit,
        include: { photos: { select: { photo: { select: { id: true, url: true } }, id: true } }, user: { select: { id: true, avatar: true, fullName: true } } }
    })

    const participantWithVote = await Promise.all(contestParticipants.map(async participant => {
        const photos = participant.photos
        const totalVotes = await voteService.totalVotesOfParticipant(participant.id, contestId)

        const user = participant.user
        const mappedPhotos = await Promise.all(photos.map(async photo => {
            const voteCount = await voteService.getVoteCount(photo.id)

            return { ...photo, voteCount }
        }))

        return { ...participant, user, photos: mappedPhotos, totalVotes }
    }))

    const sortedParticipant = participantWithVote.sort((a, b) => b.totalVotes - a.totalVotes)
    const contesttotalVotes = participantWithVote.reduce((prev, curr) => prev + curr.totalVotes, 0)

    const total = await prisma.contestParticipant.count({ where: { contestId } });
    const paginationMetaData = paginationHelper.getPaginationMetaData(page, paginationLimit, total);

    return { data: { contestTotalVotes: contesttotalVotes, participants: sortedParticipant }, meta: paginationMetaData };

}

const getContestPhotoCount = async (contestId: string) => {
    const photoCount = await prisma.contestPhoto.count({ where: { contestId: contestId } })

    return photoCount
}

const getMatchContests = async (userId: string, page: number = 1, limit: number = 10) => {
    const userTeam = await teamService.getUserTeam(userId)
    if (!userTeam) {
        throw new ApiError(httpstatus.NOT_FOUND, "User is not in any team")
    }

    const pagination = paginationHelper.calculatePagination({ page, limit });

    const [contests, total] = await prisma.$transaction([
        prisma.contest.findMany({
            where: { status: ContestStatus.ACTIVE, mode: ContestMode.TEAM },
            skip: pagination.skip, take: pagination.limit
        }),
        prisma.contest.count({ where: { status: ContestStatus.ACTIVE, mode: ContestMode.TEAM } })
    ])

    const contestIds = contests.map(contest => contest.id)

    const participantCounts = await prisma.contestParticipant.groupBy({
        by: ['contestId'],
        where: { contestId: { in: contestIds }, user: { joinedTeam: { id: userTeam.id } } },
        _count: { contestId: true }
    })

    const countMap = new Map(
        participantCounts.map(item => [
            item.contestId,
            item._count.contestId
        ])
    )

    const contestsWithTeamMemberCount = contests.map(contest => ({
        ...contest,
        teamMemberJoined: countMap.get(contest.id) || 0
    }))

    const meta = paginationHelper.getPaginationMetaData(page, limit, total)

    return { data: contestsWithTeamMemberCount, meta }

}

// Get public contests by status with pagination (no auth required)
const getPublicContestsByStatus = async (status: ContestStatus, page: number = 1, limit: number = 20) => {
    const { skip, limit: paginationLimit } = paginationHelper.calculatePagination({ page, limit });

    const contests = await prisma.contest.findMany({
        where: { status },
        include: {
            creator: {
                select: { id: true, avatar: true, fullName: true, firstName: true, lastName: true, cover: true }
            },
            _count: {
                select: { participants: true, votes: true }
            }
        },
        skip,
        take: paginationLimit,
        orderBy: { startDate: 'desc' }
    });

    const total = await prisma.contest.count({ where: { status } });

    const contestsWithDetails = await Promise.all(contests.map(async (contest) => {
        const rules = await contestRuleService.getContestRules(contest.id);
        const prizes = await getContestPrizes(contest.id);

        const contestData: any = {
            ...contest,
            rules,
            prizes,
            totalParticipants: contest._count.participants,
            totalVotes: contest._count.votes
        };

        if (status === ContestStatus.CLOSED) {
            const winnersData = await getContestWinners(contest.id, 1, 10);
            contestData.winners = winnersData.data;
        }

        return contestData;
    }));

    const meta = paginationHelper.getPaginationMetaData(page, paginationLimit, total);

    return { data: contestsWithDetails, meta };
};






export const contestService = {
    createContest,
    updateContest,
    joinContest,
    getContestById,
    getAllContests,
    getMyActiveContests,
    getContestsByStatus,
    getPublicContestsByStatus,
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
    getContestUploadsToVote,
    getContestPhotoCount,
    getMatchContests,
    getCompletedContestUploads

}