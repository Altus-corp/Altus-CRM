"use strict";

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const load = require("../server/load-env.cjs");

load();

function sourceUrl() {
  const source = fs.readFileSync(path.resolve(__dirname, "..", ".env"), "utf8");
  const line = source.split(/\r?\n/).find((value) => value.trim().startsWith("CRM_PG_URL="));
  return line ? line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "") : "";
}

function ssl(url) {
  const host = new URL(url).hostname;
  return host.endsWith(".supabase.co") || host.endsWith(".pooler.supabase.com") ? { rejectUnauthorized: false } : undefined;
}

function qi(value) { return `"${String(value).replace(/"/g, '""')}"`; }

async function client(url) {
  const db = new Client({ connectionString: url, ...(ssl(url) ? { ssl: ssl(url) } : {}) });
  await db.connect();
  return db;
}

async function metadata(db) {
  const tables = (await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")).rows.map((row) => row.table_name);
  const columns = {};
  const types = {};
  for (const table of tables) {
    const rows = (await db.query("SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position", [table])).rows;
    columns[table] = rows.map((row) => row.column_name);
    types[table] = Object.fromEntries(rows.map((row) => [row.column_name, row.data_type]));
  }
  const fks = (await db.query("SELECT tc.table_name,kcu.column_name,ccu.table_name AS foreign_table_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name AND ccu.table_schema=tc.table_schema WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'")).rows;
  return { tables, columns, types, fks };
}

function orderTables(tables, fks, excluded) {
  const active = new Set(tables.filter((table) => !excluded.has(table)));
  const deps = new Map([...active].map((table) => [table, new Set()]));
  for (const fk of fks) if (active.has(fk.table_name) && active.has(fk.foreign_table_name) && fk.table_name !== fk.foreign_table_name) deps.get(fk.table_name).add(fk.foreign_table_name);
  const result = [];
  while (deps.size) {
    const ready = [...deps].filter(([, values]) => [...values].every((value) => result.includes(value))).map(([table]) => table).sort();
    if (!ready.length) throw new Error("foreign-key dependency cycle in migration tables");
    for (const table of ready) { result.push(table); deps.delete(table); }
  }
  return result;
}

async function insertRow(db, table, columns, row, conflict = "DO NOTHING") {
  const names = columns.map(qi).join(",");
  const values = columns.map((_, index) => `$${index + 1}`).join(",");
  const result = await db.query(`INSERT INTO ${qi(table)} (${names}) VALUES (${values}) ON CONFLICT ${conflict}`, columns.map((column) => row[column]));
  return result.rowCount || 0;
}

async function insertRows(db, table, columns, rows) {
  if (!rows.length) return 0;
  const names = columns.map(qi).join(",");
  const values = [];
  const params = [];
  rows.forEach((row, rowIndex) => columns.forEach((column, columnIndex) => { values.push(`$${rowIndex * columns.length + columnIndex + 1}`); params.push(row[column]); }));
  const result = await db.query(`INSERT INTO ${qi(table)} (${names}) VALUES ${rows.map((_, index) => `(${values.slice(index * columns.length, (index + 1) * columns.length).join(",")})`).join(",")} ON CONFLICT DO NOTHING`, params);
  return result.rowCount || 0;
}

(async () => {
  const source = await client(sourceUrl());
  const target = await client(load.databaseConnectionString());
  const sourceMeta = await metadata(source);
  const targetMeta = await metadata(target);
  const excluded = new Set(["schema_migrations", "sessions", "login_attempts"]);
  const sourceUsers = (await source.query("SELECT * FROM users ORDER BY id")).rows;
  const targetUsers = (await target.query("SELECT * FROM users ORDER BY id")).rows;
  const targetByEmail = new Map(targetUsers.map((row) => [String(row.email).toLowerCase(), row]));
  const targetById = new Map(targetUsers.map((row) => [String(row.id), row]));
  const userMap = new Map();
  const report = { target: load.databaseTarget(load.databaseConnectionString()).label, users: { source: sourceUsers.length, matched: 0, inserted: 0 }, tables: {}, skipped_tables: { schema_migrations: "target migration history preserved", sessions: "active sessions not migrated", login_attempts: "throttle state not migrated" }, conflicts: [] };

  await target.query("BEGIN");
  try {
    const userColumns = sourceMeta.columns.users.filter((column) => targetMeta.columns.users.includes(column));
    for (const sourceUser of sourceUsers) {
      const existingByEmail = targetByEmail.get(String(sourceUser.email).toLowerCase());
      const existingById = targetById.get(String(sourceUser.id));
      if (existingByEmail) {
        userMap.set(String(sourceUser.id), String(existingByEmail.id));
        report.users.matched++;
        if (existingById && String(existingById.email).toLowerCase() !== String(sourceUser.email).toLowerCase()) throw new Error(`user id conflict for source account ${sourceUser.id}`);
        continue;
      }
      if (existingById) throw new Error(`user id conflict for source account ${sourceUser.id}`);
      const inserted = await insertRow(target, "users", userColumns, sourceUser);
      if (!inserted) throw new Error(`user insert conflict for source account ${sourceUser.id}`);
      userMap.set(String(sourceUser.id), String(sourceUser.id));
      report.users.inserted++;
    }

    const credentialRows = (await source.query("SELECT * FROM credentials ORDER BY user_id")).rows;
    const credentialColumns = sourceMeta.columns.credentials.filter((column) => targetMeta.columns.credentials.includes(column));
    report.credentials = { source: credentialRows.length, inserted: 0, preserved: 0 };
    for (const row of credentialRows) {
      const targetUserId = userMap.get(String(row.user_id));
      if (!targetUserId) throw new Error(`credential references unmapped user ${row.user_id}`);
      const targetUser = targetById.get(targetUserId);
      if (targetUser) { report.credentials.preserved++; continue; }
      const mapped = { ...row, user_id: targetUserId };
      report.credentials.inserted += await insertRow(target, "credentials", credentialColumns, mapped);
    }

    const userFkColumns = new Map();
    for (const fk of targetMeta.fks.filter((row) => row.foreign_table_name === "users")) {
      if (!userFkColumns.has(fk.table_name)) userFkColumns.set(fk.table_name, []);
      userFkColumns.get(fk.table_name).push(fk.column_name);
    }
    const tableOrder = orderTables(sourceMeta.tables, targetMeta.fks, new Set([...excluded, "users", "credentials"]));
    for (const table of tableOrder) {
      if (!targetMeta.columns[table]) throw new Error(`target table missing after migrations: ${table}`);
      const rows = (await source.query(`SELECT * FROM ${qi(table)}`)).rows;
      console.log(`processing table=${table} rows=${rows.length}`);
      const mappedColumns = userFkColumns.get(table) || [];
      const columns = targetMeta.columns[table].filter((column) => sourceMeta.columns[table].includes(column) || (table === "import_runs" && ["source", "checksum", "report"].includes(column)));
      const mappedRows = [];
      for (const row of rows) {
        const mapped = { ...row };
        if (table === "import_runs") {
          mapped.source = row.source_tenant || "altus";
          mapped.checksum = row.source_checksum || null;
          mapped.report = row.counts || {};
        }
        for (const column of mappedColumns) if (mapped[column] !== null && mapped[column] !== undefined) {
          const targetUserId = userMap.get(String(mapped[column]));
          if (!targetUserId) throw new Error(`${table}.${column} references unmapped user ${mapped[column]}`);
          mapped[column] = targetUserId;
        }
        for (const column of columns) if ((targetMeta.types[table][column] === "json" || targetMeta.types[table][column] === "jsonb") && mapped[column] !== null && mapped[column] !== undefined) mapped[column] = JSON.stringify(mapped[column]);
        mappedRows.push(mapped);
      }
      let inserted = 0;
      try { for (let offset = 0; offset < mappedRows.length; offset += 100) inserted += await insertRows(target, table, columns, mappedRows.slice(offset, offset + 100)); }
      catch (error) { const message = String(error.message || "").replace(/\s+/g, " ").slice(0, 160); throw new Error(`insert failed table=${table} code=${String(error.code || "UNKNOWN")} type=${String(error.name || error.constructor?.name || "Error")} message=${message}`); }
      const skipped = rows.length - inserted;
      report.tables[table] = { source: rows.length, inserted, skipped };
    }
    await target.query("COMMIT");
  } catch (error) {
    await target.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await source.end().catch(() => {});
    await target.end().catch(() => {});
  }
  console.log(JSON.stringify(report));
})().catch((error) => {
  console.error(error.message && error.message.startsWith("insert failed table=") ? `DATA_MIGRATION_FAILED ${error.message}` : `DATA_MIGRATION_FAILED ${String(error.code || error.name || "UNKNOWN")}`);
  process.exitCode = 1;
});
