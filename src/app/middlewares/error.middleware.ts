import { Prisma } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { ZodError } from "zod";
import handleZodError from "../../errors/handleZodError";
import parsePrismaValidationError from "../../errors/parsePrismaValidationError";
import ApiError from "../../errors/ApiError";


// TODO Replace `config.NODE_ENV` with your actual environment configuration

// TODO
const config = {
  NODE_ENV: process.env.NODE_ENV || "development",
};

const ErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let statusCode: any = httpStatus.INTERNAL_SERVER_ERROR;
  let message = err.message || "Something went wrong!";
  let errorSources:any = [];
  let errorDetails = err || null;

  // Handle Zod Validation Errors
  if (err instanceof ZodError) {
    const simplifiedError = handleZodError(err || []);
    statusCode = simplifiedError?.statusCode;
    message = simplifiedError?.message;
    errorSources = simplifiedError?.errorSources;
  }
  // Handle Custom ApiError
  else if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    errorSources = [{ type: "ApiError", details: err.message }];
  }
  // handle prisma client validation errors
  // Note: These error types don't exist in @prisma/client v6.18.0
  // Prisma error handling can be added here when using compatible versions
  // Generic Error Handling (e.g., JavaScript Errors)
  else if (err instanceof SyntaxError) {
    statusCode = httpStatus.BAD_REQUEST;
    message = "Syntax error in the request. Please verify your input.";
    errorSources.push("Syntax Error");
  } else if (err instanceof TypeError) {
    statusCode = httpStatus.BAD_REQUEST;
    message = "Type error in the application. Please verify your input.";
    errorSources.push("Type Error");
  } else if (err instanceof ReferenceError) {
    statusCode = httpStatus.BAD_REQUEST;
    message = "Reference error in the application. Please verify your input.";
    errorSources.push("Reference Error");
  }
  // Catch any other error type
  else {
    message = "An unexpected error occurred!";
    errorSources.push("Unknown Error");
  }

  res.status(statusCode).json({
    success: false,
    message,
    errorSources,
    err,
    stack: config.NODE_ENV === "development" ? err?.stack : null,
  });
};

export default ErrorHandler;
