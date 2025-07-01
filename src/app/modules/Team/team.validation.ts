import { z } from 'zod';

export const addMemberSchema = z.object({
    body: z.object({
        teamId: z.string().min(1, 'Team ID is required'),
        memberId: z.string().min(1, 'Member ID is required')
    })
});

export const removeMemberSchema = z.object({
    body: z.object({
        teamId: z.string().min(1, 'Team ID is required'),
        memberId: z.string().min(1, 'Member ID is required')
    })
});
