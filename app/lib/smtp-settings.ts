import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import { createAdminClient } from "@/app/lib/supabase/admin";

export type UserSmtpSettings = { host: string; port: number; username: string; from_email: string; from_name: string | null };

function encryptionKey() {
  const secret = process.env.SMTP_ENCRYPTION_KEY;
  if (!secret) throw new Error("SMTP_ENCRYPTION_KEY is not configured on the server.");
  return createHash("sha256").update(secret).digest();
}

export function encryptSmtpPassword(password: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64")).join(".");
}

function decryptSmtpPassword(value: string) {
  const [iv, tag, encrypted] = value.split(".").map((part) => Buffer.from(part, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function createSmtpTransport({ host, port, username, password }: { host: string; port: number; username: string; password: string }) {
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user: username, pass: password }, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000 });
}

export async function getUserSmtpSettings(userId: string): Promise<UserSmtpSettings | null> {
  const { data } = await createAdminClient().from("user_smtp_settings").select("host, port, username, from_email, from_name").eq("user_id", userId).maybeSingle();
  return data;
}

export async function getUserSmtpPassword(userId: string) {
  const { data } = await createAdminClient().from("user_smtp_settings").select("password_encrypted").eq("user_id", userId).maybeSingle();
  return data ? decryptSmtpPassword(data.password_encrypted) : null;
}

export async function sendEmailWithUserSmtp(userId: string, { to, subject, text }: { to: string; subject: string; text: string }) {
  const [settings, password] = await Promise.all([getUserSmtpSettings(userId), getUserSmtpPassword(userId)]);
  if (!settings || !password) throw new Error("Set up your email (SMTP) in Settings before sending emails to leads.");
  const transporter = createSmtpTransport({ host: settings.host, port: settings.port, username: settings.username, password });
  await transporter.sendMail({ from: settings.from_name ? { name: settings.from_name, address: settings.from_email } : settings.from_email, to, subject, text });
}
