import z from "zod";
import { ReportReason } from "../../../prismaClient";

// reportedUserId is optional at the schema level because blind voting hides the
// photographer's identity from the client - when only contestPhotoId is given, the
// service resolves the reported user server-side from the photo's participant so
// the reporter's browser never needs to know whose photo it is.
const createReportSchema = z.object({
  reportedUserId: z.string().min(1).optional(),
  contestPhotoId: z.string().optional(),
  reason: z.nativeEnum(ReportReason, { required_error: "reason is required" }),
  details: z.string().optional(),
}).refine(data => Boolean(data.reportedUserId || data.contestPhotoId), {
  message: "Either reportedUserId or contestPhotoId is required",
});

const reviewReportSchema = z.object({
  status: z.enum(["ACTION_TAKEN", "DISMISSED"], { required_error: "status is required" }),
  resolutionNote: z.string().optional(),
});

export const reportValidation = {
  createReportSchema,
  reviewReportSchema,
};
