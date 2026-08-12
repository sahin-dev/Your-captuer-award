import { Router } from "express";
import { getStats } from "./stats.controller";

let route = Router();

route.get("/", getStats);

export const statsRoutes = route;
