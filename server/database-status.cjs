"use strict";

// server/database-status.cjs
async function databaseStatus(db) {
    try {
        await db.query("SELECT 1");
        return { connected: true };
    } catch {
        return { connected: false };
    }
}

module.exports = { databaseStatus };
