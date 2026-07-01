import nodemailer from "nodemailer";
import config from "../config";

const mailer = async (email: string, html: string, subject: string) => {
  if (!config.emailSender.email || !config.emailSender.app_pass) {
    throw new Error("Email sender configuration is missing EMAIL or APP_PASS")
  }

  console.log("Sending email from", config.emailSender.email)

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: config.emailSender.email,
      pass: config.emailSender.app_pass,
    },
    tls: {
      rejectUnauthorized: false,
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 15000,
  });

  const info = await transporter.sendMail({
    from: `"Your Capture Award" <${config.emailSender.email}>`,
    to: email,
    subject: `${subject}`,
    html,
  });

  console.log("Message sent: %s", info.messageId);
  return info;
};

export default mailer;
