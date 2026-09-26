import { Router } from "express";
import { profileController } from "./profile.controlle";
import auth, { optionalAuth } from "../../middlewares/auth.middleware";
import { fileUploader } from "../../../helpers/fileUploader";
import validateRequest from "../../middlewares/validation.middleware";
import { profileSchema } from "./profile.validation";

const route = Router();

// Own photo routes
route.get("/photos", auth(), profileController.getMyUploads);
route.post("/photos/upload", auth(), fileUploader.filesystemUploadUserPhoto, profileController.uploadUserPhoto);
route.post("/photos/direct-upload-url", auth(), profileController.createDirectUploadUrl);
route.post("/photos/confirm-upload", auth(), profileController.confirmDirectUpload);
route.get("/photos/:photoId", auth(), profileController.getUserPhotoDetails);
route.delete("/photos/:photoId", auth(), profileController.deleteUserPhoto);
route.patch("/photos/:photoId/labels", auth(), validateRequest(profileSchema.updatePhotoLabelsSchema), profileController.updatePhotoLabels);
route.get("/stats", auth(), profileController.getUserStates);

// Public user profile routes
route.get("/users/:id", optionalAuth(), profileController.getUserPhotos);
route.get("/users/:id/stats", optionalAuth(), profileController.getUserPublicStates);
route.get("/users/:id/profile", optionalAuth(), profileController.getUserPublicProfile);
route.get("/users/:id/photos/:photoId", optionalAuth(), profileController.getPublicPhotoDetails);

export const profileRoutes = route;
