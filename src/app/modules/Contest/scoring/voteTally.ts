// The rules for how votes count towards a contest photo slot. Everything here
// is a plain function with no database access, so the rules live in one place
// and can be unit tested. Ranking and vote counts must use these helpers rather
// than repeat the rules.
//
// A "slot" is a ContestPhoto row. Its image can be swapped by a trade, so a
// slot's score is:
//   live votes in the current stint + bankedVotes + initialVotes (original image only)

import { getVoteWeight } from "../../Vote/voteWeight.service";

export type VoteSlot = {
  photoId: string | null;
  originalPhotoId?: string | null;
  initialVotes?: number | null;
  bankedVotes?: number | null;
  stintStartedAt?: Date | null;
  createdAt: Date;
};

export type CountedVote = {
  photoRefId: string | null;
  createdAt: Date;
  power?: number | null;
};

// When the image currently in the slot started there. Rows created before
// stints existed fall back to the slot's own creation time.
export const getStintStart = (slot: Pick<VoteSlot, "stintStartedAt" | "createdAt">) =>
  slot.stintStartedAt ?? slot.createdAt;

// initialVotes belong to the image the slot launched with, so a traded-in image
// does not inherit them.
export const getInitialVotes = (slot: VoteSlot) => {
  const stillOriginalPhoto = !slot.originalPhotoId || slot.originalPhotoId === slot.photoId;
  return stillOriginalPhoto ? (slot.initialVotes || 0) : 0;
};

// A vote counts only if it was cast for the image live in the slot, during its
// current stint. A null photoRefId is a legacy vote from before trades were
// tracked and belongs to whichever image is live.
export const countsForCurrentStint = (slot: VoteSlot, vote: CountedVote) => {
  if (vote.photoRefId !== null && vote.photoRefId !== slot.photoId) {
    return false;
  }
  return vote.createdAt >= getStintStart(slot);
};

// The final score once the slot's live votes have been added up.
export const getSlotScore = (slot: VoteSlot, liveVotes: number) =>
  liveVotes + getInitialVotes(slot) + (slot.bankedVotes || 0);

// Adds one vote to a running total, using the voter's voting power.
export const addVoteWeight = (runningTotal: number, vote: CountedVote) =>
  runningTotal + getVoteWeight(vote);
