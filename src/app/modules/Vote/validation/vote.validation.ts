
import { ObjectId } from 'mongodb';
import { z } from 'zod';

export const provideVoteShcema = z.object({    
  
    photoIds: z.string().array().
    refine((arr) => arr.length > 0, { message: "At least one photo ID must be provided" }).
    refine((arr) => arr.every(id => id.trim() !== ''), { message: "Photo IDs must not be empty strings" }).
    refine((arr) => arr.every(id => typeof id === 'string'), { message: "Photo IDs must be strings" })
    .refine((arr) => arr.every(id => ObjectId.isValid(id)), { message: "All photo IDs must be valid ObjectId strings" })
    
});