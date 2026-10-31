import { contestPhotoActions } from "./actions/contestPhotoActions";
import { contestAuthoringService } from "./authoring/contestAuthoring.service";
import { contestFinalizationService } from "./ContestFinalization/contestFinalization.service";
import { getContestUploadFiles } from "./contestPhotoInput";
import { contestEntryService } from "./entry/contestEntry.service";
import { exposureService } from "./exposure/exposure.service";
import { contestModerationService } from "./moderation/contestModeration.service";
import { contestLeaderboardService } from "./read/contestLeaderboard.service";
import { contestQueryService } from "./read/contestQuery.service";
import { getParticipantLevelData } from "./read/participantLevel";
import { votingFeedService } from "./read/votingFeed.service";
import { recurringMaterializer } from "./recurring/recurringMaterializer";

// One entry point for the contest system. This file holds no logic; each feature
// lives in its own folder:
//   authoring/   create, edit and delete contests
//   recurring/   recurring templates and their generated contests
//   entry/       join a contest, submit and withdraw photos
//   actions/     paid actions: promote, trade, charge
//   exposure/    the exposure meter
//   moderation/  admin photo removal, participants
//   read/        lists, details, voting feed, leaderboards
//   presenters/  the shapes sent to clients
export const contestService = {
    ...contestAuthoringService,
    ...recurringMaterializer,
    ...contestEntryService,
    ...contestPhotoActions,
    ...exposureService,
    ...contestModerationService,
    ...contestQueryService,
    ...contestLeaderboardService,
    ...votingFeedService,
    getContestUploadFiles,
    getParticipantLevelData,
    identifyWinner:contestFinalizationService.finalizeContest,
    selectAwardPhoto:contestFinalizationService.selectAwardPhoto,
    getContestAwardSelections:contestFinalizationService.getContestAwardSelections,
}
