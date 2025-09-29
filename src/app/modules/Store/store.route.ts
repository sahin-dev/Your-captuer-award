import { Router } from "express";
import auth from "../../middlewares/auth.middleware";
import { storeController } from "./store.controller";
import { UserRole } from "../../../prismaClient";


const router = Router()

router.get("/", auth(), storeController.getAllProducts)
router.post("/", auth(UserRole.ADMIN), storeController.addStoreProduct)

export const storeRoutes = router