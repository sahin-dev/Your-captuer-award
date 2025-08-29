import { Router } from "express";
import { chatController } from "./chat.controller";
import { UserRole } from "../../../prismaClient";
import auth from "../../middlewares/auth.middleware";

const router = Router()

router.get("/:teamId",auth(UserRole.USER), chatController.getAllChats)



export const charRoutes = router