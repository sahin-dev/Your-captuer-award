import { Router } from "express";
import { profileController } from "./profile.controlle";
import auth from "../../middlewares/auth.middleware";
import { fileUploader } from "../../../helpers/fileUploader";

const route = Router();

route.get("/photos", auth(), profileController.getMyUploads);
route.post("/photos/upload",auth(), fileUploader.userPhoto, profileController.uploadUserPhoto);
route.get("/stats", auth(), profileController.getUserStates);

export const profileRoutes = route;