import { Router } from "express";
import { fileUploader } from "../../../helpers/fileUploader";
import { UserRole } from "../../../prismaClient";
import auth from "../../middlewares/auth.middleware";
import validateRequest from "../../middlewares/validation.middleware";
import { createContestSchema, updateContestSchema } from "../Contest/contest.validation";
import { photographyOfTheYearController } from "./photographyOfTheYear.controller";
import { submitJudgingResultsSchema } from "./photographyOfTheYear.validation";

const router = Router();

router.get("/", photographyOfTheYearController.getContests);
router.post(
  "/",
  auth(UserRole.ADMIN),
  fileUploader.contestBanner,
  validateRequest(createContestSchema),
  photographyOfTheYearController.create,
);
router.put(
  "/:contestId",
  auth(UserRole.ADMIN),
  fileUploader.contestBanner,
  validateRequest(updateContestSchema),
  photographyOfTheYearController.update,
);
router.get(
  "/:contestId/judging-result",
  auth(UserRole.ADMIN),
  photographyOfTheYearController.getJudgingResult,
);
router.put(
  "/:contestId/judging-result",
  auth(UserRole.ADMIN),
  validateRequest(submitJudgingResultsSchema),
  photographyOfTheYearController.submitJudgingResults,
);
router.post("/:contestId/join", auth(), photographyOfTheYearController.join);
router.post(
  "/:contestId/upload",
  auth(),
  fileUploader.contestPhotos,
  photographyOfTheYearController.upload,
);
router.get("/:contestId/ranking", photographyOfTheYearController.getRanking);
router.get("/:contestId/me", auth(), photographyOfTheYearController.getMyEntry);
router.get("/:contestId/ranking/photographers", photographyOfTheYearController.getPhotographerRanking);

export const photographyOfTheYearRoutes = router;
