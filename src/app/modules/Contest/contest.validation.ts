
import { checkObjectId } from '../../../helpers/checkObjectId';
import { ContestMode, ContestPlan, PrizeType, RecurringType } from '../../../prismaClient';
import { z } from 'zod';




export const createContestSchema = z.object({

    title: z.string().nonempty("title must not be empty"),
    banner: z.string().optional(),
    description: z.string().nonempty('description must not be empty'),
    level_requirements:z.string().array().default(["50","200","400"]),
    type:z.nativeEnum(ContestPlan).default(ContestPlan.OPEN),
    mode:z.nativeEnum(ContestMode).default(ContestMode.SOLO),
    recurring: z.enum(['true', 'false'],{invalid_type_error: "'recurring' must be true or false"}).optional().transform( v => v && v === 'true'),
    recurring_status: z.union([z.boolean(), z.enum(['true', 'false'])]).optional().transform((value) => value === true || value === 'true'),
    recurringType: z.nativeEnum(RecurringType, {invalid_type_error:"Invalid recurring type"}).optional(),
    coin_requirement:z.string().optional().transform(val => val? val === 'true':null),
    coin_required:z.string().optional().transform(val => val? Number(val):null),  
    
    prizes: z.preprocess((val) => {
        if (typeof val === "string") {
            return JSON.parse(val);
        }
        return val;
    },
        z.array(
            z.object({
                category: z.nativeEnum(PrizeType),
                boost: z.string().transform(val => Number(val)),
                key: z.string().transform(val => Number(val)),
                swap: z.string().transform(val => Number(val)),
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
    minPrize:z.string().optional().transform(val => val? Number(val):null),
    maxUploads:z.string().optional().transform(val => val? Number(val):null),
});

 



export const updateRecurringContestSchema = z.object({
    title: z.string().optional(),
    banner: z.string().optional(),
    description: z.string().optional(),
    level_requirements: z.string().array().optional(),
    type: z.nativeEnum(ContestPlan).optional(),
    mode: z.nativeEnum(ContestMode).optional(),
    recurring_status: z.union([z.boolean(), z.enum(['true', 'false'])]).optional().transform((value) => value === true || value === 'true'),
    recurringType: z.nativeEnum(RecurringType, { invalid_type_error: "Invalid recurring type" }).optional(),
    coin_requirement: z.union([z.boolean(), z.string()]).optional().transform((val) => typeof val === 'string' ? val === 'true' : val),
    coin_required: z.union([z.number(), z.string()]).optional().transform((val) => typeof val === 'string' ? Number(val) : val),
    prizes: z.preprocess((val) => {
        if (typeof val === 'string') {
            return JSON.parse(val);
        }
        return val;
    }, z.array(z.object({
        category: z.nativeEnum(PrizeType),
        boost: z.string().transform((val) => Number(val)),
        key: z.string().transform((val) => Number(val)),
        swap: z.string().transform((val) => Number(val)),
    })).optional()),
    rules: z.preprocess((val) => {
        if (typeof val === 'string') {
            return JSON.parse(val);
        }
        return val;
    }, z.array(z.object({
        name: z.string(),
        description: z.string(),
        icon: z.string().optional(),
    })).optional()),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    isMoneyContest: z.union([z.boolean(), z.enum(['true', 'false'])]).optional().transform((val) => typeof val === 'string' ? val === 'true' : val),
    maxPrize: z.union([z.number(), z.string()]).optional().transform((val) => typeof val === 'string' ? Number(val) : val),
    minPrize: z.union([z.number(), z.string()]).optional().transform((val) => typeof val === 'string' ? Number(val) : val),
    maxUploads: z.union([z.number(), z.string()]).optional().transform((val) => typeof val === 'string' ? Number(val) : val),
}).partial();

export const joinContestSchema = z.object({
    body: z.object({
        contestId: z.string().min(1, 'Contest ID is required').refine(checkObjectId, { message: 'Invalid Contest ID' }),
    })
});
