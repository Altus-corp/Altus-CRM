"use strict";

const crypto = require("crypto");

function jsonObject(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return {}; }
}

function values(value) {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (value === undefined || value === null || value === "") return [];
  return [String(value)];
}

function normalized(value) {
  return String(value ?? "").trim().toLocaleLowerCase();
}

function matchesRule(lead, rule) {
  const conditions = jsonObject(rule.conditions);
  return Object.entries(conditions).every(([field, expected]) => {
    if (field === "all") return Array.isArray(expected) && expected.every((item) => matchesRule(lead, { conditions: item }));
    if (field === "any") return Array.isArray(expected) && expected.some((item) => matchesRule(lead, { conditions: item }));
    if (field === "team") return values(expected).map(normalized).includes(normalized(lead?.[field]));
    return values(expected).includes(String(lead?.[field] ?? ""));
  });
}

function eligibleUsers(users, rule) {
  const actions = jsonObject(rule.actions);
  const roles = values(actions.roles || actions.role);
  const pool = values(actions.user_ids || actions.pool);
  const team = actions.team == null ? null : String(actions.team);
  return users
    .filter((user) => user.active !== false && user.offboarded !== true && user.employee_active !== false)
    .filter((user) => !roles.length || roles.includes(String(user.role)))
    .filter((user) => !pool.length || pool.includes(String(user.id)))
    .filter((user) => !team || String(user.team || "") === team)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

function nextUser(users, pointer) {
  if (!users.length) return null;
  const current = users.findIndex((user) => String(user.id) === String(pointer || ""));
  return users[(current + 1 + users.length) % users.length];
}

async function writeAssignmentHistory(tx, { leadId, actorId, action, previousOwner, ownerId, ruleId, reason, note }) {
  await tx.query(
    "INSERT INTO lead_history(id,source_id,lead_id,occurred_at,actor_id,action,entity,entity_id,field,from_value,to_value,note,custom_values) VALUES($1,$2,$3,now(),$4,$5,'lead',$3,'owner_user_id',$6,$7,$8,$9::jsonb)",
    [
      `lead-assignment-history-${crypto.randomUUID()}`,
      `lead-assignment-history:${crypto.randomUUID()}`,
      leadId,
      actorId || null,
      action,
      previousOwner || null,
      ownerId || null,
      note || reason,
      JSON.stringify({ rule_id: ruleId || null, reason, assigned_user_id: ownerId || null }),
    ],
  );
}

async function assignLeadRoundRobin(tx, { leadId, lead, actorId, force = false }) {
  if (!force && lead.owner_user_id) return { assigned: false, reason: "explicit_owner" };
  const ruleRows = await tx.query("SELECT id,name,priority,conditions,actions,last_assigned_user_id FROM assignment_rules WHERE enabled=true ORDER BY priority ASC, name ASC, id ASC");
  const matched = ruleRows.rows.find((rule) => matchesRule(lead, rule));
  if (!matched) {
    await writeAssignmentHistory(tx, { leadId, actorId, action: "lead.assignment_skipped", previousOwner: lead.owner_user_id, ruleId: null, reason: "no_matching_rule", note: "Round-robin skipped: no matching assignment rule." });
    return { assigned: false, reason: "no_matching_rule" };
  }
  const locked = (await tx.query("SELECT id,name,priority,conditions,actions,last_assigned_user_id FROM assignment_rules WHERE id=$1 FOR UPDATE", [matched.id])).rows[0] || matched;
  const userRows = await tx.query("SELECT u.id,u.name,u.role,u.active,u.offboarded,ep.active AS employee_active,ep.team FROM users u LEFT JOIN employee_profiles ep ON ep.user_id=u.id ORDER BY u.id ASC");
  const pool = eligibleUsers(userRows.rows, locked);
  if (!pool.length) {
    await writeAssignmentHistory(tx, { leadId, actorId, action: "lead.assignment_skipped", previousOwner: lead.owner_user_id, ruleId: locked.id, reason: "empty_pool", note: `Round-robin skipped: assignment pool for ${locked.name} is empty.` });
    return { assigned: false, reason: "empty_pool", ruleId: locked.id };
  }
  const owner = nextUser(pool, locked.last_assigned_user_id);
  await tx.query("UPDATE leads SET owner_user_id=$2,updated_at=now() WHERE id=$1", [leadId, owner.id]);
  await tx.query("UPDATE assignment_rules SET last_assigned_user_id=$2,rotation_updated_at=now(),updated_at=now() WHERE id=$1", [locked.id, owner.id]);
  await writeAssignmentHistory(tx, { leadId, actorId, action: "lead.round_robin_assigned", previousOwner: lead.owner_user_id, ownerId: owner.id, ruleId: locked.id, reason: "round_robin", note: `Lead round-robined to ${owner.name || owner.id}.` });
  return { assigned: true, ownerId: owner.id, ownerName: owner.name, ruleId: locked.id };
}

module.exports = { jsonObject, matchesRule, eligibleUsers, nextUser, writeAssignmentHistory, assignLeadRoundRobin };
