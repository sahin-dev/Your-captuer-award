import {PrismaClient} from "../prismaClient/client";
import logger from "./logger";

// import { PrismaClient } from "@prisma/client";

// import { initiateSuperAdmin } from "../app/db/db";


// Query errors are not logged here: Prisma throws them to the caller, and the
// request logger / job handlers already log them with more context.
const prisma = new PrismaClient({
  log: [{ emit: "event", level: "warn" }]
})

prisma.$on("warn", (e) => logger.warn({ target: e.target }, e.message))


export default prisma;
