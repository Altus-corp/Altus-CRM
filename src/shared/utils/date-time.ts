const MONTH_NAMES_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Formats a date/time into "22 Oct 2026, 03:20 PM" in user's local time zone.
 */
export function formatDateTimeDisplay(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return "—";
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (Number.isNaN(date.getTime())) return "—";

  const day = String(date.getDate()).padStart(2, "0");
  const month = MONTH_NAMES_SHORT[date.getMonth()];
  const year = date.getFullYear();

  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12; // '0' becomes '12'
  const hoursStr = String(hours).padStart(2, "0");

  return `${day} ${month} ${year}, ${hoursStr}:${minutes} ${ampm}`;
}

export type FollowUpDueStatus = "overdue" | "today" | "tomorrow" | "later";

export interface FollowUpStatusResult {
  status: FollowUpDueStatus;
  label: string;
  isOverdue: boolean;
  isToday: boolean;
  overdueDays: number;
}

/**
 * Calculates relative due status (overdue, today, tomorrow, etc.)
 * comparing against the local calendar day and current time.
 */
export function getFollowUpStatus(dateInput: string | Date | null | undefined, isDone = false): FollowUpStatusResult {
  if (!dateInput) {
    return { status: "later", label: "", isOverdue: false, isToday: false, overdueDays: 0 };
  }
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (Number.isNaN(date.getTime())) {
    return { status: "later", label: "", isOverdue: false, isToday: false, overdueDays: 0 };
  }

  if (isDone) {
    return { status: "later", label: "Completed", isOverdue: false, isToday: false, overdueDays: 0 };
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDueDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((startOfDueDay - startOfToday) / oneDayMs);

  if (diffDays < 0) {
    const absDays = Math.abs(diffDays);
    return {
      status: "overdue",
      label: absDays === 1 ? "Overdue by 1 day" : `Overdue by ${absDays} days`,
      isOverdue: true,
      isToday: false,
      overdueDays: absDays,
    };
  }

  if (diffDays === 0) {
    // If the exact time has already passed today, it can be considered overdue if past due time
    const isPastTime = date.getTime() < now.getTime();
    return {
      status: isPastTime ? "overdue" : "today",
      label: isPastTime ? "Overdue today" : "Today",
      isOverdue: isPastTime,
      isToday: !isPastTime,
      overdueDays: 0,
    };
  }

  if (diffDays === 1) {
    return {
      status: "tomorrow",
      label: "Tomorrow",
      isOverdue: false,
      isToday: false,
      overdueDays: 0,
    };
  }

  return {
    status: "later",
    label: `In ${diffDays} days`,
    isOverdue: false,
    isToday: false,
    overdueDays: 0,
  };
}
