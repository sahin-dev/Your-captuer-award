import bcrypt from "bcryptjs"
import httpstatus from "http-status"
import ApiError from "../../../errors/ApiError"
import prisma, { PrismaTx } from "../../../shared/prisma"
import logger from "../../../shared/logger"
import { runWithWriteConflictRetry } from "../../../shared/transactionRetry"
import { ContestStatus, MemberLevel, UserRole } from "../../../prismaClient"
import { fileUploader } from "../../../helpers/fileUploader"
import { toFileKey } from "../../../helpers/fileUrl"
import { getIO, onlineUsers, userSockets } from "../../../helpers/websocketSetUp"
import { PaymentFactory } from "../Payment/paymentFactory"
import { purgeTeamRecords, teamService } from "../Team/team.service"
import { contestCache } from "../Contest/contest.cache"
import { contestRankingService } from "../Contest/ContestRanking/contestRanking.service"
import { userCache } from "./user.cache"
import { authCache } from "../Auth/auth.cache"
import { profileCache } from "../Profile/profile.cache"
import { userStoreCache } from "./UserStore/userStore.cache"

// Hard-deletes a user and every record that belongs to them.
//
// Shared records are handled so other users are not left with broken data:
// - an owned team is handed to another member, or purged when no one is left;
// - contests and recurring contests the user created move to another admin;
// - a contest banner picked from the user's gallery is copied out first;
// - completed contests keep their persisted ranks (the user's rows leave gaps,
//   nobody is re-ranked or re-awarded); live contests re-rank on the next read.
//
// The database work runs in one transaction, so a failure changes nothing and
// the user can retry. Storage and other best-effort cleanup runs afterwards.

const DELETE_CONFIRMATION = "DELETE"

const isFullUrl = (value: string) => /^https?:\/\//i.test(value)

// Storage key of one of our uploads, or null for external URLs (social avatars,
// default images) that must never be deleted.
const ownStorageKey = (value: string | null | undefined) => {
    const key = value ? toFileKey(value) : null
    return key && !isFullUrl(key) ? key : null
}

const unique = <T>(values: T[]) => Array.from(new Set(values))

const verifyDeletionRequest = async (
    user: { password: string | null },
    input: { password?: string; confirm?: string }
) => {
    if (user.password) {
        if (!input.password) {
            throw new ApiError(httpstatus.BAD_REQUEST, "Password is required")
        }
        if (!await bcrypt.compare(input.password, user.password)) {
            throw new ApiError(httpstatus.BAD_REQUEST, "Password is incorrect")
        }
        return
    }

    // Social-only accounts have no password; they confirm explicitly instead.
    if (input.confirm !== DELETE_CONFIRMATION) {
        throw new ApiError(httpstatus.BAD_REQUEST, `Type "${DELETE_CONFIRMATION}" to confirm account deletion`)
    }
}

// Deleting votes or entries while a contest is being finalized would change
// results mid-calculation and could let the worker re-create the user's store.
const assertNoFinalizingContest = async (userId: string) => {
    const finalizing = await prisma.contest.findFirst({
        where: {
            status: ContestStatus.FINALIZING,
            OR: [
                { participants: { some: { userId } } },
                { votes: { some: { providerId: userId } } },
            ],
        },
        select: { id: true },
    })
    if (finalizing) {
        throw new ApiError(
            httpstatus.CONFLICT,
            "A contest you took part in is being finalized. Please try again in a few minutes."
        )
    }
}

// Contests are shared, so the ones this user created move to another admin.
const findContestSuccessor = async (userId: string) => {
    const [ownedContests, ownedRecurringContests] = await Promise.all([
        prisma.contest.count({ where: { creatorId: userId } }),
        prisma.recurringContest.count({ where: { creatorId: userId } }),
    ])
    if (!ownedContests && !ownedRecurringContests) return null

    const successor = await prisma.user.findFirst({
        where: { role: UserRole.ADMIN, id: { not: userId }, isDeleted: false },
        orderBy: { createdAt: "asc" },
        select: { id: true },
    })
    if (!successor) {
        throw new ApiError(
            httpstatus.CONFLICT,
            "This account owns contests and no other admin exists to take them over"
        )
    }
    return successor.id
}

