import assert from "node:assert/strict";
import test from "node:test";
import { parseContestPhotoIds } from "./contestPhotoInput";

const firstPhotoId = "507f1f77bcf86cd799439011";
const secondPhotoId = "507f1f77bcf86cd799439012";

test("parses JSON-encoded photoIds from multipart form data", () => {
  assert.deepEqual(
    parseContestPhotoIds(JSON.stringify([firstPhotoId, secondPhotoId])),
    [firstPhotoId, secondPhotoId]
  );
});

test("treats a multipart empty array as no selected profile photos", () => {
  assert.deepEqual(parseContestPhotoIds("[]"), []);
});

test("supports repeated fields and removes duplicate photo IDs", () => {
  assert.deepEqual(
    parseContestPhotoIds([firstPhotoId, ` ${secondPhotoId} `, firstPhotoId]),
    [firstPhotoId, secondPhotoId]
  );
});

test("keeps support for a legacy single photo ID", () => {
  assert.deepEqual(parseContestPhotoIds(firstPhotoId), [firstPhotoId]);
});
