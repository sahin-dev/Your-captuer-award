
import { RecurringType } from '../../../prismaClient';
import { z } from 'zod';
import { contestRuleSchema } from './ContestRules/contestRule.validation';


const contestAwardSchema = z.object({
    category:z.enum( ["Top-photo", "Top-photographer", "Top-yc-pic"],{invalid_type_error:"category is invalid. values must be Top-photo, Top-photographer, Top-yc-pic", required_error:"category is required"}),
    keys:z.number({invalid_type_error:"keys must be a  nnumber", required_error:"keys are required"}),
    trades:z.number({invalid_type_error:"trades must be a  nnumber", required_error:"trades are required"}),
    charges:z.number({invalid_type_error:"charges must be a  nnumber", required_error:"charges are required"}),
})


export const createContestSchema = z.object({
    body: z.object({
        title: z.string().nonempty("title must not be empty"),
        description: z.string().nonempty('description must not be empty'),
        recurring: z.boolean({invalid_type_error: "Recurring must be a boolean"}),
        recurringType: z.nativeEnum(RecurringType, {invalid_type_error:"Invalid recurring type"}).optional(),
        awards: z.array(contestAwardSchema, {invalid_type_error:"invalid type contest award"}),
        rules:z.array(contestRuleSchema,{invalid_type_error:"invalid type contest rule"}),
        startDate: z.string().nonempty("start date must not be empty"),
        endDate: z.string().nonempty('End Date is required'),
    })
});

 



export const joinContestSchema = z.object({
    body: z.object({
        contestId: z.string().min(1, 'Contest ID is required')
    })
});