// A contest banner may be a photo from the user's gallery. Copy it into the
// contest's own folder so deleting the user's files does not break the banner.
const relocateBorrowedBanners = async (userId: string) => {
    const userPrefix = `users/${userId}/`
    const [contests, recurringContests] = await Promise.all([
        prisma.contest.findMany({ where: { bannerUploaderId: userId }, select: { id: true, banner: true } }),
        prisma.recurringContest.findMany({ where: { bannerUploaderId: userId }, select: { id: true, banner: true } }),
    ])

    const relocate = async (records: { id: string; banner: string | null }[]) => {
        const moved = new Map<string, string>()
        for (const record of records) {
            const key = ownStorageKey(record.banner)
            if (!key?.startsWith(userPrefix)) continue
            moved.set(record.id, await fileUploader.copyInDigitalOcean(key, `contests/${record.id}/banner`))
        }
        return moved
    }

    return {
        contestBanners: await relocate(contests),
        recurringContestBanners: await relocate(recurringContests),
    }
}

const deleteStripeCustomer = async (customerId: string | null) => {
    if (!customerId) return
    const provider = PaymentFactory.getProvider("STRIPE")
    await provider.deleteCustomer?.(customerId)
}

// Comments form reply trees. Collect every descendant of the given comments,
// since a reply cannot outlive the comment it answers.
const collectCommentTree = async (tx: PrismaTx, rootIds: string[]) => {
    const collected = new Set<string>()
    let frontier = unique(rootIds)
    while (frontier.length) {
        frontier.forEach((id) => collected.add(id))
        const replies = await tx.comment.findMany({ where: { parentId: { in: frontier } }, select: { id: true } })
        frontier = replies.map((reply) => reply.id).filter((id) => !collected.has(id))
    }
    return Array.from(collected)
}

const pickTeamSuccessor = <T extends { level: MemberLevel }>(members: T[]) =>
    members.find((member) => member.level === MemberLevel.LEADER)
    ?? members.find((member) => member.level === MemberLevel.MODERATOR)
    ?? members[0]

// Removes the user from their team and from any team they still own. A team
// with other members is handed over; an empty team is purged.
const releaseTeams = async (tx: PrismaTx, userId: string) => {
    const [membership, ownedTeams] = await Promise.all([
        tx.teamMember.findUnique({ where: { memberId: userId } }),
        tx.team.findMany({ where: { creatorId: userId }, select: { id: true } }),
    ])
    const teamIds = unique([
        ...(membership ? [membership.teamId] : []),
        ...ownedTeams.map((team) => team.id),
    ])
    const purgedTeamIds: string[] = []
    const affectedMemberIds: string[] = []

    for (const teamId of teamIds) {
        const team = await tx.team.findUnique({ where: { id: teamId }, select: { creatorId: true } })
        if (!team) continue

        // Oldest members first, so the longest-standing member takes over.
        const remaining = await tx.teamMember.findMany({
            where: { teamId, memberId: { not: userId } },
            orderBy: { createdAt: "asc" },
            select: { id: true, memberId: true, level: true },
        })

        if (!remaining.length) {
            await purgeTeamRecords(tx, teamId)
            purgedTeamIds.push(teamId)
            continue
        }

        const successor = pickTeamSuccessor(remaining)
        if (successor.level !== MemberLevel.LEADER) {
            await tx.teamMember.update({ where: { id: successor.id }, data: { level: MemberLevel.LEADER } })
        }
        if (team.creatorId === userId) {
            await tx.team.update({ where: { id: teamId }, data: { creatorId: successor.memberId } })
        }

        if (membership?.teamId === teamId) {
            // Rosters captured by team matches hold membership ids.
            const matches = await tx.teamMatch.findMany({
                where: { OR: [{ team1_member_ids: { has: membership.id } }, { team2_member_ids: { has: membership.id } }] },
                select: { id: true, team1_member_ids: true, team2_member_ids: true },
            })
            for (const match of matches) {
                await tx.teamMatch.update({
                    where: { id: match.id },
                    data: {
                        team1_member_ids: match.team1_member_ids.filter((id) => id !== membership.id),
                        team2_member_ids: match.team2_member_ids.filter((id) => id !== membership.id),
                    },
                })
            }
            await tx.contestParticipant.updateMany({ where: { memberId: membership.id }, data: { memberId: null } })
            await tx.teamMember.delete({ where: { id: membership.id } })
        }

        // Recount instead of decrementing so a drifted counter is repaired too.
        await tx.team.update({ where: { id: teamId }, data: { member_count: remaining.length } })
        affectedMemberIds.push(...remaining.map((member) => member.memberId))
    }

    return { purgedTeamIds, affectedMemberIds }
}

