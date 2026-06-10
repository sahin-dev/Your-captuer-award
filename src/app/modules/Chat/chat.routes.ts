import { Router } from "express";
import { chatController } from "./chat.controller";
import { UserRole } from "../../../prismaClient";
import auth from "../../middlewares/auth.middleware";
import { fileUploader } from "../../../helpers/fileUploader";

const router = Router()

router.get("/:teamId",auth(), chatController.getAllChats)

router.post("/upload", auth(), fileUploader.filesystemUpload.single("file"), chatController.uploadChatFile)

export const charRoutes = router