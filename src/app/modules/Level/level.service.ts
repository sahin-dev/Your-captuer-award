import ApiError from "../../../errors/ApiError"
import { LevelName, LevelRequirement, VoteType } from "../../../prismaClient"
import prisma from "../../../shared/prisma"
import httpStatus from 'http-status'
import { LEVEL_BADGE_TYPES, LEVEL_RULES, LevelRule } from "./level.config"
import { getVoteWeightStats } from "../Vote/voteWeight.service"



// model Level {
//   id         String @id @default(auto()) @map("_id") @db.ObjectId
//   level       Int
//   levelName   LevelName
//   requirements    LevelRequirement[]

//   createdAt DateTime @default(now())
//   updatedAt DateTime @updatedAt

//   UserLevel UserLevel[]
// }

const addLevel = async (order:number, name:LevelName, requirements:LevelRequirement[])=>{

    const level = await prisma.level.create({data:{level:order, levelName:name, requirements}})

    return level
}   

const editLevel = async (levelId:string, newRequirements:{title:string, required:number}[])=>{
    const level = await prisma.level.findUnique({where:{id:levelId}})
    if(!level){
        throw new ApiError(httpStatus.NOT_FOUND, "level not found")
    }

        
    let editedrequirements = level.requirements.map( savedRequirement => {
        
        let newR = newRequirements.find( r => r.title === savedRequirement.title)
        if(newR)
            savedRequirement.required = newR.required

        return savedRequirement
    })

    await prisma.level.update({where:{id:levelId}, data:{requirements:editedrequirements}})
}

const deleteLevl  =async (levelId:string)=> {
    const level = await prisma.level.delete({where:{id:levelId}})
    return level
}

const getLevels = async (page = 1, limit = 20)=>{
    const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 20
    const skip = (safePage - 1) * safeLimit

    const [levels, total] = await Promise.all([
        prisma.level.findMany({orderBy:{level:"asc"}, skip, take:safeLimit}),
        prisma.level.count()
    ])

    return {
        data:levels,
        meta:{page:safePage, limit:safeLimit, total}
    }
}



const getLevelByOrder = async (order:number) => {
    const level = await prisma.level.findFirst({where:{level:order}})

    return level
}

const getLevelByLevelName = async (levelName:LevelName) => {
    const level = await prisma.level.findFirst({where:{levelName}})
    return level
}

const getLevelRuleByOrder = (order:number) => {
    return LEVEL_RULES.find(rule => rule.order === order)
}

const getBadgeCounts = async (userId:string) => {
    const badgeCounts:Record<string, number> = {}

    await Promise.all(LEVEL_BADGE_TYPES.map(async category => {
        badgeCounts[category] = await prisma.contestAchievement.count({
            where:{
                category,
                participant:{userId}
            }
        })
    }))

    return badgeCounts
}

const getReceivedVoteStats = async (userId:string) => {
    const receivedVoteAggregate = await getVoteWeightStats({photo:{participant:{userId}}})
    const promotedVoteAggregate = await getVoteWeightStats({photo:{participant:{userId}}, type:VoteType.Promoted})

    return {
        receivedVotes: receivedVoteAggregate.weight,
        receivedVoteCount: receivedVoteAggregate.count,
        promotedVotes: promotedVoteAggregate.weight,
        promotedVoteCount: promotedVoteAggregate.count,
    }
}

const sumBadgeCount = (badgeCounts:Record<string, number>, categories:string[]) => {
    return categories.reduce((sum, category) => sum + (badgeCounts[category] || 0), 0)
}

const isRuleSatisfied = (
    rule:LevelRule,
    stats:{receivedVotes:number; promotedVotes:number; badgeCounts:Record<string, number>}
) => {
    const badgesSatisfied = rule.badges.every(badge => {
        return sumBadgeCount(stats.badgeCounts, badge.categories) >= badge.required
    })

    return stats.receivedVotes >= rule.receivedVotes &&
        stats.promotedVotes >= rule.promotedVotes &&
        badgesSatisfied
}