const purgeUserRecords = async (
    tx: PrismaTx,
    user: { id: string; email: string },
    options: {
        contestSuccessorId: string | null
        contestBanners: Map<string, string>
        recurringContestBanners: Map<string, string>
    }
) => {
    const userId = user.id

    // Shared contests: move ownership and detach banner credit.
    if (options.contestSuccessorId) {
        await tx.contest.updateMany({ where: { creatorId: userId }, data: { creatorId: options.contestSuccessorId } })
        await tx.recurringContest.updateMany({ where: { creatorId: userId }, data: { creatorId: options.contestSuccessorId } })
    }
    for (const [contestId, banner] of options.contestBanners) {
        await tx.contest.update({ where: { id: contestId }, data: { banner } })
    }
    for (const [recurringContestId, banner] of options.recurringContestBanners) {
        await tx.recurringContest.update({ where: { id: recurringContestId }, data: { banner } })
    }
    await tx.contest.updateMany({ where: { bannerUploaderId: userId }, data: { bannerUploaderId: null } })
    await tx.recurringContest.updateMany({ where: { bannerUploaderId: userId }, data: { bannerUploaderId: null } })

    // Teams.
    const teams = await releaseTeams(tx, userId)
    await tx.teamMatch.updateMany({ where: { started_by_id: userId }, data: { started_by_id: null } })
    await tx.teamMatchQueue.deleteMany({ where: { started_by_id: userId } })
    await tx.teamInvitation.deleteMany({ where: { OR: [{ senderId: userId }, { receiverId: userId }] } })
    await tx.teamJoinRequest.deleteMany({ where: { requesterId: userId } })
    await tx.teamRewardTransaction.deleteMany({ where: { userId } })

    const sentChats = await tx.chat.findMany({ where: { senderId: userId }, select: { fileUrl: true } })
    await tx.chat.deleteMany({ where: { senderId: userId } })

    // Contest graph: entries, votes cast and received, results and rewards.
    const [participants, userPhotos] = await Promise.all([
        tx.contestParticipant.findMany({ where: { userId }, select: { id: true, contestId: true } }),
        tx.userPhoto.findMany({ where: { userId }, select: { id: true, url: true } }),
    ])
    const participantIds = participants.map((participant) => participant.id)
    const userPhotoIds = userPhotos.map((photo) => photo.id)
    const contestPhotos = await tx.contestPhoto.findMany({
        where: { participantId: { in: participantIds } },
        select: { id: true },
    })
    const contestPhotoIds = contestPhotos.map((photo) => photo.id)

    const votedContests = await tx.vote.findMany({
        where: { providerId: userId },
        select: { contestId: true },
        distinct: ["contestId"],
    })
    const affectedContestIds = unique([
        ...participants.map((participant) => participant.contestId),
        ...votedContests.map((vote) => vote.contestId),
    ])

    await tx.vote.deleteMany({
        where: { OR: [{ providerId: userId }, { contestPhotoId: { in: contestPhotoIds } }] },
    })

    const commentRoots = await tx.comment.findMany({
        where: { OR: [{ providerId: userId }, { photoId: { in: contestPhotoIds } }] },
        select: { id: true },
    })
    const commentIds = await collectCommentTree(tx, commentRoots.map((comment) => comment.id))
    if (commentIds.length) {
        // Unlink replies first so no comment is deleted while still a parent.
        await tx.comment.updateMany({ where: { id: { in: commentIds } }, data: { parentId: null } })
        await tx.comment.deleteMany({ where: { id: { in: commentIds } } })
    }

    await tx.contestPhotoTradeRecord.deleteMany({
        where: {
            OR: [
                { participantId: { in: participantIds } },
                { photoId: { in: userPhotoIds } },
                { fromContestPhotoId: { in: contestPhotoIds } },
            ],
        },
    })
    await tx.contestPhotoTradeRecord.updateMany({
        where: { toContestPhotoId: { in: contestPhotoIds } },
        data: { toContestPhotoId: null },
    })
    await tx.contestAchievement.deleteMany({
        where: { OR: [{ participantId: { in: participantIds } }, { photoId: { in: contestPhotoIds } }] },
    })
    await tx.contestRankingResult.deleteMany({ where: { participantId: { in: participantIds } } })

    const grants = await tx.contestAwardGrant.findMany({
        where: { OR: [{ userId }, { participantId: { in: participantIds } }] },
        select: { id: true },
    })
    await tx.contestRewardTransaction.deleteMany({
        where: { OR: [{ userId }, { grantId: { in: grants.map((grant) => grant.id) } }] },
    })
    await tx.contestAwardGrant.deleteMany({ where: { id: { in: grants.map((grant) => grant.id) } } })
    await tx.contestAwardSelection.deleteMany({
        where: {
            OR: [
                { participantId: { in: participantIds } },
                { photoId: { in: contestPhotoIds } },
                { selectedById: userId },
            ],
        },
    })
    await tx.contestRuleAcceptance.deleteMany({ where: { userId } })
    await tx.contestEntryFeeTransaction.deleteMany({ where: { userId } })
    await tx.contestEntryCheckout.deleteMany({ where: { userId } })

    // Reports filed by or about the user go; reports they reviewed as an
    // admin stay with the reviewer cleared, since they concern other users.
    await tx.report.deleteMany({
        where: {
            OR: [
                { reporterId: userId },
                { reportedUserId: userId },
                { contestPhotoId: { in: contestPhotoIds } },
            ],
        },
    })
    await tx.report.updateMany({ where: { reviewedById: userId }, data: { reviewedById: null } })

    await tx.contestPhoto.deleteMany({ where: { id: { in: contestPhotoIds } } })
    // Never expected, but a slot elsewhere must not point at a deleted photo.
    await tx.contestPhoto.updateMany({ where: { photoId: { in: userPhotoIds } }, data: { photoId: null } })
    await tx.contestParticipant.deleteMany({ where: { id: { in: participantIds } } })

    // Social graph.
    const [likesReceived, follows] = await Promise.all([
        tx.like.findMany({ where: { photoId: { in: userPhotoIds } }, select: { providerId: true } }),
        tx.follow.findMany({
            where: { OR: [{ followerId: userId }, { followingId: userId }] },
            select: { followerId: true, followingId: true },
        }),
    ])
    await tx.like.deleteMany({ where: { OR: [{ providerId: userId }, { photoId: { in: userPhotoIds } }] } })
    await tx.follow.deleteMany({ where: { OR: [{ followerId: userId }, { followingId: userId }] } })

    // Inbox, payments and support.
    await tx.notification.deleteMany({ where: { receiverId: userId } })
    await tx.payment.deleteMany({ where: { userId } })
    await tx.subscription.deleteMany({ where: { userId } })
    await tx.purchaseRecords.deleteMany({ where: { userId } })
    await tx.support.deleteMany({ where: { email: user.email } })

    // Private data and the account itself.
    await tx.otp.deleteMany({ where: { userId } })
    await tx.userLevel.deleteMany({ where: { userId } })
    await tx.userStore.deleteMany({ where: { userId } })
    await tx.userPhoto.deleteMany({ where: { userId } })
    await tx.user.delete({ where: { id: userId } })

    return {
        purgedTeamIds: teams.purgedTeamIds,
        affectedContestIds,
        userPhotoIds,
        relatedUserIds: unique([
            ...teams.affectedMemberIds,
            ...likesReceived.flatMap((like) => like.providerId ? [like.providerId] : []),
            ...follows.flatMap((follow) => [follow.followerId, follow.followingId]),
        ]).filter((id) => id !== userId),
        fileKeys: [
            ...userPhotos.map((photo) => photo.url),
            ...sentChats.map((chat) => chat.fileUrl),
        ],
    }
}

