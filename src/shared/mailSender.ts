import nodemailer, { Transporter } from "nodemailer";
import config from "../config";

export interface MailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  attachments?: nodemailer.SendMailOptions["attachments"];
}

const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1000;

const RETRYABLE_ERROR_CODES = new Set([
  "ETIMEDOUT",
  "ECONNECTION",
  "ESOCKET",
  "EAGAIN",
  "ECONNRESET",
]);

let transporter: Transporter | null = null;

// Reused across calls (nodemailer's connection pool) instead of opening a new
// SMTP connection per email — a fresh connection per send does not scale.
const getTransporter = (): Transporter => {
  if (transporter) {
    return transporter;
  }

  const { user, pass, host, port, secure } = config.smtp;

  console.log(config.smtp)

  if (!user || !pass) {
    throw new Error(
      "Email sender configuration is missing SMTP_USER/EMAIL or SMTP_PASS/APP_PASS"
    );
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 30000,
    tls: {
      rejectUnauthorized: false,
    },
  });

  return transporter;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableError = (error: unknown): boolean => {
  const code = (error as NodeJS.ErrnoException)?.code;
  return !!code && RETRYABLE_ERROR_CODES.has(code);
};

export const sendMail = async (options: MailOptions) => {
  const { to, subject, html, text, cc, bcc, replyTo, attachments } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const info = await getTransporter().sendMail({
        from: config.smtp.from,
        to,
        cc,
        bcc,
        replyTo,
        subject,
        html,
        text,
        attachments,
      });

      console.log(
        `[mailSender] sent messageId=${info.messageId} to=${to} subject="${subject}"`
      );
      return info;
    } catch (error) {
      lastError = error;
      const canRetry = attempt < MAX_ATTEMPTS && isRetryableError(error);

      console.error(
        `[mailSender] attempt ${attempt}/${MAX_ATTEMPTS} failed to=${to} subject="${subject}": ${
          error instanceof Error ? error.message : String(error)
        }`
      );

      if (!canRetry) {
        break;
      }
      await sleep(RETRY_BASE_DELAY_MS * attempt);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Failed to send email");
};

/** @deprecated Prefer `sendMail` for cc/bcc/attachments support; kept for existing call sites. */
const mailer = (email: string, html: string, subject: string) =>
  sendMail({ to: email, subject, html });

export default mailer;
