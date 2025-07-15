import { RecurringType } from '@prisma/client';
import { string, z } from 'zod';

export const createContestSchema = z.object({
    body: z.object({
        title: string().min(1, 'Title is required'),
        description: string().min(1, 'Description is required'),
        recurring: z.boolean({invalid_type_error: "Recurring must be a boolean"}),
        recurringType: z.nativeEnum(RecurringType, {invalid_type_error:"Invalid recurring type"}).optional(),
        startDate: z.string().min(1, 'Start Date is required'),
        endDate: z.string().min(1, 'End Date is required')
    })
});

export const joinContestSchema = z.object({
    body: z.object({
        contestId: z.string().min(1, 'Contest ID is required')
    })
});