// Other users' notifications that name this user (votes, comments, invites).
const deleteNotificationsAboutUser = async (userId: string) => {
    await prisma.$runCommandRaw({
        delete: "notifications",
        deletes: [{
            q: {
                $or: [
                    { "data.voterId": userId },
                    { "data.commenterId": userId },
                    { "data.inviterId": userId },
                ],
            },
            limit: 0,
        }],
    })
}

const disconnectUserSockets = (userId: string) => {
    onlineUsers.delete(userId)
    userSockets.delete(userId)
    // Every socket of a user joins a room named after the user id.
    getIO()?.in(userId).disconnectSockets(true)
}

const deleteUserFiles = async (userId: string, fileKeys: string[], purgedTeamIds: string[]) => {
    const userPrefix = `users/${userId}/`
    // Files uploaded before per-user folders live elsewhere; delete those one by one.
    const legacyKeys = unique(fileKeys.flatMap((value) => {
        const key = ownStorageKey(value)
        return key && !key.startsWith(userPrefix) ? [key] : []
    }))

    await Promise.all([
        fileUploader.deleteFolderFromDigitalOcean(userPrefix),
        ...legacyKeys.map((key) => fileUploader.deleteFromDigitalOcean(key)),
        ...purgedTeamIds.map((teamId) => fileUploader.deleteFolderFromDigitalOcean(`teams/${teamId}/`)),
    ])
}

