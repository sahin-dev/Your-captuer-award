import { Router } from "express";
import router from "../../routes";
import { profile } from "console";
import { profileController } from "./profile.controlle";
import auth from "../../middlewares/auth.middleware";
import { fileUploader } from "../../../helpers/fileUploader";

const route = Router();

router.get("/photos", auth(), profileController.getMyUploads);
router.post("/photos/upload",auth(), fileUploader.userPhoto, profileController.uploadUserPhoto);
router.get("/states", auth(), profileController.getUserStates);

export const profileRoutes = route;