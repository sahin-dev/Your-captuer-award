
import { ObjectId } from 'mongodb';
import { z } from 'zod';

const photoIdSchema = z.string().min(1, "Photo ID must not be empty").refine(ObjectId.isValid, {
  message: "Photo ID must be a valid ObjectId string",
});

export const provideVoteShcema = z.object({
  contestPhotoId: photoIdSchema.optional(),
  contestPhotoIds: z.array(photoIdSchema)
    .min(1, "At least one contest photo ID must be provided")
    .max(20, "At most 20 votes can be submitted at once")
    .optional(),
  // Temporary aliases keep older clients working while the canonical request
  // fields are rolled out.
  photoId: photoIdSchema.optional(),
  photoIds: z.array(photoIdSchema)
    .min(1, "At least one contest photo ID must be provided")
    .max(20, "At most 20 votes can be submitted at once")
    .optional(),
}).superRefine((value, context) => {
  const providedFields = [
    value.contestPhotoId,
    value.contestPhotoIds,
    value.photoId,
    value.photoIds,
  ].filter(Boolean).length;

  if (providedFields !== 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide either contestPhotoId or contestPhotoIds, but not both",
    });
  }
}).transform((value) => {
  return {
    contestPhotoId: value.contestPhotoId ?? value.photoId,
    contestPhotoIds: value.contestPhotoIds ?? value.photoIds,
  };
});

// Bulk vote-count lookup used by the frontend's realtime polling - capped at
// 100 so a poll can't be abused into an unbounded fan-out query.
export const voteCountsRequestSchema = z.object({
  contestPhotoIds: z.array(photoIdSchema)
    .min(1, "At least one contest photo ID must be provided")
    .max(100, "At most 100 contest photo IDs can be requested at once"),
});
