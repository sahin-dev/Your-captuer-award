import { z } from "zod";
import { RecurringType } from "../../../prismaClient";
import { contestRuleInputArraySchema } from "../Contest/ContestRules/contestRule.validation";

const parseJsonArray = (value: unknown) => {
  if (typeof value === "string") {
    return JSON.parse(value);
  }
  return value;
};

export const updateRecurringContestSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  isMoneyContest: z.boolean().optional(),
  maxPrize: z.preprocess((value) => Number(value), z.number().int().min(0)).optional(),
  minPrize: z.preprocess((value) => Number(value), z.number().int().min(0)).optional(),
  rules: z.preprocess(parseJsonArray, contestRuleInputArraySchema).optional(),
});

export const updateRecurringIntervalSchema = z.object({
  recurringType: z.nativeEnum(RecurringType),
  nextOccurrence: z.string().datetime().optional(),
});

export const replaceRecurringAwardsSchema = z.object({
  awardPrizeIds: z.preprocess(parseJsonArray, z.array(z.string()).default([])),
});

