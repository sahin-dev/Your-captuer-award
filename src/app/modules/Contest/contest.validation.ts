
import { PrizeType, RecurringType } from '../../../prismaClient';
import { z } from 'zod';




export const createContestSchema = z.object({

    title: z.string().nonempty("title must not be empty"),
    description: z.string().nonempty('description must not be empty'),
    level_requirements:z.string().array(),
    recurring: z.enum(['true', 'false'],{invalid_type_error: "Recurring must be true or false"}).optional().transform( v => v === 'true'),
    recurringType: z.nativeEnum(RecurringType, {invalid_type_error:"Invalid recurring type"}).optional(),
    prizes: z.object({category:z.nativeEnum(PrizeType), trades:z.string(), keys:z.string(), charges:z.string()}).array(),
    rules:z.object({name:z.string(), description:z.string()}).array(),
    startDate: z.string().nonempty("start date must not be empty"),
    endDate: z.string().nonempty('End Date is required'),
    isMoneyContest:z.string({required_error:"isMoneyContest is required"}).optional().transform((val)=> val === "true"),
    maxPrize:z.string().optional().transform(val=> Number(val)),
    minPrize:z.string().optional().transform(val => Number(val))
});

 



export const joinContestSchema = z.object({
    body: z.object({
        contestId: z.string().min(1, 'Contest ID is required')
    })
});
