import { Router } from "express";
import { userController } from "./user.controller";
import { fileUploader } from "../../../helpers/fileUploader";
import auth from "../../middlewares/auth.middleware";
import { UserRole } from "@prisma/client";




const router = Router()



router.get("/", auth(UserRole.ADMIN), userController.getUsers)

router.put("/",auth(), fileUploader.uploadAvatar, userController.updateUser)

router.post("/avatar/:userId",auth(), fileUploader.uploadAvatar, userController.uploadAvatar)
router.post("/forget-password", userController.forgetPassword)
router.post("/verify-otp", userController.verifyOtp)

router.get("/:userId", auth(), userController.getUserDetails)
router.patch("/:userId",auth(UserRole.ADMIN), userController.updateUser)

export const userRoutes = router