// Runs a cleanup step after the account is gone; a failure is logged, not thrown,
// because the deletion itself has already been committed.
const bestEffort = async (label: string, userId: string, step: () => Promise<unknown>) => {
    try {
        await step()
    } catch (error) {
        logger.error({ err: error, userId }, `Account deletion cleanup failed: ${label}`)
    }
}

const findUserForDeletion = async (userId: string) => {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, password: true, avatar: true, cover: true, customerId: true },
    })
    if (!user) {
        throw new ApiError(httpstatus.NOT_FOUND, "User not found")
    }
    return user
}

// Self-service deletion: the user proves it is them, then everything is purged.
const deleteAccount = async (userId: string, input: { password?: string; confirm?: string }) => {
    const user = await findUserForDeletion(userId)
    await verifyDeletionRequest(user, input)
    return purgeAccount(user.id)
}

// Purges an account without asking for a password. Only for trusted callers,
// such as the script that cleans up accounts soft-deleted before hard delete existed.
const purgeAccount = async (userId: string) => {
    const user = await findUserForDeletion(userId)
    await assertNoFinalizingContest(userId)
    const contestSuccessorId = await findContestSuccessor(userId)

    // External steps that must succeed before any data is removed.
    const banners = await relocateBorrowedBanners(userId)
    await deleteStripeCustomer(user.customerId)

    const result = await runWithWriteConflictRetry(
        () => prisma.$transaction(
            (tx) => purgeUserRecords(tx, user, { contestSuccessorId, ...banners }),
            { timeout: 60000, maxWait: 10000 }
        ),
        { label: "account deletion" }
    )

    disconnectUserSockets(userId)

    await Promise.all([
        bestEffort("notifications", userId, () => deleteNotificationsAboutUser(userId)),
        bestEffort("caches", userId, async () => {
            result.affectedContestIds.forEach((contestId) => contestRankingService.invalidateContestRanking(contestId))
            await Promise.all([
                userCache.invalidateUser(userId),
                authCache.invalidateAuthenticatedUser(userId),
                profileCache.invalidateUser(userId),
                userStoreCache.invalidateStore(userId),
                profileCache.invalidateUsers(result.relatedUserIds),
                teamService.invalidateTeamMembershipReadModels(result.relatedUserIds),
                ...result.userPhotoIds.map((photoId) => profileCache.invalidatePhoto(photoId)),
                ...result.affectedContestIds.map((contestId) => contestCache.invalidateContest(contestId)),
            ])
        }),
        bestEffort("files", userId, () => deleteUserFiles(
            userId,
            [user.avatar, user.cover, ...result.fileKeys].filter((value): value is string => Boolean(value)),
            result.purgedTeamIds
        )),
    ])

    return "Account deleted successfully"
}

export const accountDeletionService = {
    deleteAccount,
    purgeAccount,
}
