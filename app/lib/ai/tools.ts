import "server-only";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { istDayRange, istTodayKey } from "@/app/lib/altus-call-utils";
import { syncTeamCallLogs } from "@/app/lib/lead-call-log";
import type { ToolDefinition } from "./types";

// Every tool here is a fixed, read-only lookup — the assistant can only ever
// call one of these, never arbitrary SQL. Keeps the bot from ever being able
// to read something outside this list or write to the database at all.

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "get_overdue_followups",
    description: "Lists active leads whose follow-up date has already passed and has not been actioned yet. Use this for questions about missed or overdue follow-ups.",
    parameters: { type: "object", properties: { limit: { type: "number", description: "Max rows to return, default 20" } } },
  },
  {
    name: "get_leads_by_resolution",
    description: "Counts and lists active leads currently on a given Activity Resolution (e.g. 'Ringing', 'No Busy', 'Call Back', 'DND', 'Abandoned').",
    parameters: { type: "object", properties: { resolution_name: { type: "string", description: "The resolution name to filter by" }, limit: { type: "number" } }, required: ["resolution_name"] },
  },
  {
    name: "get_stuck_leads",
    description: "Lists active leads with a high consecutive Ringing streak or a high consecutive No Busy/Call Back/Call for Next (stall) streak, i.e. leads close to being auto-released to the unassigned pool.",
    parameters: { type: "object", properties: { kind: { type: "string", enum: ["ringing", "stall"], description: "Which streak to check" }, min_streak: { type: "number", description: "Minimum streak count, default 3" }, limit: { type: "number" } } },
  },
  {
    name: "get_sales_person_summary",
    description: "Gives a performance summary (active lead count, follow-ups due, closed this week) for one named sales person, or a leaderboard across all sales people if no name is given.",
    parameters: { type: "object", properties: { sales_person_name: { type: "string", description: "Full or partial name of the sales person; omit for a leaderboard of everyone" } } },
  },
  {
    name: "get_lead_counts_by_stage",
    description: "Counts active leads grouped by stage, optionally filtered to one product (e.g. PSO, BSSO).",
    parameters: { type: "object", properties: { product_code: { type: "string", description: "Product code to filter by, e.g. PSO or BSSO" } } },
  },
  {
    name: "search_lead",
    description: "Finds a specific lead by name, phone number, or email, and returns its current stage, resolution, and assigned sales person.",
    parameters: { type: "object", properties: { query: { type: "string", description: "Name, phone, or email to search for" } }, required: ["query"] },
  },
  {
    name: "get_calls_today",
    description: "Reports how many calls (total, incoming, outgoing, connected) were made today, broken down per sales person, or for one named sales person if given. Use this for 'how many calls today' or 'how many calls has X made today' type questions.",
    parameters: { type: "object", properties: { sales_person_name: { type: "string", description: "Optional: only this sales person's call count" } } },
  },
  {
    name: "list_calls_today",
    description: "Lists the specific contacts/leads a named sales person called today, with direction, connected status, and time. Use this for 'who did X call today' or 'which leads has X called' type questions, as opposed to just a count.",
    parameters: { type: "object", properties: { sales_person_name: { type: "string", description: "Full or partial name of the sales person" }, limit: { type: "number", description: "Max rows to return, default 30" } }, required: ["sales_person_name"] },
  },
  {
    name: "get_leads_by_sales_person",
    description: "Lists active leads currently assigned to a specific sales person by name, optionally narrowed by resolution name or product code. Use this for 'show me X's leads' or 'how many leads does X have' type questions.",
    parameters: { type: "object", properties: { sales_person_name: { type: "string", description: "Full or partial name of the sales person" }, resolution_name: { type: "string", description: "Optional: only leads on this Activity Resolution" }, product_code: { type: "string", description: "Optional: only leads for this product, e.g. PSO or BSSO" }, limit: { type: "number", description: "Max rows to return, default 25" } }, required: ["sales_person_name"] },
  },
];

