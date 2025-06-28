import { Router } from "express";
import path from "path";


const router = Router()

const moduleRoutes = [

]

moduleRoutes.forEach((route) => router.use(route.path, route.route));
export default router