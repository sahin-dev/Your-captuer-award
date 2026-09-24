import { LevelName } from "../../../prismaClient"
import prisma from "../../../shared/prisma"
import globalEventHandler from "../eventEmitter"
import Events from "../events.constant"
import logger from "../../../shared/logger"

globalEventHandler.on(Events.USER_REGISTERED, async (user: { id: string }) => {
    try {
        const apprenticeLevel = await prisma.level.findFirst({
            where: { levelName: LevelName.APPRENTICE }
        })
        if (!apprenticeLevel) {
            logger.warn("APPRENTICE level not found in DB, skipping assignment")
            return
        }

        // Upsert UserLevel record
        await prisma.userLevel.upsert({
            where: { userId: user.id },
            create: { userId: user.id, levelId: apprenticeLevel.id },
            update: { levelId: apprenticeLevel.id }
        })

        // Update User currentLevel index
        await prisma.user.update({
            where: { id: user.id },
            data: { currentLevel: apprenticeLevel.level }
        })

        logger.debug({ userId: user.id }, "Assigned APPRENTICE level")
    } catch (err) {
        logger.error({ err, userId: user.id }, "Failed to assign APPRENTICE level")
    }
})
