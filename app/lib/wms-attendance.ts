import "server-only";

export type WmsAttendanceRecord = {
  employeeId: string;
  name: string;
  email: string;
  profileImage: string | null;
  date: string;
  punchInTime: string | null;
  punchOutTime: string | null;
  status: string;
  workingMinutes: number;
};

type WmsPayload = WmsAttendanceRecord[] | { data?: WmsAttendanceRecord[] };

function normalizedEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function apiUrl() {
  const url = process.env.WMS_ATTENDANCE_API_URL?.trim();
  if (!url) throw new Error("WMS attendance is not configured. Add WMS_ATTENDANCE_API_URL to the server environment.");
  return url;
}

export function toWmsProfileImageUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new URL(value, process.env.WMS_ATTENDANCE_API_URL ?? "https://wms-new-os.vercel.app").toString();
  } catch {
    return null;
  }
}

export async function getWmsAttendance() {
  const headers = new Headers({ Accept: "application/json" });
  const token = process.env.WMS_ATTENDANCE_API_TOKEN?.trim();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(apiUrl(), { headers, cache: "no-store", signal: AbortSignal.timeout(8_000) });
  } catch {
    throw new Error("WMS attendance could not be reached. No round-robin leads were assigned.");
  }
  if (!response.ok) throw new Error(`WMS attendance returned ${response.status}. No round-robin leads were assigned.`);

  const payload = await response.json() as WmsPayload;
  const records = Array.isArray(payload) ? payload : payload.data;
  if (!Array.isArray(records)) throw new Error("WMS attendance returned an invalid response. No round-robin leads were assigned.");
  return records;
}

export function attendanceForEmail(records: WmsAttendanceRecord[], email: string) {
  const key = normalizedEmail(email);
  return records.find((record) => normalizedEmail(record.email) === key) ?? null;
}

export function attendanceAvailability(record: WmsAttendanceRecord | null, date: string) {
  if (!record) return { available: false, reason: "no WMS attendance record" };
  if (record.date && record.date !== date) return { available: false, reason: "no attendance record for today" };
  if (!record.punchInTime || record.status.trim().toLowerCase() === "absent") return { available: false, reason: "absent / not punched in" };
  return { available: true, reason: "" };
}
