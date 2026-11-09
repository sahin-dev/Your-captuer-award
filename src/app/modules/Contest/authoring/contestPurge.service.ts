import httpstatus from "http-status";
import ApiError from "../../../../errors/ApiError";
import { fileUploader } from "../../../../helpers/fileUploader";
import logger from "../../../../shared/logger";
import prisma, { PrismaTx } from "../../../../shared/prisma";
import { runWithWriteConflictRetry } from "../../../../shared/transactionRetry";
import agenda from "../../Agenda";
import { profileCache } from "../../Profile/profile.cache";
import { contestCache } from "../contest.cache";
import { contestRankingService } from "../ContestRanking/contestRanking.service";

const unique = <T>(values: T[]) => Array.from(new Set(values));

// Comments form reply trees, so every descendant of the given comments is
// collected: a reply cannot outlive the comment it answers.
const collectCommentTree = async (tx: PrismaTx, rootIds: string[]) => {
    const collected = new Set<string>();
    let frontier = unique(rootIds);
    while (frontier.length) {
        frontier.forEach((id) => collected.add(id));
        const replies = await tx.comment.findMany({ where: { parentId: { in: frontier } }, select: { id: true } });
        frontier = replies.map((reply) => reply.id).filter((id) => !collected.has(id));
    }
    return Array.from(collected);
};

// Every record that belongs to the contest, children before parents.
const purgeContestRecords = async (tx: PrismaTx, contestId: string) => {
    const [participants, slots] = await Promise.all([
        tx.contestParticipant.findMany({ where: { contestId }, select: { id: true, userId: true } }),
        tx.contestPhoto.findMany({ where: { contestId }, select: { id: true } }),
    ]);
    const participantIds = participants.map((participant) => participant.id);
    const slotIds = slots.map((slot) => slot.id);

    // Votes and comments on the entries.
    await tx.vote.deleteMany({ where: { OR: [{ contestId }, { contestPhotoId: { in: slotIds } }] } });
    const commentRoots = await tx.comment.findMany({ where: { photoId: { in: slotIds } }, select: { id: true } });
    const commentIds = await collectCommentTree(tx, commentRoots.map((comment) => comment.id));
    if (commentIds.length) {
        // Unlink replies first so no comment is deleted while still a parent.
        await tx.comment.updateMany({ where: { id: { in: commentIds } }, data: { parentId: null } });
        await tx.comment.deleteMany({ where: { id: { in: commentIds } } });
    }
    await tx.report.deleteMany({ where: { contestPhotoId: { in: slotIds } } });

    // Entry history, results and rewards.
    await tx.contestPhotoTradeRecord.deleteMany({ where: { contestId } });
    await tx.contestAchievement.deleteMany({ where: { contestId } });
    await tx.contestRankingResult.deleteMany({ where: { contestId } });
    const grants = await tx.contestAwardGrant.findMany({ where: { contestId }, select: { id: true } });
    const grantIds = grants.map((grant) => grant.id);
    if (grantIds.length) {
        await tx.contestRewardTransaction.deleteMany({ where: { grantId: { in: grantIds } } });
        await tx.contestAwardGrant.deleteMany({ where: { id: { in: grantIds } } });
    }
    await tx.contestAwardSelection.deleteMany({ where: { contestId } });
    await tx.photographyOfTheYearResult.deleteMany({ where: { contestId } });
    await tx.photographyOfTheYearTopTenNotification.deleteMany({ where: { contestId } });
    await tx.contestFinalization.deleteMany({ where: { contestId } });
    await tx.pendingWork.deleteMany({ where: { contestId } });

    // Configuration.
    await tx.contestAward.deleteMany({ where: { contestId } });
    await tx.contestLevelAward.deleteMany({ where: { contestId } });
    await tx.contestRuleConfig.deleteMany({ where: { contestId } });
    await tx.contestRule.deleteMany({ where: { contestId } });
    await tx.contestRuleAcceptance.deleteMany({ where: { contestId } });

    // Entry bookkeeping. Payment rows are kept on purpose: they are the Stripe
    // ledger behind the Wallet page and are needed to refund an entry fee.
    await tx.contestEntryFeeTransaction.deleteMany({ where: { contestId } });
    await tx.contestEntryCheckout.deleteMany({ where: { contestId } });

    // Team play tied to the contest.
    await tx.teamMatchHistory.deleteMany({ where: { contest_id: contestId } });
    await tx.teamMatchQueue.deleteMany({ where: { contestId } });
    await tx.teamMatch.deleteMany({ where: { contestId } });
    await tx.teamParticipation.deleteMany({ where: { contestId } });
    await tx.recurringContestOccurrence.updateMany({ where: { contestId }, data: { contestId: null } });

    // Entries, participants and finally the contest itself. Gallery photos
    // (UserPhoto) belong to the photographers and stay in their galleries.
    await tx.contestPhoto.deleteMany({ where: { contestId } });
    await tx.contestParticipant.deleteMany({ where: { contestId } });
    await tx.contest.delete({ where: { id: contestId } });

    return {
        participantUserIds: unique(participants.map((participant) => participant.userId)),
        participantCount: participantIds.length,
        entryCount: slotIds.length,
    };
};

// In-app notifications that point at the contest (joined, top 10, results...).
const deleteContestNotifications = async (contestId: string) => {
    await prisma.$runCommandRaw({
        delete: "notifications",
        deletes: [{ q: { "data.contestId": contestId }, limit: 0 }],
    });
};

// Permanently deletes a contest and everything attached to it, whatever stage
// it is in. Used for Photographer of the Year, which an admin may delete at
// any time (see contestTypePolicy.purgeOnDelete).
const purgeContest = async (contestId: string) => {
    const contest = await prisma.contest.findUnique({ where: { id: contestId }, select: { id: true } });
    if (!contest) {
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found!");
    }

    const result = await runWithWriteConflictRetry(
        () => prisma.$transaction((tx) => purgeContestRecords(tx, contestId), { timeout: 60000, maxWait: 10000 }),
        { label: "contest purge" }
    );

    // The data is gone; anything below is cleanup, so failures are only logged.
    const settle = async (label: string, step: () => Promise<unknown>) => {
        try {
            await step();
        } catch (error) {
            logger.error({ err: error, contestId }, `Contest purge cleanup failed: ${label}`);
        }
    };
    await Promise.all([
        settle("notifications", () => deleteContestNotifications(contestId)),
        // Only the contest's own folder; a banner picked from a user's photo
        // lives in that user's folder and stays.
        settle("storage", () => fileUploader.deleteFolderFromDigitalOcean(`contests/${contestId}/`)),
        settle("scheduled jobs", () => agenda.cancel({ name: "contest:watcher", "data.contestId": contestId })),
        settle("caches", async () => {
            contestRankingService.invalidateContestRanking(contestId);
            await Promise.all([
                contestCache.invalidateContest(contestId),
                profileCache.invalidateUsers(result.participantUserIds),
            ]);
        }),
    ]);

    return result;
};

export const contestPurgeService = {
    purgeContest,
};
