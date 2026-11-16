import { checkObjectId } from "../../../helpers/checkObjectId";
import { RecurringType } from "../../../prismaClient";
import { z } from "zod";
import { contestRuleInputArraySchema } from "./ContestRules/contestRule.validation";
import { contestPrizeInputArraySchema } from "../Prize/prize.validation";
import { contestLevelAwardArraySchema } from "./contestLevelAward.validation";
import { getRichTextLength, sanitizeContestRichText } from "./contestContent";
import { contestCategoriesField, contestCategoryField } from "./contestCategories";
import {
    getPaidAmountError,
    hasAtMostTwoDecimals,
    isSupportedCurrency,
    resolveChargeCurrency,
    SUPPORTED_CURRENCIES,
    SupportedCurrency,
} from "../Payment/paymentCurrency";

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

// The entry fee's minimum depends on the contest currency, so it is checked
// where both are known (superRefine below, and the update service).
const entryFeeAmountSchema = z.number()
    .nonnegative()
    .max(100000000)
    .refine(hasAtMostTwoDecimals, {
        message: "Entry fee can have at most 2 decimal places",
    });

// One currency per contest: the entry fee is charged in it and cash prizes are
// shown in it. Empty or null means "not sent" (the saved/default value is kept).
export const contestCurrencyField = z.preprocess(
    (value) => value === "" || value === null || value === "null" ? undefined : value,
    z.string().trim().toUpperCase()
        .refine(isSupportedCurrency, { message: `Currency must be one of ${SUPPORTED_CURRENCIES.join(", ")}` })
        .transform((value) => value as SupportedCurrency)
        .optional()
);

const bannerUserPhotoIdField = z.string().trim()
    .refine(checkObjectId, { message: "Invalid user photo ID" })
    .optional();

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

const normalizeUpdateContestInput = (value: unknown) => {
    const normalized = normalizeCreateContestInput(value);

    if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
        return normalized;
    }

    const { recurring, recurrence, ...contest } = normalized as Record<string, unknown>;
    return contest;
};

const createContestObjectSchema = z.object({
    title: z.string().trim().min(1, "Title must not be empty").max(160),
    description: richTextField("Description", 5000),
    category: contestCategoryField,
    categories: contestCategoriesField,

    recurring: z.preprocess(parseBooleanField, z.boolean()).optional().default(false),
    isPhotographyOfYear: z.preprocess(parseBooleanField, z.boolean()).optional().default(false),
    recurrence: z.preprocess(parseJsonValue, recurrenceSchema).optional(),
    // When set, the banner is sourced from this existing UserPhoto instead of the
    // uploaded file - the two are mutually exclusive at the service layer.
    bannerUserPhotoId: bannerUserPhotoIdField,

    prizeIds: z.preprocess(parseJsonValue, z.array(z.string())).optional(),
    prizes: z.preprocess(parseJsonValue, contestPrizeInputArraySchema).optional(),
    levelAwards: z.preprocess(parseJsonValue, contestLevelAwardArraySchema).optional(),

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
    currency: contestCurrencyField,
    maxPrize: z.preprocess(parseOptionalNumberField, z.number().int().nonnegative().optional()),
    minPrize: z.preprocess(parseOptionalNumberField, z.number().int().nonnegative().optional()),
    entryFeeAmount: z.preprocess(
        parseOptionalNumberField,
        entryFeeAmountSchema.optional()
    ),
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
    const feeError = getPaidAmountError(contest.entryFeeAmount ?? 0, resolveChargeCurrency(contest.currency));
    if (feeError) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["entryFeeAmount"], message: feeError });
    }
    if (contest.isMoneyContest) {
        if (contest.minPrize === undefined || contest.maxPrize === undefined) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["isMoneyContest"],
                message: "Money contests require minPrize and maxPrize",
            });
        } else if (contest.minPrize > contest.maxPrize) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["maxPrize"],
                message: "maxPrize must be at least minPrize",
            });
        }
    }
    if (contest.isPhotographyOfYear) {
        if (contest.recurring) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["recurring"], message: "Photographer of the Year contests use admin-set start and end dates and cannot recur" });
        }
        // POTY is free or charges an entry fee (USD or EUR) that funds its prize pool. It
        // has no fixed cash prizes and no coin fee.
        if (contest.isMoneyContest || contest.entryFeeCoins || contest.coinRequirement) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["isPhotographyOfYear"], message: "Photographer of the Year contests cannot use fixed cash prizes or coin entry fees" });
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
export const createRegularContestSchema = createContestSchema.refine(
    (contest) => !contest.isPhotographyOfYear,
    {
        path: ["isPhotographyOfYear"],
        message: "Create Photographer of the Year contests through the dedicated endpoint",
    }
);

const updateContestObjectSchema = z.object({
    title: z.string().trim().min(1).max(160).optional(),
    description: richTextField("Description", 5000).optional(),
    category: contestCategoryField,
    categories: contestCategoriesField,
    startDate: optionalIsoDate,
    endDate: optionalIsoDate,
    bannerUserPhotoId: bannerUserPhotoIdField,
    isMoneyContest: z.preprocess(parseBooleanField, z.boolean()).optional(),
    currency: contestCurrencyField,
    maxPrize: z.preprocess(parseOptionalNumberField, z.number().int().nonnegative().optional()),
    minPrize: z.preprocess(parseOptionalNumberField, z.number().int().nonnegative().optional()),
    entryFeeAmount: z.preprocess(
        parseOptionalNumberField,
        entryFeeAmountSchema.optional()
    ),
    coinRequirement: z.preprocess(parseBooleanField, z.boolean()).optional(),
    entryFeeCoins: z.preprocess(
        parseOptionalNumberField,
        z.number().int().nonnegative().max(100000000).optional()
    ),
    prizeIds: z.preprocess(parseJsonValue, z.array(z.string())).optional(),
    prizes: z.preprocess(parseJsonValue, contestPrizeInputArraySchema).optional(),
    levelAwards: z.preprocess(parseJsonValue, contestLevelAwardArraySchema).optional(),
    rules: z.preprocess(parseJsonValue, contestRuleInputArraySchema).optional(),
}).strict();

export const updateContestSchema = z.preprocess(normalizeUpdateContestInput, updateContestObjectSchema);

export const joinContestSchema = z.object({
    body: z.object({
        contestId: z.string().min(1, "Contest ID is required")
            .refine(checkObjectId, { message: "Invalid Contest ID" }),
    }),
});

export const contestAwardSelectionSchema = z.object({
    photoId: z.string().min(1, "Photo ID is required"),
});
