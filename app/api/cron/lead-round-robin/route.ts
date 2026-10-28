import { createAdminClient } from "@/app/lib/supabase/admin";
import { runRoundRobinFromSchedule } from "@/app/dashboard/lead-settings/actions";

function indiaClock() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "0";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minuteOfDay: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

function timeToMinutes(value: string) {
  const [hour = "0", minute = "0"] = value.slice(0, 5).split(":");
  return Number(hour) * 60 + Number(minute);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ ok: false, message: "Unauthorized." }, { status: 401 });

  const supabase = createAdminClient();
  const { data: schedule, error: scheduleError } = await supabase
    .from("lead_round_robin_schedule")
    .select("start_time, end_time, retry_interval_minutes")
    .eq("id", 1)
    .single();
  if (scheduleError || !schedule) return Response.json({ ok: false, message: "Round-robin schedule is unavailable. Run the schedule database migration." }, { status: 500 });

  const now = indiaClock();
  const start = timeToMinutes(schedule.start_time);
  const end = timeToMinutes(schedule.end_time);
  if (now.minuteOfDay < start) return Response.json({ ok: true, ran: false, message: "Waiting for the configured start time." });
  if (now.minuteOfDay > end) return Response.json({ ok: true, ran: false, message: "The configured round-robin window has ended for today." });

  const { data: lastRun, error: lastRunError } = await supabase
    .from("lead_round_robin_schedule_runs")
    .select("ran_at")
    .eq("run_date", now.date)
    .order("ran_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastRunError) return Response.json({ ok: false, message: "Round-robin run history is unavailable. Run the schedule database migration." }, { status: 500 });
  if (lastRun && Date.now() - new Date(lastRun.ran_at).getTime() < schedule.retry_interval_minutes * 60_000) {
    return Response.json({ ok: true, ran: false, message: "Waiting for the configured retry interval." });
  }

  const result = await runRoundRobinFromSchedule();
  if (!result.ok) return Response.json({ ...result, ran: false }, { status: 500 });
  const { error: writeError } = await supabase.from("lead_round_robin_schedule_runs").insert({ run_date: now.date, focused_count: result.focused, assigned_count: result.newlyAssigned, skipped_count: result.skippedUsers.length });
  if (writeError) return Response.json({ ok: false, message: writeError.message }, { status: 500 });
  return Response.json({ ...result, ran: true });
}
