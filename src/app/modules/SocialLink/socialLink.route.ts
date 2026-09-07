import { Router } from "express";
import { socialLinkController } from "./socialLink.controller";
import { socialLinkValidation } from "./socialLink.validation";
import validateRequest from "../../middlewares/validation.middleware";
import auth from "../../middlewares/auth.middleware";
import { UserRole } from "../../../prismaClient";

const router = Router();

// Public - used by the website footer.
router.get("/", socialLinkController.getActiveSocialLinks);

// Admin management.
router.get("/all", auth(UserRole.ADMIN), socialLinkController.getAllSocialLinks);
router.post(
  "/",
  auth(UserRole.ADMIN),
  validateRequest(socialLinkValidation.createSocialLinkSchema),
  socialLinkController.createSocialLink
);
router.put(
  "/:id",
  auth(UserRole.ADMIN),
  validateRequest(socialLinkValidation.updateSocialLinkSchema),
  socialLinkController.updateSocialLink
);
router.delete("/:id", auth(UserRole.ADMIN), socialLinkController.deleteSocialLink);

export const socialLinkRoutes = router;
