import { Router } from "express";
import { userController } from "./user.controller";
import { fileUploader } from "../../../helpers/fileUploader";
import auth from "../../middlewares/auth.middleware";
import validateRequest from "../../middlewares/validation.middleware";
import { userSchema } from "./user.validation";
import { UserRole } from "../../../prismaClient";
import { userStoreController } from "./UserStore/userStore.controller";





const router = Router()



router.get("/", auth(UserRole.ADMIN), userController.getUsers)
router.put("/",auth(),validateRequest(userSchema.updateUserSchema), fileUploader.uploadAvatar, userController.updateUserProfile)
router.patch("/avatar",auth(), fileUploader.uploadAvatar, userController.uploadAvatar)
router.patch("/cover", auth(),fileUploader.uploadCover, userController.uploadCover )
router.post("/forget-password",validateRequest(userSchema.forgetPasswordSchema), userController.forgetPassword)
router.patch("/reset-password",validateRequest(userSchema.resetPasswordSchema), userController.resetPassword)
router.put("/change-password",auth(), validateRequest(userSchema.changePasswordSchema), userController.changePassword)
router.post("/verify-otp",validateRequest(userSchema.verifyOtpSchema), userController.verifyOtp)

router.get("/store", auth(),userStoreController.getStoreData)

router.get("/:userId", auth(UserRole.ADMIN), userController.getUserDetails)
router.patch("/:userId",auth(UserRole.ADMIN),validateRequest(userSchema.updateUserAdminSchema), userController.updateUser)

export const userRoutes = router
