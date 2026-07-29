import z from "zod";
import { contestRuleDefinitions, contestRuleKeys, supportedContestImageMimeTypes } from "./contestRule.definitions";
import { getRichTextLength, sanitizeContestRichText } from "../contestContent";

export const contestRuleSchema = z.object({
    icon:z.string().optional(),
    name:z.string({required_error:"rule name is rwequired"}),
    description: z.string({required_error:"contest description is required"})
})

const optionalString = z.string().optional().nullable();
const ruleRichText = z.string()
    .trim()
    .min(1)
    .refine((value) => getRichTextLength(value) <= 800, {
        message: "Rule text must contain at most 800 characters",
    })
    .transform(sanitizeContestRichText);

const baseRuleSchema = z.object({
    enabled: z.boolean().optional().default(true),
    order: z.coerce.number().int().nonnegative().optional(),
});

const ruleConfigKeys = ["key", "type", "value", "enabled", "order"] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value && typeof value === "object" && !Array.isArray(value));

const hasOwn = (value: Record<string, unknown>, key: string) =>
    Object.prototype.hasOwnProperty.call(value, key);

const valueFromSimplifiedRule = (key: string, rule: Record<string, unknown>) => {
    if (hasOwn(rule, "value")) {
        return rule.value;
    }

    const ruleValue = Object.fromEntries(
        Object.entries(rule).filter(([field]) => !ruleConfigKeys.includes(field as typeof ruleConfigKeys[number]))
    );

    if (Object.keys(ruleValue).length > 0) {
        return key === "SUBMISSION_LIMIT" && hasOwn(ruleValue, "limit")
            ? ruleValue.limit
            : ruleValue;
    }

    return contestRuleDefinitions[key as keyof typeof contestRuleDefinitions]?.defaultValue;
};

const normalizeSubmissionRulesValue = (value: unknown) => {
    if (Array.isArray(value)) {
        return value;
    }

    if (!isRecord(value)) {
        return value;
    }

    const lines = [
        value.intro,
        ...(Array.isArray(value.disallowed) ? value.disallowed : []),
        value.removalNotice,
    ].filter((line) => typeof line === "string" && line.trim());

    return lines.length > 0 ? lines : value;
};

const normalizeRuleInput = (value: unknown) => {
    if (!isRecord(value)) {
        return value;
    }

    const directRuleKeys = Object.keys(value).filter((key) => contestRuleKeys.includes(key as any));
    if (directRuleKeys.length === 1 && !hasOwn(value, "key") && !hasOwn(value, "type")) {
        const key = directRuleKeys[0];
        return {
            key,
            value: value[key],
        };
    }

    const key = value.key || value.type;
    if (typeof key !== "string") {
        return value;
    }

    return {
        ...value,
        key,
        value: valueFromSimplifiedRule(key, value),
        order: value.order ?? contestRuleDefinitions[key as keyof typeof contestRuleDefinitions]?.order,
    };
};

const normalizeRuleArrayInput = (value: unknown) => {
    if (Array.isArray(value)) {
        return value.map(normalizeRuleInput);
    }

    if (!isRecord(value)) {
        return value;
    }

    if (hasOwn(value, "key") || hasOwn(value, "type")) {
        return [normalizeRuleInput(value)];
    }

    return Object.entries(value)
        .map(([key, ruleValue]) => {
            if (isRecord(ruleValue)) {
                return normalizeRuleInput({
                    key,
                    ...ruleValue,
                });
            }

            return {
                key,
                value: ruleValue,
                order: contestRuleDefinitions[key as keyof typeof contestRuleDefinitions]?.order,
            };
        });
};

export const submissionLimitRuleSchema = baseRuleSchema.extend({
    key: z.literal("SUBMISSION_LIMIT"),
    value: z.coerce.number().int().min(1).max(100),
});

export const submissionRulesRuleSchema = baseRuleSchema.extend({
    key: z.literal("SUBMISSION_RULES"),
    value: z.preprocess(
        normalizeSubmissionRulesValue,
        z.array(z.string().trim().min(1).max(500)).min(1).max(20)
    ),
});

