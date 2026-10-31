import { contestRankingService } from "../../modules/Contest/ContestRanking/contestRanking.service";
import { profileCache } from "../../modules/Profile/profile.cache";
import { userStoreCache } from "../../modules/User/UserStore/userStore.cache";
import { onEvent } from "../domainEvents";

// Cached data that must be refreshed after contest activity. Vote side effects
// live in Vote/vote.service, and end-of-contest work runs through
// ContestFinalization/contestFinalization.service.

onEvent("user.storeChanged", async ({ userId }) => {
  await Promise.all([
    userStoreCache.invalidateUserStoreReadModels(userId),
    profileCache.invalidateUser(userId),
  ]);
});

onEvent("contest.photosChanged", async ({ contestId, userId }) => {
  contestRankingService.invalidateContestRanking(contestId);
  await profileCache.invalidateUser(userId);
});
