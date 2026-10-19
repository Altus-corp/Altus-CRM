"use strict";

const ADMIN_SCREENS = new Set([
  "dashboard", "call-history", "analytics", "assignment", "panel", "templates",
  "import-export", "integrations", "audit", "process-flow", "reports", "database-status", "user-management", "role-hierarchy",
]);

async function optionalRows(db, text, params = []) {
  try { return (await db.query(text, params)).rows; } catch { return []; }
}

async function optionalOne(db, text, params = []) {
  const rows = await optionalRows(db, text, params);
  return rows[0] || {};
}

async function adminData(db, screen) {
  if (!ADMIN_SCREENS.has(screen)) return null;
  if (screen === "database-status") {
    await db.query("SELECT 1");
    const target = await db.query("SELECT current_database() AS database, inet_server_port()::int AS port");
    return { metrics: { status: "Connected", database: target.rows[0]?.database || "postgres", port: target.rows[0]?.port || null }, note: "The application server can reach the configured PostgreSQL database. Credentials and connection strings are not displayed." };
  }
  if (screen === "dashboard") {
    const [metrics, followups] = await Promise.all([
      optionalOne(db, `SELECT
        (SELECT count(*)::int FROM leads) AS total_leads,
        (SELECT count(*)::int FROM lead_calls WHERE happened_at >= CURRENT_DATE) AS calls_today,
        (SELECT count(*)::int FROM leads WHERE stage IN ('registered','psreg') AND created_at >= CURRENT_DATE) AS registered_today,
        (SELECT count(*)::int FROM lead_followups WHERE due_at < CURRENT_DATE AND completed_at IS NULL) AS overdue_followups,
        (SELECT count(*)::int FROM lead_followups WHERE due_at >= CURRENT_DATE AND due_at < CURRENT_DATE + INTERVAL '1 day' AND completed_at IS NULL) AS due_today`, []),
      optionalRows(db, `SELECT id, lead_id, due_at, status FROM lead_followups WHERE completed_at IS NULL ORDER BY due_at ASC NULLS LAST, id ASC LIMIT $1`, [10]),
    ]);
    return { metrics, rows: followups };
  }
  if (screen === "call-history") {
    return { metrics: await optionalOne(db, `SELECT count(*)::int AS total, count(*) FILTER (WHERE happened_at >= CURRENT_DATE)::int AS today FROM lead_calls`, []), rows: await optionalRows(db, `SELECT id, lead_id, user_id, happened_at, resolution FROM lead_calls ORDER BY happened_at DESC NULLS LAST, id DESC LIMIT $1`, [100]) };
  }
  if (screen === "analytics") {
    return { metrics: await optionalOne(db, `SELECT count(*)::int AS calls, count(*) FILTER (WHERE happened_at >= CURRENT_DATE)::int AS calls_today, count(*) FILTER (WHERE resolution IS NOT NULL AND resolution <> '')::int AS resolved FROM lead_calls`, []), rows: await optionalRows(db, `SELECT resolution, count(*)::int AS count FROM lead_calls GROUP BY resolution ORDER BY count DESC NULLS LAST`, []) };
  }
  if (screen === "assignment") {
    const [pool, users, rules] = await Promise.all([
      optionalOne(db, `SELECT count(*) FILTER (WHERE owner_user_id IS NULL)::int AS unassigned, count(*)::int AS total FROM leads`, []),
      optionalRows(db, `SELECT id, name, role, active FROM users ORDER BY name ASC, id ASC`, []),
      optionalRows(db, `SELECT source_id, name, active, priority FROM assignment_rules ORDER BY priority ASC NULLS LAST, name ASC`, []),
    ]);
    return { metrics: pool, rows: users, rules };
  }
  if (screen === "panel") return { rows: await optionalRows(db, `SELECT u.id,u.name,u.email,COALESCE(mr.name,ep.role_label,u.role) AS role,u.role AS access_level,u.member_role_id,ep.team AS department,u.active,u.created_at FROM users u LEFT JOIN employee_profiles ep ON ep.user_id=u.id LEFT JOIN member_roles mr ON mr.id=u.member_role_id ORDER BY u.name ASC,u.id ASC`) };
  if (screen === "user-management") return { rows: await optionalRows(db, `SELECT u.id,u.name,u.email,COALESCE(mr.name,ep.role_label,u.role) AS role,u.role AS access_level,u.member_role_id,ep.team AS department,u.active,u.created_at FROM users u LEFT JOIN employee_profiles ep ON ep.user_id=u.id LEFT JOIN member_roles mr ON mr.id=u.member_role_id ORDER BY u.name ASC,u.id ASC`) };
  if (screen === "templates") return { rows: await optionalRows(db, `SELECT source_id, category, sequence, channel, subject, language, active FROM admin_templates ORDER BY category ASC, sequence ASC, source_id ASC`) };
  if (screen === "integrations") return { rows: await optionalRows(db, `SELECT source_id, name, enabled FROM integration_catalog ORDER BY name ASC, source_id ASC`) };
  if (screen === "audit") {
    const [metrics, rows] = await Promise.all([
      optionalOne(db, `SELECT
        count(*)::int AS total_activities,
        count(*) FILTER (WHERE occurred_at >= CURRENT_DATE)::int AS activities_today,
        count(DISTINCT actor_user_id) FILTER (WHERE actor_user_id IS NOT NULL)::int AS active_users
        FROM audit_log`),
      optionalRows(db, `SELECT
        a.id,
        a.occurred_at,
        COALESCE(NULLIF(u.name, ''), NULLIF(u.email, ''), a.actor_user_id, 'System') AS user_name,
        a.action,
        a.entity_type,
        a.entity_id,
        a.field,
        a.old_value,
        a.new_value,
        count(*) OVER (PARTITION BY a.actor_user_id)::int AS user_change_count
        FROM audit_log a
        LEFT JOIN users u ON u.id = a.actor_user_id
        ORDER BY a.occurred_at DESC NULLS LAST, a.id DESC
        LIMIT $1`, [100]),
    ]);
    return { metrics, rows, note: "Each entry is permanent. User change count is the total recorded activity for that user." };
  }
  if (screen === "reports") return { metrics: await optionalOne(db, `SELECT count(*)::int AS leads, count(*) FILTER (WHERE stage = 'registered')::int AS registered, count(*) FILTER (WHERE stage = 'attended')::int AS attended, count(*) FILTER (WHERE stage = 'psreg')::int AS sales FROM leads`, []), rows: [] };
  if (screen === "import-export") return { metrics: {}, rows: [], note: "Import and export history is not available in this workspace yet." };
  return { metrics: {}, rows: [
    { step: 1, name: "Acquire and qualify" },
    { step: 2, name: "Permission to call" },
    { step: 3, name: "PSO and follow-up" },
    { step: 4, name: "Registration and sales" },
  ] };
}

async function adminScreen(res, db, screen) {
  if (!ADMIN_SCREENS.has(screen)) return false;
  try { return json(res, 200, { screen, ...(await adminData(db, screen)) }); } catch { return json(res, 500, { error: "Unable to load admin data." }); }
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

module.exports = { ADMIN_SCREENS, adminScreen };
