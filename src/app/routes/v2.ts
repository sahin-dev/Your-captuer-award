import {Router} from "express";


const v2Router = Router()

const moduleRoutes: { path: string; route: Router }[] = [
    

]

moduleRoutes.forEach((route) => v2Router.use(route.path, route.route));
export default v2Router
