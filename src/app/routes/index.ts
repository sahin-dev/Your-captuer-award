import { Router } from "express";
import path from "path";
import { userRoutes } from "../modules/User/user.routes";
import { authRoutes } from "../modules/Auth/auth.route";



const router = Router()

const moduleRoutes = [
    {path:"/users", route:userRoutes},
    {path:"/auth", route:authRoutes}

]

moduleRoutes.forEach((route) => router.use(route.path, route.route));
export default router