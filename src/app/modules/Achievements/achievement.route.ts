import { Router } from "express";
import { achieveController } from "./achievement.controller";


const router = Router()

router.get("/achievements/contests/:contestId/users/:userId",achieveController.getAchievementByUser)

router.get("/achievements/contests/:contestId", achieveController.getAchievementsByContest)



export const achievementRoutes = router