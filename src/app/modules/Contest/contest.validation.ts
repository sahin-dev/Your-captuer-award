
import { checkObjectId } from '../../../helpers/checkObjectId';
import { AwardTarget, PrizeType, RecurringType } from '../../../prismaClient';
import { z } from 'zod';
import { contestRuleInputArraySchema } from './ContestRules/contestRule.validation';
import { contestAwardInputArraySchema } from '../Prize/prize.validation';
import { isContestPrizeCategory } from '../Awards/award.definitions';

const parseJsonValue = (val: unknown) => {
    if (typeof val === "string") {
        return JSON.parse(val);
    }
    return val;
}

const parseNumberField = (val: unknown) => {
    if (typeof val === "string" && val.trim() !== "") {
        return Number(val);
    }
    return val;
}

const parseOptionalNumberField = (val: unknown) => {
    if (val === undefined || val === null || val === "") {
        return undefined;
    }

    return Number(val);
}


export const createContestSchema = z.object({

    title: z.string().nonempty("title must not be empty"),
    description: z.string().nonempty('description must not be empty'),
    recurring: z.enum(['true', 'false'],{invalid_type_error: "'recurring' must be true or false"}).optional().transform( v => v && v === 'true'),
    recurringType: z.nativeEnum(RecurringType, {invalid_type_error:"Invalid recurring type"}).optional(),
    awardPrizeIds: z.preprocess(parseJsonValue, z.array(z.string()).default([])).optional(),
    awards: z.preprocess(parseJsonValue, contestAwardInputArraySchema).optional(),
    prizes: z.preprocess(parseJsonValue,
        z.array(
            z.object({
                category: z.nativeEnum(PrizeType).refine(isContestPrizeCategory, {
                    message: "Contest level badges cannot be configured as prizes",
                }),
                target: z.nativeEnum(AwardTarget).optional(),
                rankLimit: z.preprocess(parseOptionalNumberField, z.number().int().positive().optional()),
                boost: z.preprocess(parseNumberField, z.number()).default(0),
                key: z.preprocess(parseNumberField, z.number()).default(0),
                swap: z.preprocess(parseNumberField, z.number()).default(0),
                coin: z.preprocess(parseNumberField, z.number()).default(0),
            })
        )
    ).optional(),

    // ⬇️ PARSE JSON STRING → VALIDATE AS ARRAY
    rules: z.preprocess(parseJsonValue, contestRuleInputArraySchema).optional(),
    startDate: z.string().nonempty("start date must not be empty"),
    endDate: z.string().nonempty('End Date is required'),
    isMoneyContest:z.enum(['true', 'false']).transform((val) => val === 'true'),
    maxPrize:z.preprocess(parseOptionalNumberField, z.number().optional()),
    minPrize:z.preprocess(parseOptionalNumberField, z.number().optional()),
});

 



export const joinContestSchema = z.object({
    body: z.object({
        contestId: z.string().min(1, 'Contest ID is required').refine(checkObjectId, { message: 'Invalid Contest ID' }),
    })
});

export const contestAwardSelectionSchema = z.object({
    photoId: z.string().min(1, "Photo ID is required"),
});
