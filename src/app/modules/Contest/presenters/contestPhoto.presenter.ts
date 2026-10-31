// The shapes contest photos are sent to clients in. Keeping them here means the
// services return data and these functions decide what the API looks like, so a
// future API version can add a new shape without touching the queries.

type LibraryPhoto = { id: string; url: string };

// A photo in the voting feed, or in a contest's photo list.
const toVotablePhoto = (contestPhotoId: string, photo: LibraryPhoto, voteCount: number) => ({
  id: contestPhotoId,
  contestPhotoId,
  photoId: photo.id,
  url: photo.url,
  voteCount,
});

// A photo as its owner sees it. The repeated vote fields are aliases that older
// clients read, so all of them must stay until those clients are retired.
const toOwnerPhoto = <T extends { createdAt: Date; updatedAt: Date; promoted: boolean }>(
  slot: T,
  photo: LibraryPhoto,
  voteCount: number,
  totalVotes: number,
) => ({
  ...slot,
  userPhotoId: photo.id,
  url: photo.url,
  voteCount,
  totalVotes,
  votes: totalVotes,
  vote_count: voteCount,
  total_votes: totalVotes,
  traded: slot.updatedAt.getTime() > slot.createdAt.getTime() && !slot.promoted,
});

export const contestPhotoPresenter = {
  toVotablePhoto,
  toOwnerPhoto,
};
