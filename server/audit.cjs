"use strict";

async function writeAudit(db, event) {
  await db.query(
    "INSERT INTO audit_log (id, occurred_at, actor_user_id, action, entity_type, entity_id, field, old_value, new_value, ip) VALUES ($1, now(), $2, $3, $4, $5, $6, $7, $8, $9)",
    [event.id || `audit-${Date.now()}-${Math.random().toString(36).slice(2)}`, event.actorUserId || null, event.action, event.entityType || null, event.entityId || null, event.field || null, event.oldValue == null ? null : String(event.oldValue), event.newValue == null ? null : String(event.newValue), event.ip || null],
  );
}

module.exports = { writeAudit };