async function namesByUserId(admin: ReturnType<typeof createAdminClient>, userIds: string[]) {
  const ids = [...new Set(userIds)];
  if (!ids.length) return new Map<string, string>();
  const { data } = await admin.from("profiles").select("id, first_name, last_name, full_name").in("id", ids);
  return new Map((data ?? []).map((person) => [person.id, [person.first_name, person.last_name].filter(Boolean).join(" ") || person.full_name || "Unnamed user"]));
}

async function getOverdueFollowups(admin: ReturnType<typeof createAdminClient>, args: { limit?: number }) {
  const limit = Math.min(Math.max(args.limit ?? 20, 1), 50);
  const { data, error } = await admin
    .from("lead_product_assignments")
    .select("id, assigned_to, next_follow_up_at, lead:leads(first_name, last_name, phone), product:lead_products(code)")
    .eq("is_active", true)
    .lt("next_follow_up_at", new Date().toISOString())
    .order("next_follow_up_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const names = await namesByUserId(admin, rows.flatMap((row) => (row.assigned_to ? [row.assigned_to] : [])));
  return {
    total_shown: rows.length,
    leads: rows.map((row) => {
      const lead = Array.isArray(row.lead) ? row.lead[0] : row.lead;
      const product = Array.isArray(row.product) ? row.product[0] : row.product;
      return {
        name: [lead?.first_name, lead?.last_name].filter(Boolean).join(" ") || "Unnamed lead",
        phone: lead?.phone ?? null,
        product: product?.code ?? null,
        assigned_to: row.assigned_to ? names.get(row.assigned_to) ?? "Unknown" : "Unassigned",
        follow_up_was_due: row.next_follow_up_at,
      };
    }),
  };
}

async function getLeadsByResolution(admin: ReturnType<typeof createAdminClient>, args: { resolution_name: string; limit?: number }) {
  const limit = Math.min(Math.max(args.limit ?? 20, 1), 50);
  const { data: resolution } = await admin.from("lead_resolutions").select("id, name").ilike("name", args.resolution_name).maybeSingle();
  if (!resolution) return { error: `No resolution matching "${args.resolution_name}" exists.` };
  const { data, error, count } = await admin
    .from("lead_product_assignments")
    .select("id, assigned_to, lead:leads(first_name, last_name, phone), product:lead_products(code)", { count: "exact" })
    .eq("is_active", true)
    .eq("latest_resolution_id", resolution.id)
    .limit(limit);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const names = await namesByUserId(admin, rows.flatMap((row) => (row.assigned_to ? [row.assigned_to] : [])));
  return {
    resolution: resolution.name,
    total_count: count ?? rows.length,
    leads_shown: rows.map((row) => {
      const lead = Array.isArray(row.lead) ? row.lead[0] : row.lead;
      const product = Array.isArray(row.product) ? row.product[0] : row.product;
      return { name: [lead?.first_name, lead?.last_name].filter(Boolean).join(" ") || "Unnamed lead", phone: lead?.phone ?? null, product: product?.code ?? null, assigned_to: row.assigned_to ? names.get(row.assigned_to) ?? "Unknown" : "Unassigned" };
    }),
  };
}

async function getStuckLeads(admin: ReturnType<typeof createAdminClient>, args: { kind?: "ringing" | "stall"; min_streak?: number; limit?: number }) {
  const kind = args.kind === "stall" ? "stall" : "ringing";
  const column = kind === "stall" ? "stall_streak" : "ringing_streak";
  const releaseAt = kind === "stall" ? 10 : 5;
  const minStreak = Math.max(args.min_streak ?? 3, 1);
  const limit = Math.min(Math.max(args.limit ?? 20, 1), 50);
  const { data, error } = await admin
    .from("lead_product_assignments")
    .select(`id, assigned_to, ${column}, lead:leads(first_name, last_name, phone), product:lead_products(code)`)
    .eq("is_active", true)
    .gte(column, minStreak)
    .order(column, { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const names = await namesByUserId(admin, rows.flatMap((row) => (row.assigned_to ? [row.assigned_to] : [])));
  return {
    streak_type: kind,
    releases_to_unassigned_pool_at: releaseAt,
    leads: rows.map((row) => {
      const lead = Array.isArray(row.lead) ? row.lead[0] : row.lead;
      const product = Array.isArray(row.product) ? row.product[0] : row.product;
      return { name: [lead?.first_name, lead?.last_name].filter(Boolean).join(" ") || "Unnamed lead", phone: lead?.phone ?? null, product: product?.code ?? null, assigned_to: row.assigned_to ? names.get(row.assigned_to) ?? "Unknown" : "Unassigned", current_streak: (row as unknown as Record<string, number>)[column] };
    }),
  };
}

async function getSalesPersonSummary(admin: ReturnType<typeof createAdminClient>, args: { sales_person_name?: string }) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
  let targetIds: string[] | null = null;
  if (args.sales_person_name) {
    const { data: profiles } = await admin.from("profiles").select("id, first_name, last_name, full_name").or(`full_name.ilike.%${args.sales_person_name}%,first_name.ilike.%${args.sales_person_name}%,last_name.ilike.%${args.sales_person_name}%`);
    if (!profiles?.length) return { error: `No sales person matching "${args.sales_person_name}" was found.` };
    targetIds = profiles.map((person) => person.id);
  }
  const { data: activeRows, error: activeError } = await admin.from("lead_product_assignments").select("assigned_to, next_follow_up_at").eq("is_active", true).not("assigned_to", "is", null);
  if (activeError) throw new Error(activeError.message);
  const { data: closedRows, error: closedError } = await admin.from("lead_product_assignments").select("assigned_to").eq("is_closed", true).gte("updated_at", weekAgo).not("assigned_to", "is", null);
  if (closedError) throw new Error(closedError.message);
  const ownerIds = [...new Set([...(activeRows ?? []).map((row) => row.assigned_to as string), ...(closedRows ?? []).map((row) => row.assigned_to as string)])];
  const names = await namesByUserId(admin, targetIds ?? ownerIds);
  const summaryByOwner = new Map<string, { active: number; overdue: number; closed_this_week: number }>();
  for (const row of activeRows ?? []) {
    if (!row.assigned_to || (targetIds && !targetIds.includes(row.assigned_to))) continue;
    const entry = summaryByOwner.get(row.assigned_to) ?? { active: 0, overdue: 0, closed_this_week: 0 };
    entry.active += 1;
    if (row.next_follow_up_at && new Date(row.next_follow_up_at).getTime() < Date.now()) entry.overdue += 1;
    summaryByOwner.set(row.assigned_to, entry);
  }
  for (const row of closedRows ?? []) {
    if (!row.assigned_to || (targetIds && !targetIds.includes(row.assigned_to))) continue;
    const entry = summaryByOwner.get(row.assigned_to) ?? { active: 0, overdue: 0, closed_this_week: 0 };
    entry.closed_this_week += 1;
    summaryByOwner.set(row.assigned_to, entry);
  }
  const results = [...summaryByOwner.entries()]
    .map(([id, stats]) => ({ sales_person: names.get(id) ?? "Unknown", ...stats }))
    .sort((a, b) => b.active - a.active);
  return targetIds ? { summary: results[0] ?? { sales_person: args.sales_person_name, active: 0, overdue: 0, closed_this_week: 0 } } : { leaderboard: results.slice(0, 20) };
}

async function getLeadCountsByStage(admin: ReturnType<typeof createAdminClient>, args: { product_code?: string }) {
  const { data, error } = await admin.from("lead_product_assignments").select("stage:lead_stages(name), product:lead_products(code)").eq("is_active", true);
  if (error) throw new Error(error.message);
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const stage = Array.isArray(row.stage) ? row.stage[0] : row.stage;
    const product = Array.isArray(row.product) ? row.product[0] : row.product;
    if (args.product_code && product?.code !== args.product_code.toUpperCase()) continue;
    const key = stage?.name ?? "No stage";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return { product_filter: args.product_code ?? "all products", counts: Object.fromEntries(counts) };
}

async function searchLead(admin: ReturnType<typeof createAdminClient>, args: { query: string }) {
  const term = args.query.trim();
  if (!term) return { error: "Provide a name, phone, or email to search for." };
  const digits = term.replace(/\D/g, "");
  const orFilter = digits.length >= 6
    ? `phone.ilike.%${digits}%`
    : `first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`;
  const { data: leads, error } = await admin.from("leads").select("id, first_name, last_name, phone, email").or(orFilter).limit(5);
  if (error) throw new Error(error.message);
  if (!leads?.length) return { error: "No matching lead found." };
  const leadIds = leads.map((lead) => lead.id);
  const { data: assignments } = await admin.from("lead_product_assignments").select("lead_id, assigned_to, is_active, stage:lead_stages(name), resolution:lead_resolutions(name), product:lead_products(code)").in("lead_id", leadIds);
  const names = await namesByUserId(admin, (assignments ?? []).flatMap((row) => (row.assigned_to ? [row.assigned_to] : [])));
  return {
    matches: leads.map((lead) => ({
      name: [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unnamed lead",
      phone: lead.phone,
      email: lead.email,
      products: (assignments ?? []).filter((row) => row.lead_id === lead.id).map((row) => {
        const stage = Array.isArray(row.stage) ? row.stage[0] : row.stage;
        const resolution = Array.isArray(row.resolution) ? row.resolution[0] : row.resolution;
        const product = Array.isArray(row.product) ? row.product[0] : row.product;
        return { product: product?.code, stage: stage?.name ?? null, resolution: resolution?.name ?? null, active: row.is_active, assigned_to: row.assigned_to ? names.get(row.assigned_to) ?? "Unknown" : "Unassigned" };
      }),
    })),
  };
}

async function getLeadsBySalesPerson(admin: ReturnType<typeof createAdminClient>, args: { sales_person_name: string; resolution_name?: string; product_code?: string; limit?: number }) {
  const limit = Math.min(Math.max(args.limit ?? 25, 1), 50);
  const { data: profiles } = await admin.from("profiles").select("id, first_name, last_name, full_name").or(`full_name.ilike.%${args.sales_person_name}%,first_name.ilike.%${args.sales_person_name}%,last_name.ilike.%${args.sales_person_name}%`);
  if (!profiles?.length) return { error: `No sales person matching "${args.sales_person_name}" was found.` };
  const ids = profiles.map((person) => person.id);
  const names = await namesByUserId(admin, ids);
  let resolutionId: string | null = null;
  if (args.resolution_name) {
    const { data: resolution } = await admin.from("lead_resolutions").select("id, name").ilike("name", args.resolution_name).maybeSingle();
    if (!resolution) return { error: `No resolution matching "${args.resolution_name}" exists.` };
    resolutionId = resolution.id;
  }
  let query = admin
    .from("lead_product_assignments")
    .select("id, assigned_to, next_follow_up_at, lead:leads(first_name, last_name, phone), product:lead_products(code), stage:lead_stages(name), resolution:lead_resolutions(name)", { count: "exact" })
    .eq("is_active", true)
    .in("assigned_to", ids);
  if (resolutionId) query = query.eq("latest_resolution_id", resolutionId);
  const { data, error, count } = await query.limit(limit);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const filteredByProduct = args.product_code
    ? rows.filter((row) => (Array.isArray(row.product) ? row.product[0] : row.product)?.code === args.product_code!.toUpperCase())
    : rows;
  return {
    matched_sales_people: profiles.map((person) => names.get(person.id) ?? "Unknown"),
    total_active_count: args.product_code ? filteredByProduct.length : (count ?? rows.length),
    leads_shown: filteredByProduct.map((row) => {
      const lead = Array.isArray(row.lead) ? row.lead[0] : row.lead;
      const product = Array.isArray(row.product) ? row.product[0] : row.product;
      const stage = Array.isArray(row.stage) ? row.stage[0] : row.stage;
      const resolution = Array.isArray(row.resolution) ? row.resolution[0] : row.resolution;
      return {
        name: [lead?.first_name, lead?.last_name].filter(Boolean).join(" ") || "Unnamed lead",
        phone: lead?.phone ?? null,
        product: product?.code ?? null,
        stage: stage?.name ?? null,
        resolution: resolution?.name ?? null,
        assigned_to: row.assigned_to ? names.get(row.assigned_to) ?? "Unknown" : "Unassigned",
        next_follow_up_at: row.next_follow_up_at,
      };
    }),
  };
}

async function getCallsToday(args: { sales_person_name?: string }) {
  const { admin, people, message } = await syncTeamCallLogs();
  if (!people.length) return { error: "No sales people are configured." };
  const matchedPeople = args.sales_person_name
    ? people.filter((person) => person.name.toLowerCase().includes(args.sales_person_name!.toLowerCase()))
    : people;
  if (args.sales_person_name && !matchedPeople.length) return { error: `No sales person matching "${args.sales_person_name}" was found.` };
  const day = istDayRange(istTodayKey());
  const ids = matchedPeople.map((person) => person.userId);
  const { data, error } = await admin
    .from("lead_call_log")
    .select("user_id, direction, is_connected")
    .in("user_id", ids)
    .gte("called_at", day.start.toISOString())
    .lt("called_at", day.end.toISOString())
    .limit(50000);
  if (error) return { error: message || error.message };
  const rows = data ?? [];
  const perPerson = matchedPeople.map((person) => {
    const mine = rows.filter((row) => row.user_id === person.userId);
    const incoming = mine.filter((row) => row.direction === "incoming").length;
    return { sales_person: person.name, calls: mine.length, incoming, outgoing: mine.length - incoming, connected: mine.filter((row) => row.is_connected).length };
  }).sort((a, b) => b.calls - a.calls);
  return args.sales_person_name
    ? { date: istTodayKey(), summary: perPerson[0] }
    : { date: istTodayKey(), total_calls: rows.length, by_sales_person: perPerson };
}

async function listCallsToday(args: { sales_person_name: string; limit?: number }) {
  const limit = Math.min(Math.max(args.limit ?? 30, 1), 50);
  const { admin, people, message } = await syncTeamCallLogs();
  const matchedPeople = people.filter((person) => person.name.toLowerCase().includes(args.sales_person_name.toLowerCase()));
  if (!matchedPeople.length) return { error: `No sales person matching "${args.sales_person_name}" was found.` };
  const day = istDayRange(istTodayKey());
  const { data, error } = await admin
    .from("lead_call_log")
    .select("user_id, lead_name, phone, direction, is_connected, duration_seconds, called_at")
    .in("user_id", matchedPeople.map((person) => person.userId))
    .gte("called_at", day.start.toISOString())
    .lt("called_at", day.end.toISOString())
    .order("called_at", { ascending: false })
    .limit(limit);
  if (error) return { error: message || error.message };
  const names = new Map(matchedPeople.map((person) => [person.userId, person.name]));
  return {
    date: istTodayKey(),
    matched_sales_people: matchedPeople.map((person) => person.name),
    calls: (data ?? []).map((row) => ({
      called_by: names.get(row.user_id) ?? "Unknown",
      lead_name: row.lead_name,
      phone: row.phone,
      direction: row.direction,
      connected: row.is_connected,
      duration_seconds: row.duration_seconds,
      called_at: row.called_at,
    })),
  };
}

export async function runTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const admin = createAdminClient();
  switch (name) {
    case "get_overdue_followups": return getOverdueFollowups(admin, args);
    case "get_leads_by_resolution": return getLeadsByResolution(admin, args as { resolution_name: string; limit?: number });
    case "get_stuck_leads": return getStuckLeads(admin, args);
    case "get_sales_person_summary": return getSalesPersonSummary(admin, args);
    case "get_lead_counts_by_stage": return getLeadCountsByStage(admin, args);
    case "search_lead": return searchLead(admin, args as { query: string });
    case "get_leads_by_sales_person": return getLeadsBySalesPerson(admin, args as { sales_person_name: string; resolution_name?: string; product_code?: string; limit?: number });
    case "get_calls_today": return getCallsToday(args as { sales_person_name?: string });
    case "list_calls_today": return listCallsToday(args as { sales_person_name: string; limit?: number });
    default: return { error: `Unknown tool: ${name}` };
  }
}
