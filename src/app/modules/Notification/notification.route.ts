import { Router } from "express";
import auth from "../../middlewares/auth.middleware";
import { notificationController } from "./notification.controller";

const router = Router()

router.get("/users", auth(), notificationController.getUserNotifications)
router.get("/admins", auth(), notificationController.getAdminNotification)
router.patch("/read", auth(), notificationController.markAllRead)

export const notificationRoutes = router
