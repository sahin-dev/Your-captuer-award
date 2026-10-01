import assert from "node:assert/strict";
import test from "node:test";
import { buildReportNotificationEmail, ReportNotification } from "./report.notification";

const report: ReportNotification = {
  id: "report-123",
  reason: "INAPPROPRIATE_CONTENT",
  details: '<script>alert("unsafe")</script>',
  status: "PENDING",
  createdAt: new Date("2026-10-01T06:30:00.000Z"),
  reporter: {
    id: "reporter-1",
    username: "watcher",
    fullName: "Photo Watcher",
    email: "watcher@example.com",
  },
  reportedUser: {
    id: "owner-1",
    username: "owner",
    fullName: "Photo Owner",
    email: "owner@example.com",
  },
  contestPhoto: {
    id: "entry-1",
    title: null,
    photo: {
      id: "photo-1",
      title: "Sunset",
      url: "https://images.example.com/sunset.jpg",
    },
    contest: {
      id: "contest-1",
      title: "Nature Awards",
    },
  },
};

test("builds a report email with report, user, photo, and contest details", () => {
  const email = buildReportNotificationEmail(report);

  assert.match(email.subject, /Inappropriate Content/);
  assert.match(email.text, /Report ID: report-123/);
  assert.match(email.text, /Reporter: Photo Watcher \(watcher@example\.com\)/);
  assert.match(email.text, /Contest: Nature Awards/);
  assert.match(email.text, /Photo URL: https:\/\/images\.example\.com\/sunset\.jpg/);
  assert.match(email.html, /<img src="https:\/\/images\.example\.com\/sunset\.jpg"/);
});

test("escapes submitted details before inserting them into HTML", () => {
  const email = buildReportNotificationEmail(report);

  assert.doesNotMatch(email.html, /<script>/);
  assert.match(email.html, /&lt;script&gt;alert\(&quot;unsafe&quot;\)&lt;\/script&gt;/);
});

test("does not create links or image tags for unsafe photo URLs", () => {
  const email = buildReportNotificationEmail({
    ...report,
    contestPhoto: {
      ...report.contestPhoto!,
      photo: { ...report.contestPhoto!.photo!, url: "javascript:alert(1)" },
    },
  });

  assert.doesNotMatch(email.html, /javascript:/);
  assert.doesNotMatch(email.html, /<img/);
  assert.match(email.text, /Photo URL: javascript:alert\(1\)/);
});
