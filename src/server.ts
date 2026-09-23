import { Server } from "http";
import config from "./config";
import app from "./app";
import agenda, { startAgenda } from "./app/modules/Agenda";
import prisma from "./shared/prisma";
import WebSocketHandler from "./socket";
import { connectRedis, disconnectRedis } from "./shared/redis";
import dns from 'dns'


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

// Contest entry, voting, trades, payments and finalization are all written
// inside Prisma interactive transactions, which MongoDB only provides on a
// replica set. Against a standalone server every one of those paths fails at
// the moment a user hits it. Prove the capability once at boot so a
// misconfigured DATABASE_URL is an obvious startup failure instead of a
// scattered set of runtime 500s.
async function assertTransactionsAreSupported() {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.contest.findFirst({ select: { id: true } });
    });
  } catch (error) {
    const message = getErrorMessage(error);
    if (/replica set|Transaction numbers|transactions are not supported/i.test(message)) {
      throw new Error(
        "The configured database does not support transactions. MongoDB must run as a replica set " +
        "(MongoDB Atlas already does; for a local server start it with --replSet and add replicaSet= to DATABASE_URL). " +
        `Underlying error: ${message}`
      );
    }
    throw error;
  }
}

async function startServer() {
  await connectDatabaseWithRetry();
  await assertTransactionsAreSupported();
  // Contest lifecycle correctness depends on Agenda. Do not accept traffic in
  // a half-started state where contests never open/close or finalize.
  dns.setServers(["8.8.8.8", "8.8.4.4"]);
  await startAgenda();
  await connectRedis();

  server = app.listen(PORT, () => {
    console.log("Server is listiening on port ", PORT);
  });

  new WebSocketHandler(server);

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

  await disconnectRedis().catch((error) => {
    console.error("Failed to disconnect redis:", error);
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
