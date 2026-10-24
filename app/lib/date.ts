/** CRM-wide display date: 23-jan-2026 (Asia/Kolkata). */
export function formatCrmDate(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(date).replaceAll(" ", "-").toLowerCase();
}
