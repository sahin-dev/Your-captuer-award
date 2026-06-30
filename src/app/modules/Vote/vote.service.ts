import httpstatus from 'http-status'
import ApiError from "../../../errors/ApiError"
import prisma from "../../../shared/prisma"
import { ContestStatus, Vote, VoteType } from '../../../prismaClient'
import globalEventHandler from '../../event/eventEmitter'
import Events from '../../event/events.constant'
import { ObjectId } from 'mongodb'
import { notificationOrchestrator } from '../Notification/notificationOrchestrator'
import { participantLevelService } from '../Contest/participantLevel.service'

const checkExistingVote = async (userId:string, contestId:string, photoId:string)=>{
    const exisitngVote = await prisma.vote.findFirst({where:{providerId:userId, contestId, photoId}})

    if(exisitngVote){
        return exisitngVote
    }

    return false
}


const getVoteType = async (photoId:string)=>{
    const contestPhoto = await prisma.contestPhoto.findUnique({where:{id:photoId}})
    let voteType:VoteType = VoteType.Organic

    if(contestPhoto && contestPhoto.promoted)
        voteType = VoteType.Promoted

    return voteType
}

const incrementExposureBonus = async (participantId:string, amount:number) => {
    const participant = await prisma.contestParticipant.findUnique({ where: { id: participantId } })
    if (!participant) {
        throw new ApiError(httpstatus.NOT_FOUND, 'participant not found')
    }

    const updatedBonus = Math.min(100, participant.exposure_bonus + amount)
    return prisma.contestParticipant.update({ where: { id: participantId }, data: { exposure_bonus: updatedBonus } })
}

export const addOneVote = async (userId:string, contestId:string, photoId:string)=>{
    
    const user = await prisma.user.findUnique({where:{id:userId}})
    
     if (!user){
        throw new ApiError(httpstatus.NOT_FOUND, 'User not found')
    }

    const contest = await prisma.contest.findUnique({where:{id:contestId, status:ContestStatus.ACTIVE}})
    
    if (!contest){
        throw new  ApiError(httpstatus.NOT_FOUND, 'contest not found')
    }

    const participant = await prisma.contestParticipant.findFirst({where:{contestId:contest.id, userId}})
    
    if (!participant){
        throw new ApiError(httpstatus.NOT_FOUND, "participant not found")
    }

    const contestPhoto = await prisma.contestPhoto.findFirst({where:{contestId, photo:{id:photoId}}, include:{participant:true}})
    if(!contestPhoto){
        throw new ApiError(httpstatus.NOT_FOUND, "contest photo not found")
    }

    if(userId === contestPhoto.participant.userId){
        throw new ApiError(httpstatus.BAD_REQUEST, "you are not allowed to vote yourself")
    }

    const type = await getVoteType(photoId)

    if(!(await checkExistingVote(userId, contestId, contestPhoto.id))){
    
        const vote = await prisma.vote.create({data:{providerId:userId, contestId, photoId:contestPhoto.id, type}})
        await incrementExposureBonus(participant.id, 2)
        
        // Get total votes for the photo's participant
        const totalVotes = await getVoteCount(photoId)
        
        // Send notification to photo participant about the vote
        await notificationOrchestrator.notifyVoteReceived(
            contestPhoto.participant.id,
            contestPhoto.participant.userId,
            userId,
            totalVotes
        )
        
        // Update participant level and check for level up
        const levelUpdate = await participantLevelService.updateParticipantLevel(contestPhoto.participant.id)
        
        if (levelUpdate.levelChanged && levelUpdate.newLevel) {
            // Send level up notification
            await notificationOrchestrator.notifyLevelUp(
                contestPhoto.participant.id,
                contestPhoto.participant.userId,
                levelUpdate.newLevel,
                totalVotes
            )
        }
        
        // For team matches: increment team member's individual score and team's match score
        // This counts votes received by team members in team contests
        if (contestPhoto.participant.memberId) {
            await prisma.contestParticipant.update({
                where: { id: contestPhoto.participant.id },
                data: { member_score: { increment: 1 } }
            })

            // Also increment the team's score in the active match
            // Find the team member to get their team
            const teamMember = await prisma.teamMember.findUnique({
                where: { id: contestPhoto.participant.memberId }
            })

            if (teamMember) {
                // Find the active team match for this team in this contest
                const activeMatch = await prisma.teamMatch.findFirst({
                    where: {
                        contestId,
                        status: 'ACTIVE',
                        OR: [
                            { team1Id: teamMember.teamId },
                            { team2Id: teamMember.teamId }
                        ]
                    }
                })

                // Increment the appropriate team's score
                if (activeMatch) {
                    if (activeMatch.team1Id === teamMember.teamId) {
                        await prisma.teamMatch.update({
                            where: { id: activeMatch.id },
                            data: { team1_score: { increment: 1 } }
                        })
                    } else {
                        await prisma.teamMatch.update({
                            where: { id: activeMatch.id },
                            data: { team2_score: { increment: 1 } }
                        })
                    }
                }
            }
        }
        
        globalEventHandler.publish(Events.NEW_VOTE,{photoId, contestId})
        return vote
    }
    
}


