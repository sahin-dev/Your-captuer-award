import prisma from "../../../shared/prisma";
import ApiError from "../../../errors/ApiError";
import httpStatus from "http-status";
import { ReportReason, ReportStatus } from "../../../prismaClient";
import { paginationHelper } from "../../../helpers/paginationHelper";
import config from "../../../config";
import { sendMail } from "../../../shared/mailSender";
import { runInBackground } from "../../../shared/backgroundTasks";
import { buildReportNotificationEmail } from "./report.notification";
import { photoTakedownService } from "../Contest/moderation/photoTakedown.service";

const reportUserSelect = { id: true, username: true, fullName: true, email: true, avatar: true } as const;

const createReport = async (
  reporterId: string,
  data: { reportedUserId?: string; contestPhotoId?: string; reason: ReportReason; details?: string }
) => {
  let reportedUserId = data.reportedUserId;
  let userPhotoId: string | null = null;

  if (data.contestPhotoId) {
    const contestPhoto = await prisma.contestPhoto.findUnique({
      where: { id: data.contestPhotoId },
      include: { participant: true }
    });
    if (!contestPhoto) {
      throw new ApiError(httpStatus.NOT_FOUND, "Referenced contest photo not found");
    }
    // Blind voting hides the photographer's identity from the reporter's browser -
    // resolve who's being reported from the photo itself rather than trusting a
    // client-supplied reportedUserId for this path.
    reportedUserId = contestPhoto.participant.userId;
    // Remember the exact image on screen; the slot may be traded to another later.
    userPhotoId = contestPhoto.photoId;
  }

  if (!reportedUserId) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Unable to determine who is being reported");
  }

  if (reportedUserId === reporterId) {
    throw new ApiError(httpStatus.BAD_REQUEST, "You cannot report yourself");
  }

  const reportedUser = await prisma.user.findUnique({ where: { id: reportedUserId } });
  if (!reportedUser) {
    throw new ApiError(httpStatus.NOT_FOUND, "Reported user not found");
  }

  const report = await prisma.report.create({
    data: {
      reporterId,
      reportedUserId,
      contestPhotoId: data.contestPhotoId,
      userPhotoId,
      reason: data.reason,
      details: data.details,
    },
  });

  runInBackground(`report-notification:${report.id}`, async () => {
    const [enrichedReport] = await enrichReports([report]);
    const email = buildReportNotificationEmail(enrichedReport);

    await sendMail({
      to: config.reportNotificationEmail,
      replyTo: enrichedReport.reporter?.email,
      ...email,
    });
  });

  return report;
};

const enrichReports = async <
  T extends { reporterId: string; reportedUserId: string; contestPhotoId: string | null; userPhotoId?: string | null }
>(
  reports: T[]
) => {
  const reporterIds = [...new Set(reports.map((r) => r.reporterId))];
  const reportedUserIds = [...new Set(reports.map((r) => r.reportedUserId))];
  const contestPhotoIds = [...new Set(reports.filter((r) => r.contestPhotoId).map((r) => r.contestPhotoId as string))];

  const [reporters, reportedUsers, contestPhotos] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: reporterIds } }, select: reportUserSelect }),
    prisma.user.findMany({ where: { id: { in: reportedUserIds } }, select: { ...reportUserSelect, isBlocked: true } }),
    prisma.contestPhoto.findMany({
      where: { id: { in: contestPhotoIds } },
      include: { photo: { select: { id: true, url: true, title: true } } },
    }),
  ]);

  // Admin needs to see which contest a reported photo belongs to (banner/title/
  // description) to sanity-check the report - contestPhoto has no direct Contest
  // relation, so look these up separately by contestId.
  const contestIds = [...new Set(contestPhotos.map((p) => p.contestId))];
  const contests = contestIds.length
    ? await prisma.contest.findMany({
        where: { id: { in: contestIds } },
        select: { id: true, title: true, description: true, banner: true },
      })
    : [];
  const contestById = new Map(contests.map((c) => [c.id, c]));

  const reporterById = new Map(reporters.map((u) => [u.id, u]));
  const reportedUserById = new Map(reportedUsers.map((u) => [u.id, u]));
  const contestPhotoById = new Map(
    contestPhotos.map((p) => [p.id, { ...p, contest: contestById.get(p.contestId) || null }])
  );

  // The image that was actually reported. Reports filed before userPhotoId was
  // recorded fall back to whatever the slot shows now. Null once the photo has
  // been removed from the platform.
  const reportedPhotoIdOf = (report: T) =>
    report.userPhotoId ?? (report.contestPhotoId ? contestPhotoById.get(report.contestPhotoId)?.photoId ?? null : null);
  const reportedPhotoIds = [...new Set(reports.flatMap((r) => {
    const id = reportedPhotoIdOf(r);
    return id ? [id] : [];
  }))];
  const reportedPhotos = reportedPhotoIds.length
    ? await prisma.userPhoto.findMany({
        where: { id: { in: reportedPhotoIds } },
        select: { id: true, url: true, title: true, userId: true },
      })
    : [];
  const reportedPhotoById = new Map(reportedPhotos.map((p) => [p.id, p]));

  return reports.map((report) => {
    const reportedPhotoId = reportedPhotoIdOf(report);
    return {
      ...report,
      reporter: reporterById.get(report.reporterId) || null,
      reportedUser: reportedUserById.get(report.reportedUserId) || null,
      contestPhoto: report.contestPhotoId ? contestPhotoById.get(report.contestPhotoId) || null : null,
      reportedPhoto: reportedPhotoId ? reportedPhotoById.get(reportedPhotoId) || null : null,
    };
  });
};

