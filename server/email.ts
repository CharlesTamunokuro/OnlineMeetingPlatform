import nodemailer from "nodemailer";
import { ENV } from "./_core/env";

function createTransport() {
  return nodemailer.createTransport({
    host: ENV.smtpHost,
    port: ENV.smtpPort,
    secure: ENV.smtpSecure,
    auth: {
      user: ENV.smtpUser,
      pass: ENV.smtpPass,
    },
  });
}

export function isEmailConfigured() {
  return Boolean(
    ENV.smtpHost &&
      ENV.smtpPort &&
      ENV.smtpUser &&
      ENV.smtpPass &&
      ENV.smtpFromEmail
  );
}

export async function sendVerificationEmail(input: {
  to: string;
  name: string;
  verificationUrl: string;
}) {
  if (!isEmailConfigured()) {
    throw new Error("SMTP is not configured");
  }

  const transporter = createTransport();
  const from = ENV.smtpFromName
    ? `"${ENV.smtpFromName}" <${ENV.smtpFromEmail}>`
    : ENV.smtpFromEmail;

  await transporter.sendMail({
    from,
    to: input.to,
    subject: "Verify your CMA Meet account",
    text: [
      `Hi ${input.name},`,
      "",
      "Welcome to CMA Meet.",
      "Please verify your email address by opening this link:",
      input.verificationUrl,
      "",
      "If you did not create this account, you can ignore this email.",
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #0f172a;">
        <p>Hi ${input.name},</p>
        <p>Welcome to CMA Meet.</p>
        <p>Please verify your email address by clicking the button below:</p>
        <p>
          <a
            href="${input.verificationUrl}"
            style="display:inline-block;padding:12px 18px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;"
          >
            Verify Email
          </a>
        </p>
        <p>If the button does not work, copy and paste this link into your browser:</p>
        <p><a href="${input.verificationUrl}">${input.verificationUrl}</a></p>
        <p>If you did not create this account, you can ignore this email.</p>
      </div>
    `,
  });
}
