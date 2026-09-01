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

const DB_CONNECT_MAX_ATTEMPTS = 5;
const DB_CONNECT_RETRY_DELAY_MS = 3000;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// A brief DNS/network blip reaching Atlas shouldn't crash the whole process on
// its own attempt - retry a few times before giving up and letting the
// process exit (at which point PM2's restart policy takes over).
async function connectDatabaseWithRetry() {
  for (let attempt = 1; attempt <= DB_CONNECT_MAX_ATTEMPTS; attempt++) {
    try {
      await prisma.$connect();
      return;
    } catch (err) {
      logDatabaseConnectionHint(err);
      if (attempt === DB_CONNECT_MAX_ATTEMPTS) {
        throw new Error("Failed to connect to the database. Please check your DATABASE_URL and ensure the database is running.");
      }
      console.error(`Database connection attempt ${attempt}/${DB_CONNECT_MAX_ATTEMPTS} failed, retrying in ${DB_CONNECT_RETRY_DELAY_MS}ms...`);
      await delay(DB_CONNECT_RETRY_DELAY_MS);
    }
  }
}

async function startServer() {
  await connectDatabaseWithRetry();

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
