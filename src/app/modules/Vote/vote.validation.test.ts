import assert from "node:assert/strict";
import test from "node:test";
import { provideVoteShcema } from "./validation/vote.validation";

const contestPhotoId = "507f1f77bcf86cd799439011";

test("vote requests use contestPhotoIds as the canonical bulk field", () => {
  const result = provideVoteShcema.parse({ contestPhotoIds: [contestPhotoId] });

  assert.deepEqual(result, {
    contestPhotoId: undefined,
    contestPhotoIds: [contestPhotoId],
  });
});

test("legacy photoIds requests normalize to contestPhotoIds", () => {
  const result = provideVoteShcema.parse({ photoIds: [contestPhotoId] });

  assert.deepEqual(result, {
    contestPhotoId: undefined,
    contestPhotoIds: [contestPhotoId],
  });
});

test("vote requests reject ambiguous single and bulk fields", () => {
  const result = provideVoteShcema.safeParse({
    contestPhotoId,
    contestPhotoIds: [contestPhotoId],
  });

  assert.equal(result.success, false);
});
