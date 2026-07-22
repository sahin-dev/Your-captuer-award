import { Router } from "express";
import { profileController } from "./profile.controlle";
import auth from "../../middlewares/auth.middleware";
import { fileUploader } from "../../../helpers/fileUploader";

const route = Router();

// Own photo routes
route.get("/photos", auth(), profileController.getMyUploads);
route.post("/photos/upload", auth(), fileUploader.filesystemUploadUserPhoto, profileController.uploadUserPhoto);
route.get("/photos/:photoId", auth(), profileController.getUserPhotoDetails);
route.delete("/photos/:photoId", auth(), profileController.deleteUserPhoto);
route.get("/stats", auth(), profileController.getUserStates);

// Public user profile routes
route.get("/users/:id", auth(), profileController.getUserPhotos);
route.get("/users/:id/stats", auth(), profileController.getUserPublicStates);
route.get("/users/:id/profile", auth(), profileController.getUserPublicProfile);
route.get("/users/:id/photos/:photoId", auth(), profileController.getPublicPhotoDetails);

export const profileRoutes = route;