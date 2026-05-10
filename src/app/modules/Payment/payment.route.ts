import { Router } from "express";
import { PaymentController, paymentController } from "./payment.controller";
import auth from "../../middlewares/auth.middleware";
import { UserRole } from "../../../prismaClient";

class PaymentRouter {
    public router:Router
    private paymentController:PaymentController

    constructor (){
        this.router = Router()
        this.paymentController = paymentController
        this.registerRoutes()
    }

    private registerRoutes(){
        // Payment initiation
        this.router.post("/", auth(), this.paymentController.pay)
        
        // Get user's payment history
        this.router.get("/history", auth(), this.paymentController.getUserPayments)
        
        // Get payment details
        this.router.get("/:paymentId", auth(), this.paymentController.getPaymentDetails)
        
        // Cancel payment
        this.router.post("/:paymentId/cancel", auth(), this.paymentController.cancelPayment)
        
        // Refund payment (admin only)
        this.router.post("/:paymentId/refund", auth(UserRole.ADMIN), this.paymentController.refundPayment)
        
        // Capture payment (admin only)
        this.router.post("/:paymentId/capture", auth(UserRole.ADMIN), this.paymentController.capturePayment)
    }
}


export const paymentRouter = new PaymentRouter()

