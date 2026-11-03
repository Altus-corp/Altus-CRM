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

async function sendPasswordResetOtpWithResend({ email, subject, text }: { email: string; subject: string; text: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM ?? process.env.SMTP_FROM;
  if (!apiKey) return false;
  if (!from) throw new Error("RESEND_FROM is not configured.");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [email], subject, text }),
  });
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Resend OTP delivery failed (${response.status}): ${details || response.statusText}`);
  }
  return true;
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
  const greeting = fullName?.trim() || "there";
  const subject = "Reset your Altus CRM password";
  const text = `Hello ${greeting},

We received a request to reset your Altus CRM password.

Your one-time verification code is:

${otp}

Enter this code on the Altus CRM password reset page. It expires automatically. If you did not request a password reset, you can safely ignore this email.
`;

  // If a Resend API key exists, never silently fall back to the old Gmail
  // SMTP sender. A failed Resend request must be fixed in Resend/Vercel.
  if (await sendPasswordResetOtpWithResend({ email, subject, text })) return;

  const smtp = getSmtpConfig();
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: { user: smtp.user, pass: smtp.pass },
  });
  await transporter.sendMail({ from: smtp.from, to: email, subject, text });
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
