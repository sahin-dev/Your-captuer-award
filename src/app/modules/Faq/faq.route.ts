import { Router } from "express";
import { UserRole } from "../../../prismaClient";
import auth from "../../middlewares/auth.middleware";
import validateRequest from "../../middlewares/validation.middleware";
import { faqController } from "./faq.controller";
import { faqValidation } from "./faq.validation";

const router = Router();

router.get("/", faqController.getPublicFaqs);
router.get("/all", auth(UserRole.ADMIN), faqController.getAllFaqs);
router.post(
  "/",
  auth(UserRole.ADMIN),
  validateRequest(faqValidation.createFaqSchema),
  faqController.createFaq
);
router.get("/:id", faqController.getFaqById);
router.patch(
  "/:id",
  auth(UserRole.ADMIN),
  validateRequest(faqValidation.updateFaqSchema),
  faqController.updateFaq
);
router.delete("/:id", auth(UserRole.ADMIN), faqController.deleteFaq);

export const faqRoutes = router;
