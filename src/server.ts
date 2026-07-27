import { Server } from "http";
import config from "./config";
import app from "./app";
import agenda, { startAgenda } from "./app/modules/Agenda";
import prisma from "./shared/prisma";
import WebSocketHandler from "./socket";

let server: Server | undefined;
let isShuttingDown = false;
const PORT = config.port || 5003;

const getErrorMessage = (error:unknown) => {
  if(error instanceof Error){
    return error.message;
  }

  return String(error);
}

const logDatabaseConnectionHint = (error:unknown) => {
  const message = getErrorMessage(error);

  if(message.includes("querySrv") || message.includes("ECONNREFUSED")){
    console.error("Database connection failed during MongoDB SRV lookup.");
    console.error("Please verify DATABASE_URL, DNS/network access, and MongoDB Atlas network access settings.");
  }
}

async function startServer() {
  try{
      await prisma.$connect();
  }catch(err){
    // console.log(err)
    throw new Error("Failed to connect to the database. Please check your DATABASE_URL and ensure the database is running.");
  }


  server = app.listen(PORT, () => {
    console.log("Server is listiening on port ", PORT);
  });

  new WebSocketHandler(server);

  startAgenda().catch((error) => {
    console.error("Agenda scheduler failed to start:", error);
    logDatabaseConnectionHint(error);
  });
}

async function shutdown(exitCode = 0) {
  if(isShuttingDown){
    return;
  }

  isShuttingDown = true;

  if(server){
    await new Promise<void>((resolve) => {
      server?.close(() => {
        console.info("Server closed!");
        resolve();
      });
    });
  }

  await agenda.stop().catch((error) => {
    console.error("Failed to stop agenda:", error);
  });

  await prisma.$disconnect().catch((error) => {
    console.error("Failed to disconnect prisma:", error);
  });

  process.exit(exitCode);
}

process.on("uncaughtException", (error) => {
  console.log("Uncaught Exception: ", error);
  logDatabaseConnectionHint(error);
  shutdown(1);
});

process.on("unhandledRejection", (error) => {
  console.log("Unhandled Rejection: ", error);
  logDatabaseConnectionHint(error);
  shutdown(1);
});

process.on("SIGTERM", () => {
  console.log("SIGTERM signal received. Shutting down gracefully...");
  shutdown(0);
});

process.on("SIGINT", () => {
  console.log("SIGINT signal received. Shutting down gracefully...");
  shutdown(0);
});

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  logDatabaseConnectionHint(error);
  shutdown(1);
});
