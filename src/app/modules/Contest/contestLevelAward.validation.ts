import { z } from "zod";
import { ContestLevelBadge } from "../../../prismaClient";

const numberField = z.preprocess((value) => {
  if (typeof value === "string" && value.trim() !== "") {
    return Number(value);
  }
  return value;
}, z.number().int().min(0).max(100000000).default(0));

export const contestLevelAwardEntrySchema = z.object({
  level: z.nativeEnum(ContestLevelBadge),
  boost: numberField,
  swap: numberField,
  key: numberField,
  coin: numberField,
});

const allLevels = Object.values(ContestLevelBadge);

// Contest level awards are optional (an empty array disables them entirely), but the moment an
// admin configures even one level, every level must be present - partial ladders aren't allowed
// since a participant who reaches, say, Superior without passing through a configured Talented
// reward would otherwise get an inconsistent payout experience.
export const contestLevelAwardArraySchema = z.array(contestLevelAwardEntrySchema).superRefine((awards, ctx) => {
  if (awards.length === 0) {
    return;
  }

  const seen = new Set<ContestLevelBadge>();
  awards.forEach((award, index) => {
    if (seen.has(award.level)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, "level"],
        message: "Duplicate contest level",
      });
    }
    seen.add(award.level);
  });

  const missing = allLevels.filter((level) => !seen.has(level));
  if (missing.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [],
      message: `All contest levels must be configured once level awards are enabled. Missing: ${missing.join(", ")}`,
    });
  }
});
