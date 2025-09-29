import { Router } from "express";
import { subscriptionController } from "./subscription.controller";


const router = Router()

router.get("/plans", subscriptionController.getAvailablePlans)


export const subscriptionRoutes = router