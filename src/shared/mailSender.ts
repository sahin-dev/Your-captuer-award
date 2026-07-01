import nodemailer from "nodemailer";
import config from "../config";

const mailer = async (email: string, html: string, subject: string) => {
  console.log(config.emailSender.email, config.emailSender.app_pass)
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: config.emailSender.email,
      pass: config.emailSender.app_pass,
    },
    tls: {
      rejectUnauthorized: false,
    },
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
