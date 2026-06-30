import { createServer,Server } from "http";
import config from "./config";
import fs from "fs";
import app from "./app";
import { setupWebSocket } from "./helpers/websocketSetUp";
import "./app/modules/Agenda";
import agenda from "./app/modules/Agenda";
import prisma from "./shared/prisma";
import WebSocketHandler from "./socket";


let server: Server;
const PORT = config.port || 5003

//Https options
// const options = {
//   key: fs.readFileSync("./server.key"),
//   cert: fs.readFileSync("./server.cert"),
// };




async function startServer() {
  // server = createServer(options, app);
  server = app.listen(PORT, () => {
    console.log("Server is listiening on port ", config.port);
  });
 
  // await setupWebSocket(server);
  let webSocket = new WebSocketHandler(server)
  
}

async function main() {
  await startServer();
  await agenda.start();
  const exitHandler = async (signalName?: string, exitCode = 0) => {
    console.info(`Exit handler triggered by: ${signalName || "direct call"}`);

    const forceExitTimeout = setTimeout(() => {
      console.warn("Graceful shutdown timed out. Force exiting...");
      process.exit(exitCode);
    }, 5000);
    forceExitTimeout.unref();

    if (server) {
      server.close(async () => {
        console.info("Server closed!");
        try {
          await agenda.stop();
          console.info("Agenda stopped successfully!");
        } catch (e) {
          console.error("Error stopping Agenda:", e);
        }
        try {
          await prisma.$disconnect();
          console.info("Prisma disconnected successfully!");
        } catch (e) {
          console.error("Error disconnecting Prisma:", e);
        }
        clearTimeout(forceExitTimeout);
        process.exit(exitCode);
      });
    } else {
      process.exit(exitCode);
    }
  };

  process.on("uncaughtException", (error) => {
    console.error("Uncaught Exception: ", error);
    exitHandler("uncaughtException", 1);
  });

  process.on("unhandledRejection", (error) => {
    console.error("Unhandled Rejection: ", error);
    exitHandler("unhandledRejection", 1);
  });

  // Handling the server shutdown with SIGTERM and SIGINT
  process.on("SIGTERM", () => {
    console.log("SIGTERM signal received. Shutting down gracefully...");
    exitHandler("SIGTERM", 0);
  });

  process.on("SIGINT", () => {
    console.log("SIGINT signal received. Shutting down gracefully...");
    exitHandler("SIGINT", 0);
  });
}

main();
