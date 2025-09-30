import { Router } from "express";
import { dashboardController } from "./dashboard.controller";
import auth from "../../middlewares/auth.middleware";
import { UserRole } from "../../../prismaClient";
import router from "../../routes";


const route = Router()

route.get("/payments", auth(UserRole.ADMIN), dashboardController.getAllAPymentHistory)
route.get("/income/pro-premium/:year",auth(UserRole.ADMIN), dashboardController.getProPreminumIncomeByYear)
route.get("/income/:year",auth(UserRole.ADMIN), dashboardController.calcIncomeDataByYear)
route.get("/contest/stats",auth(UserRole.ADMIN), dashboardController.getContestStats)
route.get("/member-ratio/:year",auth(UserRole.ADMIN), dashboardController.getMemberRatio)
route.get("/overview",auth(UserRole.ADMIN), dashboardController.getDashboardOverview)
route.get("/notifications", auth(UserRole.ADMIN), dashboardController.getAdminNotifications)
route.get("/user-stats", auth(UserRole.ADMIN), dashboardController.getUserStats)
route.get("/all-users", auth(UserRole.ADMIN), dashboardController.getAllUsers)

export const dashboardRoutes = route
