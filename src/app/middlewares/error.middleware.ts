import { Prisma } from "../../prismaClient";
import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { ZodError } from "zod";
import handleZodError from "../../errors/handleZodError";
import parsePrismaValidationError from "../../errors/parsePrismaValidationError";
import ApiError from "../../errors/ApiError";
import multer from "multer";
import { fileUploader } from "../../helpers/fileUploader";
import logger from "../../shared/logger";

// A failed request must not leave its upload behind. Disk-spooled files are
// unlinked and streamed files are deleted from object storage - unless a
// database row already claimed them, in which case the bytes are still in use.
const removeTemporaryUploads = (req: Request) => {
  const request = req as Request & {
    file?: Express.Multer.File;
    files?: Express.Multer.File[] | Record<string, Express.Multer.File[]>;
  };
  const files = request.file
    ? [request.file]
    : Array.isArray(request.files)
      ? request.files
      : Object.values(request.files ?? {}).flat();

  fileUploader.discardUploadedFiles(files).catch((error) => {
    logger.error({ err: error }, "Failed to discard uploads for a failed request");
  });
};


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
  removeTemporaryUploads(req);
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
  else if (err instanceof multer.MulterError) {
    const fileSizeMessage = err.field === "photo"
      ? "Uploaded photo must be 150MB or smaller"
      : err.field === "banner"
        ? "Contest banner must be 150MB or smaller"
        : req.originalUrl.includes("/contests/")
          ? "Each contest photo must be 150MB or smaller"
          : "Uploaded file exceeds the allowed size";
    const uploadMessages:Partial<Record<multer.MulterError["code"], string>> = {
      LIMIT_FILE_SIZE: fileSizeMessage,
      LIMIT_FILE_COUNT: "A maximum of 4 photos can be uploaded at once",
      LIMIT_UNEXPECTED_FILE: "The request contains an unsupported photo field",
    };
    statusCode = err.code === "LIMIT_FILE_SIZE" ? 413 : httpStatus.BAD_REQUEST;
    message = uploadMessages[err.code] || err.message;
    errorSources = [{ type: "UploadError", details: message }];
  }
  // handle prisma client validation errors
  else if (err instanceof Prisma.PrismaClientValidationError) {
    statusCode = httpStatus.BAD_REQUEST;
    message = parsePrismaValidationError(err.message);
    errorSources.push("Prisma Client Validation Error");
  }
  else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2028") {
      statusCode = httpStatus.SERVICE_UNAVAILABLE;
      message = "The photo submission took too long to complete. Please try again";
    } else if (err.code === "P2002") {
      statusCode = httpStatus.CONFLICT;
      message = "This record already exists";
    } else {
      statusCode = httpStatus.BAD_REQUEST;
      message = "The database could not complete this request";
    }
    errorSources = [{ type: "DatabaseError", code: err.code }];
  }
  // Prisma Client Initialization Error
  else if (err instanceof Prisma.PrismaClientInitializationError) {
    statusCode = httpStatus.SERVICE_UNAVAILABLE;
    message =
      "Failed to initialize Prisma Client. Check your database connection or Prisma configuration.";
    errorSources.push("Prisma Client Initialization Error");
  }
  // Prisma Client Rust Panic Error
  else if (err instanceof Prisma.PrismaClientRustPanicError) {
    statusCode = httpStatus.INTERNAL_SERVER_ERROR;
    message =
      "A critical error occurred in the Prisma engine. Please try again later.";
    errorSources.push("Prisma Client Rust Panic Error");
  }
  // Prisma Client Unknown Request Error
  else if (err instanceof Prisma.PrismaClientUnknownRequestError) {
    statusCode = httpStatus.INTERNAL_SERVER_ERROR;
    message = "An unknown error occurred while processing the request.";
    errorSources.push("Prisma Client Unknown Request Error");
  }
  else if (err?.code === "ECONNREFUSED" || err?.message?.includes("querySrv")) {
    statusCode = httpStatus.SERVICE_UNAVAILABLE;
    message = "Database connection failed. Check MongoDB Atlas DNS/network access and DATABASE_URL.";
    errorSources.push("Database Connection Error");
  }
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

  // The request logger writes one line per request. Attaching the error puts
  // its stack on that line - only for server-side failures and database
  // errors, since a normal 4xx (bad input, not found) has nothing to debug.
  const isDatabaseError =
    err instanceof Prisma.PrismaClientKnownRequestError || err instanceof Prisma.PrismaClientValidationError;
  if (statusCode >= 500 || isDatabaseError) {
    res.err = err;
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
