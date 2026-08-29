import nodemailer from "nodemailer";
import config from "../config";

const mailer = async (email: string, html: string, subject: string) => {
  const smtpUser = config.smtp?.user
  const smtpPass = config.smtp?.pass

  if (!smtpUser || !smtpPass) {
    throw new Error("Email sender configuration is missing SMTP_USER/EMAIL or SMTP_PASS/APP_PASS");
  }

  const transporter = nodemailer.createTransport({
    host: config.smtp?.host || "smtp.gmail.com",
    port: config.smtp?.port || 465,
    secure: config.smtp.secure,
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
    from: "no-reply@yourcaptureawards.com",
    to: email,
    subject,
    html,
  });

  console.log("Message sent: %s", info.messageId);
  return info;
};

export default mailer;
