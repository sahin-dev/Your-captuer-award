import { Router } from "express";
import { userController } from "./user.controller";
import { fileUploader } from "../../../helpers/fileUploader";


const router = Router()


router.post("/", userController.registerUser)

router.post("/avatar", fileUploader.uploadAvatar, userController.uploadAvatar)

export const userRoutes = router
