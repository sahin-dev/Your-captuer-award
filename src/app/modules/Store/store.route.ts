import { Router } from "express";
import auth from "../../middlewares/auth.middleware";
import { storeController } from "./store.controller";
import { UserRole } from "../../../prismaClient";


const router = Router()

router.get("/", auth(), storeController.getAllProducts)
router.post("/", auth(UserRole.ADMIN), storeController.addStoreProduct)
router.get("/:productId", auth(), storeController.getProductDetails)
router.patch("/:productId", auth(UserRole.ADMIN), storeController.updateStoreProduct)
router.delete("/:productId", auth(UserRole.ADMIN), storeController.deleteStoreProduct)

export const storeRoutes = router