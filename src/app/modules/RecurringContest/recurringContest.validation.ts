import { z } from "zod";
import { RecurringType } from "../../../prismaClient";
import { contestRuleInputArraySchema } from "../Contest/ContestRules/contestRule.validation";

const entryFeeAmountSchema = z.number()
  .min(0)
  .max(100000000)
  .refine((value) => value === 0 || value >= 0.5, {
    message: "USD entry fee must be 0 (free) or at least 0.50",
  })
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8, {
    message: "USD entry fee can have at most 2 decimal places",
  });
import { contestAwardInputArraySchema } from "../Prize/prize.validation";
import { contestLevelAwardArraySchema } from "../Contest/contestLevelAward.validation";
import { getRichTextLength, sanitizeContestRichText } from "../Contest/contestContent";
import { contestCategoriesField, contestCategoryField } from "../Contest/contestCategories";
import { checkObjectId } from "../../../helpers/checkObjectId";

const parseJsonArray = (value: unknown) => {
  if (typeof value === "string") {
    return JSON.parse(value);
  }
  return value;
};

// The template edit accepts JSON or multipart (when a new banner file is sent),
// and multipart delivers every value as a string.
const parseBooleanField = (value: unknown) => {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
};

const parseOptionalNumber = (value: unknown) =>
  value === undefined || value === null || value === "" ? undefined : Number(value);

const parseNullableString = (value: unknown) =>
  value === "" || value === "null" ? null : value;

export const updateRecurringContestSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string()
    .trim()
    .min(1)
    .refine((value) => getRichTextLength(value) <= 5000, {
      message:"Description must contain at most 5000 characters",
    })
    .transform(sanitizeContestRichText)
    .optional(),
  category: contestCategoryField,
  categories: contestCategoriesField,
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  isMoneyContest: z.preprocess(parseBooleanField, z.boolean()).optional(),
  maxPrize: z.preprocess(parseOptionalNumber, z.number().int().min(0).optional()),
  minPrize: z.preprocess(parseOptionalNumber, z.number().int().min(0).optional()),
  currency: z.preprocess(
    parseNullableString,
    z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).nullable().optional()
  ),
  entryFeeAmount: z.preprocess(parseOptionalNumber, entryFeeAmountSchema.optional()),
  entryFeeCoins: z.preprocess(parseOptionalNumber, z.number().int().min(0).max(100000000).optional()),
  rules: z.preprocess(parseJsonArray, contestRuleInputArraySchema).optional(),
  // Banner sourced from an existing user-submitted photo instead of an uploaded
  // file (mutually exclusive with the `banner` file, like contest create/edit).
  bannerUserPhotoId: z.string().trim()
    .refine(checkObjectId, { message: "Invalid user photo ID" })
    .optional(),
  // Also apply the display fields (title, description, banner, categories) to
  // the already-generated occurrence that has not started yet. Dates, fees,
  // rules and awards only ever apply to occurrences generated after the edit.
  applyToUpcoming: z.preprocess(parseBooleanField, z.boolean()).optional(),
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

export const replaceRecurringLevelAwardsSchema = z.object({
  levelAwards: z.preprocess(parseJsonArray, contestLevelAwardArraySchema).default([]),
});

