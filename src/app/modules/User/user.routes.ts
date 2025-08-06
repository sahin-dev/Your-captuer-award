import { Router } from "express";
import { userController } from "./user.controller";
import { fileUploader } from "../../../helpers/fileUploader";
import auth from "../../middlewares/auth.middleware";
import validateRequest from "../../middlewares/validation.middleware";
import { userSchema } from "./user.validation";
import { UserRole } from "../../../prismaClient";





const router = Router()



router.get("/", auth(UserRole.ADMIN), userController.getUsers)

router.put("/",auth(),validateRequest(userSchema.updateUserSchema), fileUploader.uploadAvatar, userController.updateUser)

router.patch("/avatar",auth(), fileUploader.uploadAvatar, userController.uploadAvatar)
router.patch("/cover", auth(),fileUploader.uploadCover, userController.uploadCover )
router.post("/forget-password", userController.forgetPassword)
router.post("/reset-password",validateRequest(userSchema.resetPasswordSchema), userController.resetPassword)
router.post("/verify-otp", userController.verifyOtp)

router.get("/:userId", auth(), userController.getUserDetails)
router.patch("/:userId",auth(UserRole.ADMIN), userController.updateUser)

export const userRoutes = router
