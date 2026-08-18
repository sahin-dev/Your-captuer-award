import nodemailer from "nodemailer";
import config from "../config";

const mailer = async (email: string, html: string, subject: string) => {
  const smtpUser = config.smtp?.user || config.emailSender.email;
  const smtpPass = config.smtp?.pass || config.emailSender.app_pass;

  if (!smtpUser || !smtpPass) {
    throw new Error("Email sender configuration is missing SMTP_USER/EMAIL or SMTP_PASS/APP_PASS");
  }

  const transporter = nodemailer.createTransport({
    host: config.smtp?.host || "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 30000,
    tls: {
      rejectUnauthorized: false,
    },
  });

  const info = await transporter.sendMail({
    from: `"Your Capture Award" <${smtpUser}>`,
    to: email,
    subject,
    html,
  });

  console.log("Message sent: %s", info.messageId);
  return info;
};

export default mailer;
