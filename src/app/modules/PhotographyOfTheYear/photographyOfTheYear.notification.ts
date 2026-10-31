import { escapeHtml } from "../../../shared/html";
import { notificationOrchestrator } from "../Notification/notificationOrchestrator";
import { sendMail } from "../../../shared/mailSender";

type PotyRecipient = {
  id: string;
  email: string;
  fullName?: string | null;
  username?: string | null;
};

type PotyPhotoContext = {
  contestId: string;
  contestTitle: string;
  contestPhotoId: string;
  photoTitle: string;
  rank: number;
  voteCount: number;
};


const recipientName = (recipient: PotyRecipient) =>
  recipient.fullName?.trim() || recipient.username?.trim() || "Photographer";

const ordinal = (place: number) => {
  const suffix = place % 100 >= 11 && place % 100 <= 13
    ? "th"
    : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[place % 10] || "th";
  return `${place}${suffix}`;
};

const sendEmail = async (
  recipient: PotyRecipient,
  subject: string,
  heading: string,
  message: string,
  details: string,
) => {
  const name = escapeHtml(recipientName(recipient));
  const safeHeading = escapeHtml(heading);
  const safeMessage = escapeHtml(message);
  const safeDetails = escapeHtml(details);

  await sendMail({
    to: recipient.email,
    subject,
    text: `${heading}\n\n${message}\n\n${details}`,
    html: `
      <div style="background:#f6f7f9;padding:32px 16px;font-family:Arial,sans-serif;color:#17181c">
        <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e6e8ed;border-radius:12px;padding:32px">
          <p style="margin:0 0 20px;color:#f27800;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Your Capture Awards</p>
          <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25">${safeHeading}</h1>
          <p style="margin:0 0 8px;font-size:16px">Hi ${name},</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6">${safeMessage}</p>
          <p style="margin:0;padding:14px 16px;background:#f6f7f9;border-radius:8px;font-size:14px;line-height:1.5">${safeDetails}</p>
        </div>
      </div>
    `,
  });
};

export const notifyPotyTopTenRecipient = async (
  recipient: PotyRecipient,
  context: PotyPhotoContext,
) => {
  await notificationOrchestrator.notifyPhotographyOfTheYearTopTen(
    recipient.id,
    context.contestId,
    context.contestTitle,
    context.contestPhotoId,
    context.photoTitle,
    context.rank,
    context.voteCount,
  );

  await sendEmail(
    recipient,
    "Your photo reached the Photographer of the Year top 10",
    "Your photo reached the POTY top 10",
    `Your photo "${context.photoTitle}" has secured a place in the top 10 of "${context.contestTitle}".`,
    `Current rank: #${context.rank} | Qualifying votes: ${context.voteCount}`,
  );
};

export const notifyPotyResultRecipient = async (
  recipient: PotyRecipient,
  context: PotyPhotoContext,
  place: number,
) => {
  await notificationOrchestrator.notifyPhotographyOfTheYearResult(
    recipient.id,
    context.contestId,
    context.contestTitle,
    context.contestPhotoId,
    context.photoTitle,
    place,
    context.voteCount,
  );

  await sendEmail(
    recipient,
    `Your photo placed #${place} in Photographer of the Year`,
    `Your photo placed #${place}`,
    `Your photo "${context.photoTitle}" achieved ${ordinal(place)} place in "${context.contestTitle}". Congratulations!`,
    `Final place: #${place} | Qualifying votes: ${context.voteCount}`,
  );
};

