// src/worker.ts
import config from "./config";
import agenda, { startAgenda } from "./app/modules/Agenda";
import prisma from "./shared/prisma";

let isShuttingDown = false;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function startWorker() {
  await prisma.$connect();
  await startAgenda();
  console.log("Worker started");
}

async function shutdown(exitCode = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  await agenda.stop().catch(console.error);
  await prisma.$disconnect().catch(console.error);

  process.exit(exitCode);
}

process.on("SIGTERM", () => shutdown(0));
process.on("SIGINT", () => shutdown(0));
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  shutdown(1);
});
process.on("unhandledRejection", (error) => {
  console.error("Unhandled Rejection:", error);
  shutdown(1);
});

startWorker().catch((error) => {
  console.error("Failed to start worker:", error);
  shutdown(1);
});