const buildLevelProgress = (
    rule:LevelRule,
    stats:{receivedVotes:number; promotedVotes:number; badgeCounts:Record<string, number>}
) => {
    const requirements = [
        {
            type:"received_votes",
            required:rule.receivedVotes,
            current:stats.receivedVotes,
            percentage:Math.min(100, Math.floor((stats.receivedVotes * 100) / rule.receivedVotes)),
            satisfied:stats.receivedVotes >= rule.receivedVotes
        },
        {
            type:"promoted_votes",
            required:rule.promotedVotes,
            current:stats.promotedVotes,
            percentage:Math.min(100, Math.floor((stats.promotedVotes * 100) / rule.promotedVotes)),
            satisfied:stats.promotedVotes >= rule.promotedVotes
        },
        ...rule.badges.map(badge => {
            const current = sumBadgeCount(stats.badgeCounts, badge.categories)
            return {
                type:"badge",
                badges:badge.categories,
                required:badge.required,
                current,
                percentage:Math.min(100, Math.floor((current * 100) / badge.required)),
                satisfied:current >= badge.required
            }
        })
    ]

    return {
        order:rule.order,
        name:rule.levelName,
        votePower:rule.votePower,
        eligible:requirements.every(requirement => requirement.satisfied),
        requirements
    }
}

const getEligibleLevel = (
    stats:{receivedVotes:number; promotedVotes:number; badgeCounts:Record<string, number>}
) => {
    let eligibleLevel:LevelRule | null = null

    LEVEL_RULES.forEach(rule => {
        if(isRuleSatisfied(rule, stats)){
            eligibleLevel = rule
        }
    })

    return eligibleLevel
}

const persistUserLevel = async (userId:string, eligibleLevel:LevelRule | null) => {
    const user = await prisma.user.findUnique({where:{id:userId}})

    if(!user){
        throw new ApiError(httpStatus.NOT_FOUND, "user not found")
    }

    const eligibleOrder = eligibleLevel?.order ?? -1
    const targetOrder = Math.max(user.currentLevel ?? -1, eligibleOrder)
    const targetRule = getLevelRuleByOrder(targetOrder)
    const targetVotePower = targetRule?.votePower ?? user.voting_power ?? 1

    await prisma.user.update({
        where:{id:userId},
        data:{
            currentLevel:targetOrder,
            voting_power:targetVotePower
        }
    })

    if(targetRule){
        const level = await prisma.level.findFirst({
            where:{OR:[{level:targetRule.order}, {levelName:targetRule.levelName}]}
        })

        if(level){
            await prisma.userLevel.upsert({
                where:{userId},
                update:{levelId:level.id},
                create:{userId, levelId:level.id}
            })
        }
    }

    return {
        order:targetOrder,
        name:targetRule?.levelName ?? "NEW",
        votingPower:targetVotePower
    }
}

const evaluateAndUpdateUserLevel = async (userId:string) => {
    const voteStats = await getReceivedVoteStats(userId)
    const badgeCounts = await getBadgeCounts(userId)
    const stats = {...voteStats, badgeCounts}
    const eligibleLevel = getEligibleLevel(stats)
    const currentStatus = await persistUserLevel(userId, eligibleLevel)
    const levels = LEVEL_RULES.map(rule => buildLevelProgress(rule, stats))

    return {
        currentStatus:{
            ...currentStatus,
            receivedVotes:voteStats.receivedVotes,
            receivedVoteCount:voteStats.receivedVoteCount,
            promotedVotes:voteStats.promotedVotes,
            promotedVoteCount:voteStats.promotedVoteCount,
            badges:badgeCounts
        },
        nextLevel:levels.find(rule => rule.order > currentStatus.order) || null,
        levels
    }
}
export const levelService =  {
    addLevel,
    editLevel,
    deleteLevl,
    getLevels,
    getLevelByOrder,
    evaluateAndUpdateUserLevel,
    getReceivedVoteStats,
    getBadgeCounts,
    getLevelByLevelName,
}
