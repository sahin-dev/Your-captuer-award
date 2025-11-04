import { z } from 'zod';
import { checkObjectId } from '../../../helpers/checkObjectId';

export const followSchema = z.object({
    body: z.object({
        followingId: z.string().min(1, 'Following ID is required').refine(checkObjectId, { message: 'Invalid Following ID'})
    })
});

export const unfollowSchema = z.object({
    body: z.object({
        followingId: z.string().min(1, 'Following ID is required').refine(checkObjectId, { message: 'Invalid Following ID' })   
    })
});
