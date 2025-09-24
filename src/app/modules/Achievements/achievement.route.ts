import { Router } from "express";
import { achieveController } from "./achievement.controller";
import auth from "../../middlewares/auth.middleware";



const router = Router()

router.get("/", auth(),achieveController.getMyAchievements )
router.get("/users/:userId",achieveController.getAchievementByUser)

router.get("/contests/:contestId", achieveController.getAchievementsByContest)

export const achievementRoutes = router