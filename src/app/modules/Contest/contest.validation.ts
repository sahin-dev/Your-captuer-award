import { checkObjectId } from "../../../helpers/checkObjectId";
import { RecurringType } from "../../../prismaClient";
import { z } from "zod";
import { contestRuleInputArraySchema } from "./ContestRules/contestRule.validation";
import { contestPrizeInputArraySchema } from "../Prize/prize.validation";
import { getRichTextLength, sanitizeContestRichText } from "./contestContent";

const parseJsonValue = (value: unknown) => {
    if (typeof value !== "string") {
        return value;
    }

    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
};

const parseOptionalNumberField = (value: unknown) => {
    if (value === undefined || value === null || value === "") {
        return undefined;
    }
    return Number(value);
};

const parseBooleanField = (value: unknown) => {
    if (typeof value === "boolean") {
        return value;
    }
    if (value === "true") {
        return true;
    }
    if (value === "false") {
        return false;
    }
    return value;
};

const richTextField = (label: string, maxLength: number) =>
    z.string()
        .trim()
        .min(1, `${label} must not be empty`)
        .refine((value) => getRichTextLength(value) <= maxLength, {
            message: `${label} must contain at most ${maxLength} characters`,
        })
        .transform(sanitizeContestRichText);

const optionalIsoDate = z.string().datetime({ offset: true }).optional();

const recurrenceSchema = z.object({
    type: z.nativeEnum(RecurringType).optional(),
    timezone: z.string().trim().min(1).max(100).default("UTC"),
    endsAt: optionalIsoDate,
    maxOccurrences: z.preprocess(
        parseOptionalNumberField,
        z.number().int().positive().max(10000).optional()
    ),
});

const normalizeCreateContestInput = (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return value;
    }

    const contest = value as Record<string, unknown>;

    return {
        ...contest,
        prizeIds: contest.prizeIds ?? contest.awardPrizeIds,
        prizes: contest.prizes ?? contest.awards,
    };
};

const createContestObjectSchema = z.object({
    title: z.string().trim().min(1, "Title must not be empty").max(160),
    description: richTextField("Description", 5000),
    category: z.string().trim().min(1).max(100).optional(),

    recurring: z.preprocess(parseBooleanField, z.boolean()).optional().default(false),
    recurrence: z.preprocess(parseJsonValue, recurrenceSchema).optional(),

    prizeIds: z.preprocess(parseJsonValue, z.array(z.string())).optional(),
    prizes: z.preprocess(parseJsonValue, contestPrizeInputArraySchema).optional(),

    rules: z.preprocess(parseJsonValue, contestRuleInputArraySchema).optional(),
    startDate: z.string().datetime({
        offset: true,
        message: "Start date must be a valid ISO timestamp with timezone",
    }),
    endDate: z.string().datetime({
        offset: true,
        message: "End date must be a valid ISO timestamp with timezone",
    }),

    isMoneyContest: z.preprocess(parseBooleanField, z.boolean()).optional().default(false),
    currency: z.string().trim().toUpperCase()
        .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter ISO code")
        .optional(),
    maxPrize: z.preprocess(parseOptionalNumberField, z.number().int().nonnegative().optional()),
    minPrize: z.preprocess(parseOptionalNumberField, z.number().int().nonnegative().optional()),
    coinRequirement: z.preprocess(parseBooleanField, z.boolean()).optional(),
    entryFeeCoins: z.preprocess(
        parseOptionalNumberField,
        z.number().int().nonnegative().max(100000000).optional()
    ),
}).superRefine((contest, ctx) => {
    const startDate = new Date(contest.startDate);
    const endDate = new Date(contest.endDate);

    if (startDate <= new Date()) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["startDate"],
            message: "Start date must be in the future",
        });
    }
    if (endDate <= startDate) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["endDate"],
            message: "End date must be after start date",
        });
    }
    if (contest.isMoneyContest) {
        if (contest.minPrize === undefined || contest.maxPrize === undefined || !contest.currency) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["isMoneyContest"],
                message: "Money contests require currency, minPrize, and maxPrize",
            });
        } else if (contest.minPrize > contest.maxPrize) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["maxPrize"],
                message: "maxPrize must be at least minPrize",
            });
        }
    }
    if (contest.coinRequirement && !contest.entryFeeCoins) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["entryFeeCoins"],
            message: "A positive entryFeeCoins value is required when coinRequirement is enabled",
        });
    }

    const recurrenceEndsAt = contest.recurrence?.endsAt;
    if (recurrenceEndsAt && new Date(recurrenceEndsAt) <= startDate) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["recurrence", "endsAt"],
            message: "Recurrence end must be after the first occurrence",
        });
    }
});

export const createContestSchema = z.preprocess(normalizeCreateContestInput, createContestObjectSchema);

const updateContestObjectSchema = z.object({
    title: z.string().trim().min(1).max(160).optional(),
    description: richTextField("Description", 5000).optional(),
    category: z.string().trim().min(1).max(100).optional(),
    startDate: optionalIsoDate,
    endDate: optionalIsoDate,
    isMoneyContest: z.preprocess(parseBooleanField, z.boolean()).optional(),
    currency: z.union([
        z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Currency must be a 3-letter ISO code"),
        z.null(),
    ]).optional(),
    maxPrize: z.preprocess(parseOptionalNumberField, z.number().int().nonnegative().optional()),
    minPrize: z.preprocess(parseOptionalNumberField, z.number().int().nonnegative().optional()),
    coinRequirement: z.preprocess(parseBooleanField, z.boolean()).optional(),
    entryFeeCoins: z.preprocess(
        parseOptionalNumberField,
        z.number().int().nonnegative().max(100000000).optional()
    ),
    prizeIds: z.preprocess(parseJsonValue, z.array(z.string())).optional(),
    prizes: z.preprocess(parseJsonValue, contestPrizeInputArraySchema).optional(),
    rules: z.preprocess(parseJsonValue, contestRuleInputArraySchema).optional(),
}).strict();

export const updateContestSchema = z.preprocess(normalizeCreateContestInput, updateContestObjectSchema);

export const joinContestSchema = z.object({
    body: z.object({
        contestId: z.string().min(1, "Contest ID is required")
            .refine(checkObjectId, { message: "Invalid Contest ID" }),
    }),
});

export const contestAwardSelectionSchema = z.object({
    photoId: z.string().min(1, "Photo ID is required"),
});
