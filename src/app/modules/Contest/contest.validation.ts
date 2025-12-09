
import { checkObjectId } from '../../../helpers/checkObjectId';
import { PrizeType, RecurringType } from '../../../prismaClient';
import { z } from 'zod';




export const createContestSchema = z.object({

    title: z.string().nonempty("title must not be empty"),
    description: z.string().nonempty('description must not be empty'),
    level_requirements:z.string().array().default(["50","200","400"]),
    recurring: z.enum(['true', 'false'],{invalid_type_error: "'recurring' must be true or false"}).optional().transform( v => v && v === 'true'),
    recurringType: z.nativeEnum(RecurringType, {invalid_type_error:"Invalid recurring type"}).optional(),
    prizes: z.preprocess((val) => {
        console.log(val)
        if (typeof val === "string") {
            return JSON.parse(val);
        }
        return val;
    },
        z.array(
            z.object({
                category: z.nativeEnum(PrizeType),
                boost: z.number(),
                key: z.number(),
                swap: z.number(),
            })
        )
    ),

    // ⬇️ PARSE JSON STRING → VALIDATE AS ARRAY
    rules: z.preprocess((val) => {
        if (typeof val === "string") {
            return JSON.parse(val);
        }
        return val;
    },
        z.array(
            z.object({
                name: z.string(),
                description: z.string(),
                icon: z.string().optional(),
            })
        )
    ),
    startDate: z.string().nonempty("start date must not be empty"),
    endDate: z.string().nonempty('End Date is required'),
    isMoneyContest:z.enum(['true', 'false']).transform((val) => val === 'true'),
    maxPrize:z.string().optional().transform(val=> {
        if(val)
            return parseInt(val)
    }),
    minPrize:z.string().optional().transform(val => Number(val)),
    maxUploads:z.string().optional().transform(val => Number(val)),
});

 



export const joinContestSchema = z.object({
    body: z.object({
        contestId: z.string().min(1, 'Contest ID is required').refine(checkObjectId, { message: 'Invalid Contest ID' }),
    })
});
