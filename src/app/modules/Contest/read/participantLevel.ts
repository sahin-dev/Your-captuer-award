import httpstatus from "http-status";
import ApiError from "../../../../errors/ApiError";
import prisma from "../../../../shared/prisma";
import { ycLevels } from "../../Awards/award.definitions";
import { voteService } from "../../Vote/vote.service";
import { contestRankingService } from "../ContestRanking/contestRanking.service";
import { contestRuleEngine } from "../ContestRules/contestRule.engine";

const getParticipantTotalVotes =  async(contestId:string, participantId:string)=>{

    const votes = await voteService.totalVotesOfParticipant(participantId, contestId)
    
    return votes
}

const getYCLevelByOrder = ()=>{

    return [
       
        ycLevels.AMATEUR,
        ycLevels.TALENTED,
        ycLevels.SUPREME,
        ycLevels.SUPERIOR,
        ycLevels.TOP_NOTCH
    ]
    
}

const getContestLevelRequirements = async (contestId:string)=>{
    const contest = await prisma.contest.findUnique({where:{id:contestId}})
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }
    let ycLevels = getYCLevelByOrder()
    const configuredLevels = await contestRuleEngine.getLevelRequirements(contestId)

    let levels = configuredLevels.map((level, idx) => ({levelName:ycLevels[idx], point: level.votes, displayLevel: level.level}))

    return levels
}

export const getParticipantLevelData = async (contestId:string,userId:string)=>{

    const participant = await prisma.contestParticipant.findFirst({where:{userId, contestId,}})

    if (!participant){
        throw new ApiError(httpstatus.NOT_FOUND, "Participant not found")
    }

    const totalVotes = await getParticipantTotalVotes(contestId, participant.id)
    const contestLevelRequirement = await getContestLevelRequirements(contestId)
    let currentLevel = ycLevels.NEW.toString()
    let currentIdx = -1
    
    contestLevelRequirement.forEach( (contestLevel,idx) => {
        if(contestLevel.point <= totalVotes){
            currentLevel = contestLevel.levelName.toString()
            currentIdx = idx
        }else {
            return
        }
    })

    const ranking = await contestRankingService.buildContestRanking(contestId)
    const photographerRanking = ranking.photographers.find(photographer => photographer.participantId === participant.id)

    return {
        currentLevel,
        totalVotes,
        nextLevel:contestLevelRequirement[currentIdx+1],
        exposure_bonus: participant.exposure_bonus,
        rank: photographerRanking?.rank ?? null,
        totalParticipants: ranking.photographers.length
    }

}