export const addVotes = async (userId:string,contestId:string, photoIds:string[])=>{

    const user = await prisma.user.findUnique({where:{id:userId}})

     if (!user){
        throw new ApiError(httpstatus.NOT_FOUND, 'User not found')
    }
    const contest = await prisma.contest.findUnique({where:{id:contestId, status:ContestStatus.ACTIVE, participants:{some:{userId}}}})

    if (!contest){
        throw new  ApiError(httpstatus.NOT_FOUND, 'User is not valid to vote')
    }

   
    let votes:Vote[] = [];

    // FIX: Use for...of instead of forEach to properly await async operations
    for (const photoId of photoIds) {
        const vote = await addOneVote(userId, contestId, photoId)
        if (vote) {
            votes.push(vote)
        }
    }

    return votes
}


export const getVoteCount = async (photoId:string)=>{

    const votesCount = await prisma.vote.count({where:{photoId}})

    return votesCount
}


export const getVoteUsers = async (photoId:string)=>{
    const voters = await prisma.vote.findMany({where:{photoId}, include:{provider:true}})

    return voters
}



const getTotalPromotedVotes = async (userId:string)=>{
    const totalPromotedVotes = await prisma.vote.count({where:{photo:{participant:{userId}}, type:VoteType.Promoted}})

    return totalPromotedVotes
}

const getTotalOrganicVotes = async (userId:string)=>{
    const totalOrganicVotes = await prisma.vote.count({where:{photo:{participant:{userId}}, type:VoteType.Organic}})

    return totalOrganicVotes
}

const getTeamTotalVotes = async (contestId:string , teamId:string) => {
    /**
     * TEAM MATCH SCORING SYSTEM
     * 
     * Calculates total team votes by directly counting from Vote collection.
     * 
     * Logic:
     * 1. Find all TeamMembers belonging to this team
     * 2. Find all ContestParticipants in this contest where memberId links to a team member
     * 3. Count all votes received by these participants
     * 4. Returns the sum of all votes = Team's Total Score
     */
    
    // Get all team members
    const teamMembers = await prisma.teamMember.findMany({
        where: { teamId },
        select: { id: true }
    })

    if (!teamMembers || teamMembers.length === 0) {
        return 0
    }

    const memberIds = teamMembers.map(m => m.id)
    console.log(`[getTeamTotalVotes] Team ${teamId} members:`, memberIds)
    
    // Count all votes on photos by contest participants who are team members
    // Direct query: Vote -> ContestPhoto -> ContestParticipant (check memberId)
    const totalVotes = await prisma.vote.count({
        where: {
            contestId,
            photo: {
                participant: {
                    memberId: { in: memberIds }
                }
            }
        }
    })

    console.log(`[getTeamTotalVotes] Total votes for team ${teamId} in contest ${contestId}:`, totalVotes)
    return totalVotes
}

const getUserTotalVotes = async (userId:string) => {

    const totalVote = await prisma.vote.count({where:{photo:{participant:{userId}}}})

    return totalVote
}

const getUserContestSpecificVote = async (contestId:string, userId:string) => {
    const totalVote = await prisma.vote.count({where:{contestId,photo:{participant:{userId}}}})

    return totalVote
}

const getParticipantTotalVotes = async (photos:{id:string, url:string}[])=>{

    const photosWithVotes = await Promise.all(photos.map(async photo => {
        const vote = await getVoteCount(photo.id)
        return {...photo, vote}
    }))

    const totalVotes = photosWithVotes.reduce((prev,curr) => prev + curr.vote,0)

  

    return totalVotes
}

const totalVotesOfParticipant = async (participantId:string, contestId:string)=> {
    const totalVotes = await prisma.vote.count({where:{contestId, photo:{participantId}}})

    return totalVotes
}


const getContestTotalVotes = async (contestId:string)=> {
    const votes = await prisma.vote.count({where:{contestId}})

    return votes
}

/**
 * Get individual team member's score in a contest
 * Only applicable when memberId is set (team matches)
 * Returns the member_score field which tracks votes received by this team member
 */
const getTeamMemberScore = async (participantId: string): Promise<number> => {
    const participant = await prisma.contestParticipant.findUnique({
        where: { id: participantId },
        select: { member_score: true }
    })
    
    return participant?.member_score ?? 0
}

export const voteService = {
    getTotalPromotedVotes,
    getTotalOrganicVotes,
    getTeamTotalVotes,
    getVoteCount,
    getUserTotalVotes,
    getUserContestSpecificVote,
    totalVotesOfParticipant,
    getContestTotalVotes,
    getTeamMemberScore
}