import prisma from "../../../shared/prisma"
import { Level, LevelRequirementTitle } from "../../../prismaClient"

/**
 * Resolves the user's current value for a given requirement type.
 * To add a new requirement type:
 *   1. Add it to the `LevelRequirementTitle` enum in `prisma/user.prisma`
 *   2. Run `npx prisma db push --schema=./prisma`
 *   3. Add a new case to this switch statement
 */
const getUserRequirementValue = async (userId: string, title: LevelRequirementTitle): Promise<number> => {
    switch (title) {
        case LevelRequirementTitle.votes: {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { totalVotes: true }
            })
            return user?.totalVotes ?? 0
        }
        case LevelRequirementTitle.top_photographer: {
            return await prisma.contestAchievement.count({
                where: {
                    participant: { userId },
                    category: "TOP_PHOTO" // Maps to top photographer/photo awards won
                }
            })
        }
    }
}

/**
 * Checks if a user qualifies for a specific level based on all of its requirements.
 */
const checkUserQualifiesForLevel = async (userId: string, level: Level): Promise<boolean> => {
    if (!level.requirements || level.requirements.length === 0) return true

    for (const req of level.requirements) {
        const value = await getUserRequirementValue(userId, req.title)
        if (value < req.required) {
            return false // AND logic: all requirements must be met
        }
    }
    return true
}

/**
 * 1. updateLevelsForContest(contestId)
 * Find all ContestParticipant records for this contest.
 * Count votes received by this participant's photos in this contest.
 * Add this count to User.totalVotes.
 * Check and update the user's level based on all requirements.
 */
const updateLevelsForContest = async (contestId: string): Promise<void> => {
    // Get all participants in this contest
    const participants = await prisma.contestParticipant.findMany({
        where: { contestId },
        include: {
            photos: {
                select: {
                    id: true
                }
            }
        }
    })

    for (const participant of participants) {
        const photoIds = participant.photos.map(p => p.id)
        if (photoIds.length === 0) continue

        // Count votes received for this participant's photos in this specific contest
        const contestVotes = await prisma.vote.count({
            where: {
                contestId,
                photoId: { in: photoIds }
            }
        })

        // Increment the user's totalVotes in the database (we always update their cumulative votes)
        const updatedUser = await prisma.user.update({
            where: { id: participant.userId },
            data: {
                totalVotes: {
                    increment: contestVotes
                }
            },
            select: {
                id: true,
                totalVotes: true
            }
        })

        // Check and update their global level based on all requirements
        await checkAndUpdateUserLevel(updatedUser.id)
    }
}

/**
 * 2. checkAndUpdateUserLevel(userId)
 * Checks user level requirements against all levels and updates UserLevel / User.currentLevel if changed.
 */
const checkAndUpdateUserLevel = async (userId: string) => {
    // Fetch all levels sorted by order ascending
    const levels = await prisma.level.findMany({
        orderBy: { order: "asc" }
    })

    if (levels.length === 0) return

    // Find the highest level the user qualifies for based on the dynamic requirement checkers.
    let matchedLevel: Level | null = null
    for (const level of levels) {
        const qualifies = await checkUserQualifiesForLevel(userId, level)
        if (qualifies) {
            matchedLevel = level
        }
    }

    if (matchedLevel) {
        // Upsert UserLevel
        await prisma.userLevel.upsert({
            where: { userId },
            create: {
                userId,
                levelId: matchedLevel.id
            },
            update: {
                levelId: matchedLevel.id
            }
        })

        // Update User currentLevel field (stores the level order / level Int value)
        await prisma.user.update({
            where: { id: userId },
            data: {
                currentLevel: matchedLevel.level
            }
        })
    }
}

/**
 * 3. getUserLevelInfo(userId)
 * Returns frontend friendly user level details including current level, next level, and progress percentage.
 */
const getUserLevelInfo = async (userId: string) => {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { totalVotes: true, currentLevel: true }
    })

    if (!user) {
        throw new Error("User not found")
    }

    const levels = await prisma.level.findMany({
        orderBy: { order: "asc" }
    })

    // Find current level matching user's currentLevel property
    let currentLevel = levels.find(l => l.level === user.currentLevel)
    let currentLevelIndex = currentLevel ? levels.indexOf(currentLevel) : -1

    let nextLevel: Level | null = null
    if (currentLevelIndex + 1 < levels.length) {
        nextLevel = levels[currentLevelIndex + 1]
    }

    // Default values if no level is yet achieved
    let currentLevelName = currentLevel ? currentLevel.levelName : "NEW"
    let currentLevelOrder = currentLevel ? currentLevel.order : 0

    let nextLevelName = nextLevel ? nextLevel.levelName : null
    let nextLevelOrder = nextLevel ? nextLevel.order : null

    // Calculate individual requirements progress for next level
    const nextRequirementsProgress = nextLevel
        ? await Promise.all(
              nextLevel.requirements.map(async req => {
                  const currentValue = await getUserRequirementValue(userId, req.title)
                  
                  let currentLevelRequired = 0
                  if (currentLevel) {
                      const curReq = currentLevel.requirements.find(r => r.title === req.title)
                      currentLevelRequired = curReq ? curReq.required : 0
                  }
                  
                  const range = req.required - currentLevelRequired
                  let progress = 0
                  if (range > 0) {
                      const earned = currentValue - currentLevelRequired
                      progress = Math.min(Math.max((earned / range) * 100, 0), 100)
                  } else {
                      progress = currentValue >= req.required ? 100 : 0
                  }

                  return {
                      title: req.title,
                      required: req.required,
                      current: currentValue,
                      progressPercentage: parseFloat(progress.toFixed(2))
                  }
              })
          )
        : []

    // Overall progress is the average of requirement progresses (or 100% if no next level)
    let progressPercentage = 100
    if (nextRequirementsProgress.length > 0) {
        const sum = nextRequirementsProgress.reduce((acc, req) => acc + req.progressPercentage, 0)
        progressPercentage = parseFloat((sum / nextRequirementsProgress.length).toFixed(2))
    }

    return {
        totalVotes: user.totalVotes,
        currentLevel: {
            name: currentLevelName,
            order: currentLevelOrder
        },
        nextLevel: nextLevel ? {
            name: nextLevelName,
            order: nextLevelOrder,
            requirements: nextRequirementsProgress
        } : null,
        progressPercentage: parseFloat(progressPercentage.toFixed(2))
    }
}

export const userLevelService = {
    updateLevelsForContest,
    checkAndUpdateUserLevel,
    getUserLevelInfo
}
