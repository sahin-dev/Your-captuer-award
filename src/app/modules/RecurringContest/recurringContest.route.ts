import { Router } from "express";
import auth from "../../middlewares/auth.middleware";
import validateRequest from "../../middlewares/validation.middleware";
import { UserRole } from "../../../prismaClient";
import { recurringContestController } from "./recurringContest.controller";
import {
  replaceRecurringAwardsSchema,
  replaceRecurringLevelAwardsSchema,
  updateRecurringContestSchema,
  updateRecurringIntervalSchema,
} from "./recurringContest.validation";

const router = Router();

router.get("/", auth(UserRole.ADMIN), recurringContestController.getRecurringContests);

router.patch(
  "/:recurringContestId/interval",
  auth(UserRole.ADMIN),
  validateRequest(updateRecurringIntervalSchema),
  recurringContestController.updateRecurringInterval
);
router.patch("/:recurringContestId/pause", auth(UserRole.ADMIN), recurringContestController.pauseRecurringContest);
router.patch("/:recurringContestId/resume", auth(UserRole.ADMIN), recurringContestController.resumeRecurringContest);
router.patch("/:recurringContestId/end", auth(UserRole.ADMIN), recurringContestController.endRecurringContest);
router.get("/:recurringContestId/contests", auth(UserRole.ADMIN), recurringContestController.getGeneratedContests);
router
  .route("/:recurringContestId/awards")
  .get(auth(UserRole.ADMIN), recurringContestController.getRecurringAwards)
  .put(auth(UserRole.ADMIN), validateRequest(replaceRecurringAwardsSchema), recurringContestController.replaceRecurringAwards);
router
  .route("/:recurringContestId/level-awards")
  .get(auth(UserRole.ADMIN), recurringContestController.getRecurringLevelAwards)
  .put(auth(UserRole.ADMIN), validateRequest(replaceRecurringLevelAwardsSchema), recurringContestController.replaceRecurringLevelAwards);

router
  .route("/:recurringContestId")
  .get(auth(UserRole.ADMIN), recurringContestController.getRecurringContestById)
  .patch(
    auth(UserRole.ADMIN),
    validateRequest(updateRecurringContestSchema),
    recurringContestController.updateRecurringContest
  );

export const recurringContestRoutes = router;

