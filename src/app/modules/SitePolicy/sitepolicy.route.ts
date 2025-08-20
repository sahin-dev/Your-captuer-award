import { Router } from "express";
import { SitePolicyController } from "./sitepolicy.controller";
import auth from "../../middlewares/auth.middleware";
import { UserRole } from "../../../prismaClient";

const route = Router()

route.get("/", SitePolicyController.getAllPolicies);
route.post("/",auth(UserRole.ADMIN), SitePolicyController.addOrUpdateSitePolicy);

export const sitePolicyRoutes = route;