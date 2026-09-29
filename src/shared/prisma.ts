import {PrismaClient} from "../prismaClient/client";
import logger from "./logger";
import { buildFileUrl } from "../helpers/fileUrl";

// import { PrismaClient } from "@prisma/client";

// import { initiateSuperAdmin } from "../app/db/db";


// Query errors are not logged here: Prisma throws them to the caller, and the
// request logger / job handlers already log them with more context.
const prismaClient = new PrismaClient({
  log: [{ emit: "event", level: "warn" }]
})

prismaClient.$on("warn", (e) => logger.warn({ target: e.target }, e.message))

// Uploaded files are stored as keys. This turns them into full URLs on every
// read, including nested includes, so services and responses always get URLs.
const prisma = prismaClient.$extends({
  result: {
    user: {
      avatar: { needs: { avatar: true }, compute: (user) => buildFileUrl(user.avatar) },
      cover: { needs: { cover: true }, compute: (user) => buildFileUrl(user.cover) },
    },
    userPhoto: {
      url: { needs: { url: true }, compute: (photo) => buildFileUrl(photo.url) },
    },
    contest: {
      banner: { needs: { banner: true }, compute: (contest) => buildFileUrl(contest.banner) },
    },
    recurringContest: {
      banner: { needs: { banner: true }, compute: (contest) => buildFileUrl(contest.banner) },
    },
    team: {
      badge: { needs: { badge: true }, compute: (team) => buildFileUrl(team.badge) },
    },
    product: {
      image: { needs: { image: true }, compute: (product) => buildFileUrl(product.image) },
    },
    chat: {
      fileUrl: { needs: { fileUrl: true }, compute: (chat) => buildFileUrl(chat.fileUrl) },
    },
  },
})

// The `tx` passed to prisma.$transaction callbacks. Use this instead of
// Prisma.TransactionClient, which does not include the extension above.
export type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

export default prisma;
