import { z } from 'zod';
import { checkObjectId } from '../../../helpers/checkObjectId';

export const postCommentSchema = z.object({
    body: z.object({
        receiverId: z.string().min(1, 'Receiver ID is required').refine(checkObjectId, { message: 'Invalid Receiver ID' }),
        text: z.string().min(1, 'Comment text is required')
    })
});

export const getUserCommentsSchema = z.object({
    params: z.object({
        userId: z.string().min(1, 'User ID is required').refine(checkObjectId, { message: 'Invalid User ID' }),
    })
});
