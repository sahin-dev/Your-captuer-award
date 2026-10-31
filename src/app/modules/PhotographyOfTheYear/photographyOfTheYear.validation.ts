import { checkObjectId } from "../../../helpers/checkObjectId";
import { z } from "zod";

const photoId = (label: string) => z.string().trim().refine(checkObjectId, { message: `${label} is invalid` });

export const submitJudgingResultsSchema = z.object({
  // New clients submit an ordered list so judging can publish one, two, or
  // more than three winners. Keep the legacy fields optional for older admin
  // clients that still submit exactly three placements.
  winnerPhotoIds: z.array(photoId("Winner photo")).min(1).max(10).optional(),
  firstPhotoId: photoId("First-place photo").optional(),
  secondPhotoId: photoId("Second-place photo").optional(),
  thirdPhotoId: photoId("Third-place photo").optional(),
}).superRefine((value, ctx) => {
  const winnerPhotoIds = value.winnerPhotoIds?.length
    ? value.winnerPhotoIds
    : [value.firstPhotoId, value.secondPhotoId, value.thirdPhotoId].filter(
        (id): id is string => Boolean(id),
      );

  if (winnerPhotoIds.length < 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Select at least one winner" });
    return;
  }
  if (winnerPhotoIds.length > 10) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A maximum of 10 winners can be selected" });
  }
  if (new Set(winnerPhotoIds).size !== winnerPhotoIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Each selected winner must be a different photo" });
  }
});