export const levelRequirementsRuleSchema = baseRuleSchema.extend({
    key: z.literal("LEVEL_REQUIREMENTS"),
    value: z.array(
        z.object({
            level: z.enum(["AMATEUR", "TALENTED", "SUPREME", "SUPERIOR", "TOP_NOTCH"]),
            votes: z.coerce.number().int().min(0),
        })
    ).min(1).superRefine((requirements, ctx) => {
        const levelOrder = ["AMATEUR", "TALENTED", "SUPREME", "SUPERIOR", "TOP_NOTCH"];
        const seen = new Set<string>();

        requirements.forEach((requirement, index) => {
            if (seen.has(requirement.level)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: [index, "level"],
                    message: "Level requirements must contain each level at most once",
                });
            }
            seen.add(requirement.level);

            if (index > 0 && requirements[index - 1].votes >= requirement.votes) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: [index, "votes"],
                    message: "Level vote requirements must be strictly increasing",
                });
            }
            if (index > 0 && levelOrder.indexOf(requirements[index - 1].level) >= levelOrder.indexOf(requirement.level)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: [index, "level"],
                    message: "Level requirements must follow the configured level order",
                });
            }
        });
    }),
});

export const submissionFormatRuleSchema = baseRuleSchema.extend({
    key: z.literal("SUBMISSION_FORMAT"),
    value: z.object({
        mimeTypes: z.array(z.enum(supportedContestImageMimeTypes)).min(1),
        minWidth: z.coerce.number().int().min(1),
        minHeight: z.coerce.number().int().min(1),
        maxSizeMB: z.coerce.number().positive().max(100),
    }),
});

export const eligibilityRuleSchema = baseRuleSchema.extend({
    key: z.literal("ELIGIBILITY"),
    value: z.object({
        minAge: z.coerce.number().int().min(0).optional(),
        text: ruleRichText,
        requiresAcceptance: z.boolean().optional().default(true),
    }),
});

export const copyrightRuleSchema = baseRuleSchema.extend({
    key: z.literal("COPYRIGHT"),
    value: z.object({
        text: ruleRichText,
        requiresOwnership: z.boolean().optional().default(true),
        requiresAcceptance: z.boolean().optional().default(true),
    }),
});

export const votingRuleSchema = baseRuleSchema.extend({
    key: z.literal("VOTING"),
    value: z.object({
        text: ruleRichText,
        membersOnly: z.boolean().optional().default(true),
        requireContestParticipant: z.boolean().optional().default(true),
        disallowSelfVote: z.boolean().optional().default(true),
        blindVoting: z.boolean().optional().default(true),
    }),
});

export const participationRuleSchema = baseRuleSchema.extend({
    key: z.literal("PARTICIPATION"),
    value: z.object({
        text: ruleRichText,
        requiresTermsAcceptance: z.boolean().optional().default(true),
        termsUrl: optionalString,
    }),
});

export const contestRuleConfigSchema = z.discriminatedUnion("key", [
    submissionLimitRuleSchema,
    submissionRulesRuleSchema,
    levelRequirementsRuleSchema,
    submissionFormatRuleSchema,
    eligibilityRuleSchema,
    copyrightRuleSchema,
    votingRuleSchema,
    participationRuleSchema,
]);

export const contestRuleInputSchema = z.preprocess(normalizeRuleInput, contestRuleConfigSchema);

export const contestRuleConfigArraySchema = z.array(contestRuleConfigSchema).superRefine((rules, ctx) => {
    const seen = new Set<string>();
    rules.forEach((rule, index) => {
        if (!contestRuleKeys.includes(rule.key)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: [index, "key"],
                message: "Unsupported contest rule key",
            });
        }
        if (seen.has(rule.key)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: [index, "key"],
                message: "Duplicate contest rule key",
            });
        }
        seen.add(rule.key);
    });
});

export const contestRuleInputArraySchema = z.preprocess(
    normalizeRuleArrayInput,
    z.array(contestRuleInputSchema)
).superRefine((rules, ctx) => {
    const seen = new Set<string>();
    rules.forEach((rule, index) => {
        if (!contestRuleKeys.includes(rule.key)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: [index, "type"],
                message: "Unsupported contest rule type",
            });
        }
        if (seen.has(rule.key)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: [index, "type"],
                message: "Duplicate contest rule type",
            });
        }
        seen.add(rule.key);
    });
});

export const acceptedRuleKeysSchema = z.array(z.enum(contestRuleKeys)).default([]);
