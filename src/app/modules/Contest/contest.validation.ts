import { string, z } from 'zod';

export const createContestSchema = z.object({
    body: z.object({
        title: string().min(1, 'Title is required'),
        description: string().min(1, 'Description is required'),
        
        status: z.string().min(1, 'Status is required'),
        recurring: z.boolean(),
        recurringType: z.string().optional(),
        startDate: z.string().min(1, 'Start Date is required'),
        endDate: z.string().min(1, 'End Date is required')
    })
});

export const joinContestSchema = z.object({
    body: z.object({
        contestId: z.string().min(1, 'Contest ID is required')
    })
});
