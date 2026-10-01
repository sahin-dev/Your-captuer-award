type ReportNotificationUser = {
  id: string;
  username: string | null;
  fullName: string | null;
  email: string;
};

type ReportNotificationPhoto = {
  id: string;
  title: string | null;
  url: string;
};

type ReportNotificationContest = {
  id: string;
  title: string;
};

export type ReportNotification = {
  id: string;
  reason: string;
  details: string | null;
  status: string;
  createdAt: Date;
  reporter: ReportNotificationUser | null;
  reportedUser: ReportNotificationUser | null;
  contestPhoto: {
    id: string;
    title: string | null;
    photo: ReportNotificationPhoto | null;
    contest: ReportNotificationContest | null;
  } | null;
};

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const humanize = (value: string) =>
  value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const displayName = (user: ReportNotificationUser | null) =>
  user?.fullName || user?.username || user?.email || "Unknown user";

const safeHttpUrl = (value: string | undefined): string | null => {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
};

const userText = (label: string, user: ReportNotificationUser | null) =>
  user
    ? `${label}: ${displayName(user)} (${user.email})\n${label} ID: ${user.id}`
    : `${label}: Unknown user`;

export const buildReportNotificationEmail = (report: ReportNotification) => {
  const photoUrl = safeHttpUrl(report.contestPhoto?.photo?.url);
  const submittedAt = report.createdAt.toISOString();
  const reason = humanize(report.reason);
  const details = report.details?.trim() || "No additional details provided.";
  const photoTitle = report.contestPhoto?.photo?.title || report.contestPhoto?.title || "Untitled photo";

  const subject = `New photo report: ${reason} (${report.id})`;
  const text = [
    "A new photo report has been submitted.",
    "",
    `Report ID: ${report.id}`,
    `Submitted: ${submittedAt}`,
    `Status: ${humanize(report.status)}`,
    `Reason: ${reason}`,
    `Details: ${details}`,
    "",
    userText("Reporter", report.reporter),
    "",
    userText("Reported user", report.reportedUser),
    ...(report.contestPhoto
      ? [
          "",
          `Contest: ${report.contestPhoto.contest?.title || "Unknown contest"}`,
          `Contest ID: ${report.contestPhoto.contest?.id || "Unknown"}`,
          `Contest photo ID: ${report.contestPhoto.id}`,
          `Photo: ${photoTitle}`,
          `Photo ID: ${report.contestPhoto.photo?.id || "Unknown"}`,
          `Photo URL: ${photoUrl || report.contestPhoto.photo?.url || "Unavailable"}`,
        ]
      : []),
  ].join("\n");

  const userRow = (label: string, user: ReportNotificationUser | null) => `
    <tr>
      <th style="padding:8px;text-align:left;vertical-align:top">${label}</th>
      <td style="padding:8px">
        ${escapeHtml(displayName(user))}${user ? `<br>${escapeHtml(user.email)}<br><small>ID: ${escapeHtml(user.id)}</small>` : ""}
      </td>
    </tr>`;

  const photoSection = report.contestPhoto
    ? `
      <h2 style="font-size:18px;margin:24px 0 8px">Photo and contest</h2>
      <table style="border-collapse:collapse;width:100%">
        <tr><th style="padding:8px;text-align:left">Contest</th><td style="padding:8px">${escapeHtml(report.contestPhoto.contest?.title || "Unknown contest")}<br><small>ID: ${escapeHtml(report.contestPhoto.contest?.id || "Unknown")}</small></td></tr>
        <tr><th style="padding:8px;text-align:left">Contest photo ID</th><td style="padding:8px">${escapeHtml(report.contestPhoto.id)}</td></tr>
        <tr><th style="padding:8px;text-align:left">Photo</th><td style="padding:8px">${escapeHtml(photoTitle)}<br><small>ID: ${escapeHtml(report.contestPhoto.photo?.id || "Unknown")}</small></td></tr>
      </table>
      ${photoUrl ? `<p><a href="${escapeHtml(photoUrl)}">Open the reported photo</a></p><p><img src="${escapeHtml(photoUrl)}" alt="Reported photo" style="display:block;max-width:600px;width:100%;height:auto"></p>` : ""}`
    : "";

  const html = `
    <div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.5;max-width:680px;margin:0 auto">
      <h1 style="font-size:24px">New photo report</h1>
      <p>A new report has been submitted and is ready for review.</p>
      <table style="border-collapse:collapse;width:100%;background:#f8fafc">
        <tr><th style="padding:8px;text-align:left">Report ID</th><td style="padding:8px">${escapeHtml(report.id)}</td></tr>
        <tr><th style="padding:8px;text-align:left">Submitted</th><td style="padding:8px">${escapeHtml(submittedAt)}</td></tr>
        <tr><th style="padding:8px;text-align:left">Status</th><td style="padding:8px">${escapeHtml(humanize(report.status))}</td></tr>
        <tr><th style="padding:8px;text-align:left">Reason</th><td style="padding:8px"><strong>${escapeHtml(reason)}</strong></td></tr>
        <tr><th style="padding:8px;text-align:left;vertical-align:top">Details</th><td style="padding:8px;white-space:pre-wrap">${escapeHtml(details)}</td></tr>
        ${userRow("Reporter", report.reporter)}
        ${userRow("Reported user", report.reportedUser)}
      </table>
      ${photoSection}
    </div>`;

  return { subject, text, html };
};
