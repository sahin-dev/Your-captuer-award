
import { RecurringType } from '../../../prismaClient';
import { z } from 'zod';




export const createContestSchema = z.object({

    title: z.string().nonempty("title must not be empty"),
    description: z.string().nonempty('description must not be empty'),
    recurring: z.boolean({invalid_type_error: "Recurring must be a boolean"}).optional(),
    recurringType: z.nativeEnum(RecurringType, {invalid_type_error:"Invalid recurring type"}).optional(),
    prizes: z.string({required_error:"contest prizes are required", invalid_type_error:"invalid type contest prize"}),
    rules:z.string({invalid_type_error:"invalid type contest rule",required_error:"rules are required"}),
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
