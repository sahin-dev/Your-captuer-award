import { Router } from "express";
import { dashboardController } from "./dashboard.controller";
import auth from "../../middlewares/auth.middleware";
import { UserRole } from "../../../prismaClient";


const route = Router()

// Payment and Income Routes
route.get("/payments", auth(UserRole.ADMIN), dashboardController.getAllAPymentHistory)
route.get("/transactions", auth(UserRole.ADMIN), dashboardController.getTransactions)
route.get("/transactions/stats", auth(UserRole.ADMIN), dashboardController.getTransactionStats)

// Income Routes by Year
route.get("/income/pro-premium/:year",auth(UserRole.ADMIN), dashboardController.getProPreminumIncomeByYear)
route.get("/income/:year",auth(UserRole.ADMIN), dashboardController.calcIncomeDataByYear)

// Contest and Member Routes
route.get("/contest/stats",auth(UserRole.ADMIN), dashboardController.getContestStats)
route.get("/member-ratio/:year",auth(UserRole.ADMIN), dashboardController.getMemberRatio)

// Overview and Stats Routes
route.get("/overview",auth(UserRole.ADMIN), dashboardController.getDashboardOverview)
route.get("/user-stats", auth(UserRole.ADMIN), dashboardController.getUserStats)

// User Management Routes
route.get("/all-users", auth(UserRole.ADMIN), dashboardController.getAllUsers)
route.patch("/toggole-block", auth(UserRole.ADMIN), dashboardController.toggleBlockStatus)

// Notifications Route
route.get("/notifications", auth(UserRole.ADMIN), dashboardController.getAdminNotifications)

// Store Routes
route.get("/store/stats", auth(UserRole.ADMIN), dashboardController.getStoreStats)

// Subscription Plans Routes
route.get("/plans", auth(UserRole.ADMIN), dashboardController.getPlans)
// route.get("/plans/stats", auth(UserRole.ADMIN), dashboardController.getPlansStats)
route.get("/plans/stats", auth(UserRole.ADMIN), dashboardController.getSubscriptionStats)

// Subscription Plans CRUD Routes
route.post("/subscription-plans", auth(UserRole.ADMIN), dashboardController.createSubscriptionPlan)
route.get("/subscription-plans", auth(UserRole.ADMIN), dashboardController.getAllSubscriptionPlans)
route.get("/subscription-plans/:id", auth(UserRole.ADMIN), dashboardController.getSubscriptionPlanById)
route.patch("/subscription-plans/:id", auth(UserRole.ADMIN), dashboardController.updateSubscriptionPlan)
route.delete("/subscription-plans/:id", auth(UserRole.ADMIN), dashboardController.deleteSubscriptionPlan)

export const dashboardRoutes = route