const getReports = async (page = 1, limit = 20, status?: ReportStatus) => {
  const { skip, limit: paginationLimit, page: currentPage } = paginationHelper.calculatePagination({ page, limit });
  const where = status ? { status } : {};

  const [reports, total] = await Promise.all([
    prisma.report.findMany({ where, skip, take: paginationLimit, orderBy: { createdAt: "desc" } }),
    prisma.report.count({ where }),
  ]);

  return {
    data: await enrichReports(reports),
    total,
    page: currentPage,
    limit: paginationLimit,
    meta: paginationHelper.getPaginationMetaData(currentPage, paginationLimit, total),
  };
};

const getReportById = async (reportId: string) => {
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) {
    throw new ApiError(httpStatus.NOT_FOUND, "Report not found");
  }

  const [enriched] = await enrichReports([report]);
  return enriched;
};

const reviewReport = async (
  reportId: string,
  adminId: string,
  status: "ACTION_TAKEN" | "DISMISSED",
  resolutionNote?: string
) => {
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) {
    throw new ApiError(httpStatus.NOT_FOUND, "Report not found");
  }

  return prisma.report.update({
    where: { id: reportId },
    data: { status: status as ReportStatus, resolutionNote, reviewedById: adminId, reviewedAt: new Date() },
  });
};

// Used by the admin contest-photo-delete action (Contest/contest.service.ts) to resolve
// a report in the same step as removing the photo it was filed against.
const markActionTaken = async (reportId: string, adminId: string, resolutionNote?: string) => {
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) {
    throw new ApiError(httpStatus.NOT_FOUND, "Report not found");
  }

  return prisma.report.update({
    where: { id: reportId },
    data: { status: ReportStatus.ACTION_TAKEN, resolutionNote, reviewedById: adminId, reviewedAt: new Date() },
  });
};

// Admin takedown from the report queue: deletes the reported image from the
// whole platform (gallery, every contest entry, stored file) and resolves this
// report plus every other open report about the same image.
const removeReportedPhotoFromPlatform = async (reportId: string, adminId: string, reason?: string) => {
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) {
    throw new ApiError(httpStatus.NOT_FOUND, "Report not found");
  }
  if (!report.contestPhotoId && !report.userPhotoId) {
    throw new ApiError(httpStatus.BAD_REQUEST, "This report is not about a photo");
  }

  let userPhotoId = report.userPhotoId;
  if (!userPhotoId && report.contestPhotoId) {
    const slot = await prisma.contestPhoto.findUnique({
      where: { id: report.contestPhotoId },
      select: { photoId: true },
    });
    userPhotoId = slot?.photoId ?? null;
  }
  if (!userPhotoId) {
    throw new ApiError(httpStatus.NOT_FOUND, "The reported photo has already been removed");
  }

  const resolutionNote = reason?.trim() || "Photo removed from the platform";
  const result = await photoTakedownService.takeDownUserPhoto(userPhotoId, reason?.trim() || undefined);

  const resolution = { status: ReportStatus.ACTION_TAKEN, resolutionNote, reviewedById: adminId, reviewedAt: new Date() };
  await prisma.report.update({ where: { id: reportId }, data: resolution });
  const othersResolved = await prisma.report.updateMany({
    where: {
      id: { not: reportId },
      status: ReportStatus.PENDING,
      OR: [
        { userPhotoId },
        // Older reports only know the slot (the field is missing on them), so
        // match the slots that were showing this photo.
        ...(result.affectedContestPhotoIds.length
          ? [{
              contestPhotoId: { in: result.affectedContestPhotoIds },
              OR: [{ userPhotoId: { isSet: false } }, { userPhotoId: null }],
            }]
          : []),
      ],
    },
    data: resolution,
  });

  return {
    ...result,
    resolvedReportCount: othersResolved.count + 1,
  };
};

export const reportService = {
  createReport,
  getReports,
  getReportById,
  reviewReport,
  markActionTaken,
  removeReportedPhotoFromPlatform,
};
