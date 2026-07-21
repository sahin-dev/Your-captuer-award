import { Router } from "express";
import auth from "../../middlewares/auth.middleware";
import validateRequest from "../../middlewares/validation.middleware";
import { UserRole } from "../../../prismaClient";
import { prizeController } from "./prize.controller";
import { createPrizeSchema, updatePrizeSchema } from "./prize.validation";

const router = Router();

router.get("/award-definitions", auth(UserRole.ADMIN), prizeController.getAwardDefinitions);

router
  .route("/")
  .post(auth(UserRole.ADMIN), validateRequest(createPrizeSchema), prizeController.createPrize)
  .get(auth(UserRole.ADMIN), prizeController.getPrizes);

router
  .route("/:prizeId")
  .get(auth(UserRole.ADMIN), prizeController.getPrizeById)
  .patch(auth(UserRole.ADMIN), validateRequest(updatePrizeSchema), prizeController.updatePrize)
  .delete(auth(UserRole.ADMIN), prizeController.deletePrize);

export const prizeRoutes = router;

