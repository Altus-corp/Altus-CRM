import "server-only";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

function secret() {
  const value = process.env.PASSWORD_RESET_CODE_SECRET || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) throw new Error("Password reset code secret is not configured.");
  return value;
}

function digest(value: string) {
  return createHash("sha256").update(`${secret()}:${value}`).digest("hex");
}

export function createSixDigitResetCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashResetCode(email: string, code: string) {
  return digest(`code:${email.trim().toLowerCase()}:${code}`);
}

export function createResetSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashResetSessionToken(token: string) {
  return digest(`session:${token}`);
}

export function hashesMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
