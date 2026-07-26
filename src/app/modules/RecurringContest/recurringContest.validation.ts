import { z } from "zod";
import { RecurringType } from "../../../prismaClient";
import { contestRuleInputArraySchema } from "../Contest/ContestRules/contestRule.validation";
import { contestAwardInputArraySchema } from "../Prize/prize.validation";
import { checkObjectId } from "../../../helpers/checkObjectId";
import { getRichTextLength, sanitizeContestRichText } from "../Contest/contestContent";

const parseJsonArray = (value: unknown) => {
  if (typeof value === "string") {
    return JSON.parse(value);
  }
  return value;
};

export const updateRecurringContestSchema = z.object({
  title: z.string().optional(),
  description: z.string()
    .trim()
    .min(1)
    .refine((value) => getRichTextLength(value) <= 5000, {
      message:"Description must contain at most 5000 characters",
    })
    .transform(sanitizeContestRichText)
    .optional(),
  categoryId: z.string().refine(checkObjectId, {message:"Invalid category ID"}).nullable().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  isMoneyContest: z.boolean().optional(),
  maxPrize: z.preprocess((value) => Number(value), z.number().int().min(0)).optional(),
  minPrize: z.preprocess((value) => Number(value), z.number().int().min(0)).optional(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).nullable().optional(),
  entryFeeCoins: z.preprocess((value) => Number(value), z.number().int().min(0).max(100000000)).optional(),
  rules: z.preprocess(parseJsonArray, contestRuleInputArraySchema).optional(),
});

export const updateRecurringIntervalSchema = z.object({
  recurringType: z.nativeEnum(RecurringType),
  nextOccurrence: z.string().datetime().optional(),
  timezone: z.string().trim().min(1).max(100).optional(),
  endsAt: z.string().datetime().nullable().optional(),
  maxOccurrences: z.preprocess(
    (value) => value === null || value === "" ? null : Number(value),
    z.number().int().positive().max(10000).nullable()
  ).optional(),
});

export const replaceRecurringAwardsSchema = z.object({
  awardPrizeIds: z.preprocess(parseJsonArray, z.array(z.string()).default([])).optional(),
  awards: z.preprocess(parseJsonArray, contestAwardInputArraySchema).optional(),
});

