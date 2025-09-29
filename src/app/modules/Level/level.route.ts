import { Router } from "express";
import auth from "../../middlewares/auth.middleware";
import { levelController } from "./level.controller";

const router = Router()

router.post("/", auth(), levelController.addLevel)
router.get("/", auth(), levelController.getLevels)

export const levelRoutes = router