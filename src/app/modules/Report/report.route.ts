import { Router } from "express";
import { reportController } from "./report.controller";
import { reportValidation } from "./report.validation";
import validateRequest from "../../middlewares/validation.middleware";
import auth from "../../middlewares/auth.middleware";
import { UserRole } from "../../../prismaClient";

const router = Router();

// Any authenticated user can report another user (optionally referencing a contest photo).
router.post("/", auth(), validateRequest(reportValidation.createReportSchema), reportController.createReport);

// Admin-only review queue.
router.get("/", auth(UserRole.ADMIN), reportController.getReports);
router.get("/:id", auth(UserRole.ADMIN), reportController.getReportById);
router.patch(
  "/:id/review",
  auth(UserRole.ADMIN),
  validateRequest(reportValidation.reviewReportSchema),
  reportController.reviewReport
);

export const reportRoutes = router;
