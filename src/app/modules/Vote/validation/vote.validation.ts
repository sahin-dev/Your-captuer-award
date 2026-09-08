
import { ObjectId } from 'mongodb';
import { z } from 'zod';

const photoIdSchema = z.string().min(1, "Photo ID must not be empty").refine(ObjectId.isValid, {
  message: "Photo ID must be a valid ObjectId string",
});

export const provideVoteShcema = z.object({
  photoId: photoIdSchema.optional(),
  photoIds: z.array(photoIdSchema).min(1, "At least one photo ID must be provided").optional(),
}).superRefine((value, context) => {
  const providedFields = Number(Boolean(value.photoId)) + Number(Boolean(value.photoIds));
  if (providedFields !== 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide either photoId or photoIds, but not both",
    });
  }
});

// Bulk vote-count lookup used by the frontend's realtime polling - capped at
// 100 so a poll can't be abused into an unbounded fan-out query.
export const voteCountsRequestSchema = z.object({
  contestPhotoIds: z.array(photoIdSchema)
    .min(1, "At least one contest photo ID must be provided")
    .max(100, "At most 100 contest photo IDs can be requested at once"),
});
