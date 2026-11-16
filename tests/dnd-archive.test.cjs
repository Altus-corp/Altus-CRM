/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node CommonJS test harness. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { runInNewContext } = require("node:vm");
const ts = require("typescript");

const selectedAssignment = "11111111-1111-4111-8111-111111111111";
const otherAssignment = "22222222-2222-4222-8222-222222222222";
const actor = "33333333-3333-4333-8333-333333333333";
const source = ts.transpileModule(readFileSync(join(__dirname, "../app/dashboard/dnd-master/actions.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function record(id, overrides = {}) {
  return { id, lead_product_assignment_id: selectedAssignment, activity_type: "resolution_updated", metadata: { resolution_id: "dnd", released_to_admin_pool: false }, created_by: "original-author", note: "Original note", ...overrides };
}

function setup(initialRecords = [], options = {}) {
  const records = structuredClone(initialRecords);
  const calls = { auth: 0, client: 0, writes: 0, ranges: [], revalidated: [] };
  class Query {
    constructor(table) { this.table = table; this.filters = []; }
    select() { return this; }
    in(field, values) { this.filters.push(row => values.includes(field === "metadata->>resolution_id" ? row.metadata.resolution_id : row[field])); return this; }
    eq(field, value) {
      this.filters.push(row => field === "metadata" ? JSON.stringify(row.metadata) === value : row[field] === value);
      return this;
    }
    is() { this.filters.push(row => row.metadata.dnd_archived_at == null); return this; }
    not() { this.filters.push(row => row.metadata.dnd_archived_at != null); return this; }
    order() { this.sorted = true; return this; }
    range(start, end) { this.bounds = [start, end]; calls.ranges.push([start, end]); return this; }
    update(value) { this.patch = value; return this; }
    then(resolve, reject) {
      return Promise.resolve().then(() => {
        assert.ok(["lead_resolutions", "lead_activities"].includes(this.table), "Archiving must never mutate leads or assignments");
        if (this.table === "lead_resolutions") return options.resolutionsError
          ? { data: null, error: { message: "Failed" } }
          : { data: [{ id: "dnd" }], error: null };
        if (!this.patch && options.readError) return { data: null, error: { message: "Failed" } };
        if (this.patch) {
          calls.writes++;
          if (options.writeError) return { data: null, error: { message: "Failed" } };
          if (options.concurrentChange && !this.conflictApplied) {
            const conflict = records.find(row => row.id === options.concurrentChange);
            if (conflict) conflict.metadata.concurrent_note = "Keep this change";
            this.conflictApplied = true;
          }
        }
        let found = records.filter(row => this.filters.every(filter => filter(row)));
        if (this.sorted) found.sort((left, right) => left.id.localeCompare(right.id));
        if (this.bounds) found = found.slice(this.bounds[0], this.bounds[1] + 1);
        if (this.patch) found.forEach(row => { row.metadata = structuredClone(this.patch.metadata); });
        return { data: structuredClone(found), error: null };
      }).then(resolve, reject);
    }
  }
  const dependencies = {
    "next/cache": { revalidatePath: path => calls.revalidated.push(path) },
    "@/app/lib/auth": { requireAdmin: async () => {
      calls.auth++;
      if (options.unauthorized) throw new Error("Admin required");
      return { userId: actor };
    } },
    "@/app/lib/supabase/admin": { createAdminClient: () => { calls.client++; return { from: table => new Query(table) }; } },
  };
  const context = { exports: {}, require: id => {
    if (!(id in dependencies)) throw new Error(`Unexpected dependency: ${id}`);
    return dependencies[id];
  } };
  runInNewContext(source, context);
  return { run: context.exports.setDndArchiveStatus, records, calls };
}

function request(ids = [selectedAssignment], archive = "true") {
  const data = new FormData();
  ids.forEach(id => data.append("assignmentId", id));
  if (archive !== null) data.set("archive", archive);
  return data;
}

test("archive and restore require admin authorization before accessing the database", async () => {
  for (const archive of ["true", "false"]) {
    const state = setup([], { unauthorized: true });
    await assert.rejects(state.run(request([selectedAssignment], archive)), /Admin required/);
    assert.equal(state.calls.auth, 1);
    assert.equal(state.calls.client, 0);
  }
});

test("invalid selections, oversized batches and invalid archive flags cause no database access", async () => {
  const oversized = Array.from({ length: 101 }, (_, index) => `${index.toString(16).padStart(8, "0")}-1111-4111-8111-111111111111`);
  for (const data of [request([]), request(["bad-id"]), request(oversized), request([selectedAssignment], null), request([selectedAssignment], "yes")]) {
    const state = setup();
    assert.equal((await state.run(data)).ok, false);
    assert.equal(state.calls.client, 0);
  }
});

test("archive preserves authorship and metadata and only changes selected DND history", async () => {
  const initial = [
    record("1"),
    record("2", { lead_product_assignment_id: otherAssignment }),
    record("3", { metadata: { resolution_id: "interested" } }),
    record("4", { activity_type: "note" }),
    record("5", { metadata: { resolution_id: "dnd", dnd_archived_at: "2026-01-01", dnd_archived_by: "earlier-admin" } }),
  ];
  const state = setup(initial);
  assert.equal((await state.run(request([selectedAssignment, selectedAssignment]))).ok, true);
  assert.equal(state.calls.writes, 1);
  assert.equal(state.records[0].metadata.resolution_id, "dnd");
  assert.equal(state.records[0].metadata.released_to_admin_pool, false);
  assert.equal(state.records[0].metadata.dnd_archived_by, actor);
  assert.ok(Number.isFinite(Date.parse(state.records[0].metadata.dnd_archived_at)));
  assert.equal(state.records[0].created_by, initial[0].created_by);
  assert.equal(state.records[0].note, initial[0].note);
  assert.deepEqual(state.records.slice(1), initial.slice(1));
  assert.deepEqual(state.calls.revalidated, ["/dashboard/dnd-master", "/dashboard/team-dnd-master"]);
});

test("restore removes only archive metadata and leaves other records unchanged", async () => {
  const initial = [record("1", { metadata: { resolution_id: "dnd", released_to_admin_pool: false, dnd_archived_at: "2026-01-01", dnd_archived_by: actor } }), record("2")];
  const state = setup(initial);
  assert.equal((await state.run(request([selectedAssignment], "false"))).ok, true);
  assert.deepEqual(state.records[0].metadata, { resolution_id: "dnd", released_to_admin_pool: false });
  assert.deepEqual(state.records[1], initial[1]);
});

test("archive loads history beyond one result page before writing", async () => {
  const state = setup(Array.from({ length: 501 }, (_, index) => record(String(index).padStart(4, "0"))));
  assert.equal((await state.run(request())).ok, true);
  assert.deepEqual(state.calls.ranges, [[0, 499], [500, 999]]);
  assert.equal(state.calls.writes, 501);
  assert.ok(state.records.every(row => row.metadata.dnd_archived_by === actor));
});

test("concurrent metadata edits are retained and partial completion is reported", async () => {
  const state = setup([record("1"), record("2")], { concurrentChange: "2" });
  const result = await state.run(request());
  assert.equal(result.ok, false);
  assert.match(result.message, /1 Do Not Call history records archived/);
  assert.equal(state.records[0].metadata.dnd_archived_by, actor);
  assert.equal(state.records[1].metadata.concurrent_note, "Keep this change");
  assert.equal(state.records[1].metadata.dnd_archived_at, undefined);
});

test("database failures and stale selections never report success", async () => {
  for (const options of [{ resolutionsError: true }, { readError: true }, { writeError: true }]) {
    const initial = [record("1")];
    const state = setup(initial, options);
    assert.equal((await state.run(request())).ok, false);
    assert.deepEqual(state.records, initial);
  }
  assert.equal((await setup().run(request())).ok, false);
});

function selectionToolbar({ canManageLeads = true, archived = false, readOnly = false, confirm = true, selection = [selectedAssignment] } = {}) {
  const calls = { archive: [], delete: [], confirmations: [], jobs: [] };
  const context = { exports: {}, FormData, window: { confirm: message => { calls.confirmations.push(message); return confirm; } }, require(id) {
    if (id === "react") return {
      useState: initial => [Array.isArray(initial) ? selection : initial, () => {}],
      useTransition: () => [false, action => calls.jobs.push(action())],
    };
    if (id === "next/dynamic") return () => () => null;
    if (id === "next/navigation") return { useRouter: () => ({ refresh() {} }) };
    if (id === "./leads-table") return { LeadsTable: () => null };
    if (id === "@/app/dashboard/leads/actions") return {
      deleteLeads: async formData => { calls.delete.push(formData); return { ok: true, message: "Deleted" }; },
      manuallyAssignLeads: async () => {},
    };
    if (id === "@/app/dashboard/dnd-master/actions") return {
      setDndArchiveStatus: async formData => { calls.archive.push(formData); return { ok: true, message: "Updated" }; },
    };
    if (id === "react/jsx-runtime") return require(id);
    throw new Error(`Unexpected client dependency: ${id}`);
  } };
  const clientSource = ts.transpileModule(readFileSync(join(__dirname, "../components/leads/dnd-master-table.tsx"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  runInNewContext(clientSource, context);
  const tree = context.exports.DndMasterTable({
    rows: [{ id: "history-1", lead: { id: "lead-1", assignment_id: selectedAssignment, first_name: "Test", last_name: "Lead", product: [] }, status: "DND", markedBy: "Sales", markedOn: "Today" }],
    columns: [], assignedNames: {}, canManageLeads, archived, readOnly,
  });
  const elements = [];
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object" || !node.props) return;
    elements.push(node);
    visit(node.props.children);
  }
  visit(tree);
  const button = label => elements.find(node => node.type === "button" && node.props.children === label);
  return { calls, button };
}

test("bulk buttons require admin capability and an editable table", () => {
  for (const options of [{ canManageLeads: false }, { readOnly: true }]) {
    const toolbar = selectionToolbar(options);
    assert.equal(toolbar.button("Archive selected"), undefined);
    assert.equal(toolbar.button("Delete selected"), undefined);
  }
});

test("admin bulk actions stay visible but disabled until a visible lead is selected", () => {
  for (const selection of [[], [otherAssignment]]) {
    const toolbar = selectionToolbar({ selection });
    assert.equal(toolbar.button("Archive selected").props.disabled, true);
    assert.equal(toolbar.button("Delete selected").props.disabled, true);
  }
  assert.equal(selectionToolbar().button("Archive selected").props.disabled, false);
  assert.equal(selectionToolbar({ archived: true }).button("Unarchive selected").props.disabled, false);
});

test("archive, restore and delete target only selected assignments through their respective actions", async () => {
  for (const action of ["archive", "restore", "delete"]) {
    const toolbar = selectionToolbar({ archived: action === "restore" });
    toolbar.button(action === "delete" ? "Delete selected" : action === "restore" ? "Unarchive selected" : "Archive selected").props.onClick();
    await Promise.all(toolbar.calls.jobs);
    const forms = action === "delete" ? toolbar.calls.delete : toolbar.calls.archive;
    assert.equal(forms.length, 1);
    assert.deepEqual(forms[0].getAll("assignmentId"), [selectedAssignment]);
    assert.equal(forms[0].get("archive"), action === "delete" ? null : String(action === "archive"));
    assert.equal((action === "delete" ? toolbar.calls.archive : toolbar.calls.delete).length, 0);
    if (action === "delete") assert.match(toolbar.calls.confirmations[0], /entire lead, all its product assignments, notes and history/);
  }
});

test("cancelling confirmation sends no archive or delete requests", async () => {
  for (const label of ["Archive selected", "Delete selected"]) {
    const toolbar = selectionToolbar({ confirm: false });
    toolbar.button(label).props.onClick();
    await Promise.all(toolbar.calls.jobs);
    assert.equal(toolbar.calls.archive.length, 0);
    assert.equal(toolbar.calls.delete.length, 0);
  }
});
