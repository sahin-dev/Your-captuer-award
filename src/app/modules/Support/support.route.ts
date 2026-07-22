import { Router } from "express";
import { supportController } from "./support.controller";
import { supportValidation } from "./support.validation";
import validateRequest from "../../middlewares/validation.middleware";
import auth from "../../middlewares/auth.middleware";
import { UserRole } from "../../../prismaClient";

const router = Router();

// Public route to submit support message
router.post(
  "/",
  validateRequest(supportValidation.createSupportSchema),
  supportController.createSupport
);

// Admin-only routes
router.get("/", auth(UserRole.ADMIN), supportController.getAllSupports);
router.get("/:id", auth(UserRole.ADMIN), supportController.getSupportById);
router.patch(
  "/:id/status",
  auth(UserRole.ADMIN),
  validateRequest(supportValidation.updateSupportStatusSchema),
  supportController.updateSupportStatus
);

export const supportRoutes = router;
