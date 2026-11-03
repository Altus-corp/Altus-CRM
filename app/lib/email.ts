import "server-only";
import nodemailer from "nodemailer";

type AccountCredentials = {
  email: string;
  password: string;
  fullName: string;
};

function getSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;

  if (!host || !user || !pass || !from || !Number.isFinite(port)) {
    throw new Error("SMTP is not configured.");
  }

  return { host, port, user, pass, from };
}

export async function sendAccountCredentials({
  email,
  password,
  fullName,
}: AccountCredentials) {
  const smtp = getSmtpConfig();
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: { user: smtp.user, pass: smtp.pass },
  });
  const appUrl = process.env.APP_URL ?? "http://192.168.0.111:3000";

  await transporter.sendMail({
    from: smtp.from,
    to: email,
    subject: "Your Altus CRM account",
    text: `Hello ${fullName},

Your Altus CRM account has been created.

Sign in: ${appUrl}/login
Email: ${email}
Temporary password: ${password}

For security, you will be required to change this password when you sign in for the first time.
`,
  });
}

export async function sendPasswordResetOtp({
  email,
  fullName,
  otp,
}: {
  email: string;
  fullName?: string | null;
  otp: string;
}) {
  const smtp = getSmtpConfig();
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: { user: smtp.user, pass: smtp.pass },
  });

  const greeting = fullName?.trim() || "there";
  await transporter.sendMail({
    from: smtp.from,
    to: email,
    subject: "Reset your Altus CRM password",
    text: `Hello ${greeting},

We received a request to reset your Altus CRM password.

Your one-time verification code is:

${otp}

Enter this code on the Altus CRM password reset page. It expires automatically. If you did not request a password reset, you can safely ignore this email.
`,
  });
}

export async function sendLeadMeetingInvitation({ email, name, topic, agenda, startTime, duration, joinUrl }: { email: string; name: string; topic: string; agenda: string; startTime: string; duration: number; joinUrl: string }) {
  const smtp = getSmtpConfig();
  const transporter = nodemailer.createTransport({ host: smtp.host, port: smtp.port, secure: smtp.port === 465, auth: { user: smtp.user, pass: smtp.pass } });
  await transporter.sendMail({
    from: smtp.from,
    to: email,
    subject: `Zoom meeting: ${topic}`,
    text: `Hello ${name},\n\nYou are invited to a Zoom meeting.\n\nTitle: ${topic}\nDescription: ${agenda || "—"}\nTime: ${startTime}\nDuration: ${duration} minutes\n\nJoin Zoom Meeting: ${joinUrl}\n`,
  });
}
