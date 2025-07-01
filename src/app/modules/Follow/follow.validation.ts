import { z } from 'zod';

export const followSchema = z.object({
    body: z.object({
        followingId: z.string().min(1, 'Following ID is required')
    })
});

export const unfollowSchema = z.object({
    body: z.object({
        followingId: z.string().min(1, 'Following ID is required')
    })
});
