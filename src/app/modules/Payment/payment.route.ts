import { Router } from "express";
import { PaymentController, paymentController } from "./payment.controller";
import auth from "../../middlewares/auth.middleware";

class PaymentRouter {
    public router:Router
    private paymentController:PaymentController

    constructor (){
        this.router = Router()
        this.paymentController = paymentController
        this.registerRoutes()
    }

    private registerRoutes(){
        this.router.post("/init",auth(), this.paymentController.pay)
    }
}


export const paymentRouter = new PaymentRouter()

