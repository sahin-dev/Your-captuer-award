import { createHash } from "node:crypto";
import type { PrizeType } from "../../../prismaClient";

/**
 * Mongo ObjectId-compatible deterministic ID used to make level achievement
 * creation safe when progress evaluation and finalization run concurrently.
 */
export const getContestLevelAchievementId = (
  participantId: string,
  contestId: string,
  category: PrizeType,
) => createHash("sha256")
  .update(`contest-level-achievement\0${participantId}\0${contestId}\0${category}`)
  .digest("hex")
  .slice(0, 24);
