import express, { Application, NextFunction, Request, Response } from "express";

import httpStatus from "http-status";
import cors from "cors";
import cookieParser from "cookie-parser";
import session from 'express-session'
import passport from 'passport'

import router from "./app/routes";
import ErrorHandler from "./app/middlewares/error.middleware";
import { User } from "@prisma/client";





const app: Application = express();

app.use(session({
  secret:"secret123#ABC",
  resave:false,
  saveUninitialized:false
}))

app.use(passport.initialize())
app.use(passport.session())

declare module "express-serve-static-core" {
  interface Request {
    user: User;
  }
}




export const corsOptions = {
  origin: ["http://localhost:3001", "http://localhost:3000"],
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};



// Middleware setup
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// Route handler for root endpoint



// Router setup
app.use("/api/v1", router);

// Error handling middleware
app.use(ErrorHandler);

// Not found handler
app.use((req: Request, res: Response, next: NextFunction) => {
  res.status(httpStatus.NOT_FOUND).json({
    success: false,
    message: "API NOT FOUND!",
    error: {
      path: req.originalUrl,
      message: "Your requested path is not found!",
    },
  });
});

export default app;
