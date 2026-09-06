import prisma from "../../../shared/prisma";
import ApiError from "../../../errors/ApiError";
import httpStatus from "http-status";
import { ReportReason, ReportStatus } from "../../../prismaClient";
import { paginationHelper } from "../../../helpers/paginationHelper";

const reportUserSelect = { id: true, username: true, fullName: true, email: true, avatar: true } as const;

const createReport = async (
  reporterId: string,
  data: { reportedUserId?: string; contestPhotoId?: string; reason: ReportReason; details?: string }
) => {
  let reportedUserId = data.reportedUserId;

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

  return prisma.report.create({
    data: {
      reporterId,
      reportedUserId,
      contestPhotoId: data.contestPhotoId,
      reason: data.reason,
      details: data.details,
    },
  });
};

const enrichReports = async <T extends { reporterId: string; reportedUserId: string; contestPhotoId: string | null }>(
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

  const reporterById = new Map(reporters.map((u) => [u.id, u]));
  const reportedUserById = new Map(reportedUsers.map((u) => [u.id, u]));
  const contestPhotoById = new Map(contestPhotos.map((p) => [p.id, p]));

  return reports.map((report) => ({
    ...report,
    reporter: reporterById.get(report.reporterId) || null,
    reportedUser: reportedUserById.get(report.reportedUserId) || null,
    contestPhoto: report.contestPhotoId ? contestPhotoById.get(report.contestPhotoId) || null : null,
  }));
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

export const reportService = {
  createReport,
  getReports,
  getReportById,
  reviewReport,
  markActionTaken,
};
