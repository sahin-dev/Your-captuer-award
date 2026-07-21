import { z } from "zod";
import { AwardTarget, AwardType, PrizeType } from "../../../prismaClient";
import { getAwardSlotKey, isContestPrizeCategory, normalizeAwardIdentity } from "../Awards/award.definitions";

const numberField = z.preprocess((value) => {
  if (typeof value === "string" && value.trim() !== "") {
    return Number(value);
  }
  return value;
}, z.number().int().min(0).default(0));

const optionalNumberField = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "string" && value.trim() !== "") {
    return Number(value);
  }

  return value;
}, z.number().int().min(0).optional());

const contestPrizeCategorySchema = z.nativeEnum(PrizeType).refine(isContestPrizeCategory, {
  message: "Contest level badges cannot be configured as prizes",
});

const rankLimitField = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "string" && value.trim() !== "") {
    return Number(value);
  }

  return value;
}, z.number().int().positive().optional());

export const createPrizeSchema = z.object({
  category: contestPrizeCategorySchema.optional(),
  type: z.nativeEnum(AwardType).optional(),
  target: z.nativeEnum(AwardTarget).optional(),
  rankLimit: rankLimitField,
  title: z.string().optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
  key: numberField,
  boost: numberField,
  swap: numberField,
  coin: numberField,
}).superRefine((award, ctx) => {
  try {
    normalizeAwardIdentity(award);
  } catch (error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["type"],
      message: error instanceof Error ? error.message : "Invalid award identity",
    });
  }
}).transform((award) => ({
  ...award,
  ...normalizeAwardIdentity(award),
}));

export const updatePrizeSchema = z.object({
  category: contestPrizeCategorySchema.optional(),
  type: z.nativeEnum(AwardType).optional(),
  target: z.nativeEnum(AwardTarget).optional(),
  rankLimit: rankLimitField,
  title: z.string().optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
  key: optionalNumberField,
  boost: optionalNumberField,
  swap: optionalNumberField,
  coin: optionalNumberField,
});

export const contestAwardConfigSchema = z.object({
  prizeId: z.string().min(1, "Prize ID is required"),
  title: z.string().optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
  key: optionalNumberField,
  boost: optionalNumberField,
  swap: optionalNumberField,
  coin: optionalNumberField,
});

const contestAwardValueSchema = z.object({
  boost: optionalNumberField,
  key: optionalNumberField,
  swap: optionalNumberField,
  coin: optionalNumberField,
}).default({});

const contestAwardByIdentitySchema = z.object({
  category: contestPrizeCategorySchema.optional(),
  type: z.nativeEnum(AwardType).optional(),
  target: z.nativeEnum(AwardTarget).optional(),
  rankLimit: rankLimitField,
  value: contestAwardValueSchema,
}).superRefine((award, ctx) => {
  try {
    normalizeAwardIdentity(award);
  } catch (error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["type"],
      message: error instanceof Error ? error.message : "Invalid award identity",
    });
  }
}).transform((award) => ({
  ...normalizeAwardIdentity(award),
  ...award.value,
}));

export const contestAwardInputSchema = z.union([
  contestAwardByIdentitySchema,
  contestAwardConfigSchema,
]);

export const contestAwardConfigArraySchema = z.array(contestAwardConfigSchema).superRefine((awards, ctx) => {
  const seenPrizeIds = new Set<string>();

  awards.forEach((award, index) => {
    if (seenPrizeIds.has(award.prizeId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, "prizeId"],
        message: "Duplicate prize ID",
      });
    }

    seenPrizeIds.add(award.prizeId);
  });
});

export const contestAwardInputArraySchema = z.array(contestAwardInputSchema).superRefine((awards, ctx) => {
  const seen = new Set<string>();

  awards.forEach((award, index) => {
    const identifier = "type" in award ? getAwardSlotKey(award) : award.prizeId;

    if (seen.has(identifier)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, "type"],
        message: "Duplicate award",
      });
    }

    seen.add(identifier);
  });
});

