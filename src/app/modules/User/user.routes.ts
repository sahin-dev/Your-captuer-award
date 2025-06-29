import { Router } from "express";
import { userController } from "./user.controller";
import { fileUploader } from "../../../helpers/fileUploader";
import auth from "../../middlewares/auth.middleware";



const router = Router()


router.post("/", userController.registerUser)
router.get("/", auth(), userController.getUsers)

router.put("/",auth(), fileUploader.uploadAvatar, userController.updateUser)

router.post("/avatar",auth(), fileUploader.uploadAvatar, userController.uploadAvatar)
router.post("/forget-password", userController.forgetPassword)
router.post("/verify-otp", userController.verifyOtp)

router.get("/:userId", auth(), userController.getUserDetails)

export const userRoutes = router
