const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("Lead Details UI structure in page.tsx matches reference design", () => {
  const pageSource = fs.readFileSync("src/screens/leads/page.tsx", "utf8");

  // Header & eyebrow
  assert.match(pageSource, /LEAD DETAIL/, "Should include LEAD DETAIL eyebrow");
  assert.match(pageSource, /lead-detail-close-btn/, "Should include circular close button");

  // Quick actions
  assert.match(pageSource, /lead-quick-actions-bar/, "Should include quick actions container");
  assert.match(pageSource, /CallIcon/, "Should include Call quick action");
  assert.match(pageSource, /EmailIcon/, "Should include Email quick action");
  assert.match(pageSource, /WhatsAppIcon/, "Should include WhatsApp quick action");
  assert.match(pageSource, /NoteIcon/, "Should include Note quick action");
  assert.match(pageSource, /CalendarIcon/, "Should include Follow-up quick action");

  // Tabs
  assert.match(pageSource, /lead-detail-tabs/, "Should include detail tabs list");

  // Activity header actions
  assert.match(pageSource, /lead-add-activity-btn/, "Should include Add Activity action");
  assert.match(pageSource, /lead-activity-filter-btn/, "Should include Activity filter action");

  // 3-column banner
  assert.match(pageSource, /lead-meta-banner/, "Should include 3-column metadata card");
  assert.match(pageSource, /BuildingIcon/, "Should include building icon for status");
  assert.match(pageSource, /GlobeIcon/, "Should include globe icon for source");
  assert.match(pageSource, /lead-meta-avatar/, "Should include avatar for assignee");

  // Static top container
  assert.match(pageSource, /lead-detail-static-top/, "Should wrap header, actions, and tabs in static container");

  // Timeline rail and items
  assert.match(pageSource, /lead-timeline-container/, "Should include timeline container");
  assert.match(pageSource, /lead-timeline-rail/, "Should include timeline rail");
  assert.match(pageSource, /Follow-up scheduled/, "Should include follow-up scheduled item");
  assert.match(pageSource, /badge-upcoming/, "Should include Upcoming badge");
  assert.match(pageSource, /Latest activity/, "Should include Latest activity divider chip");
  assert.match(pageSource, /card-highlight/, "Should include highlighted card style");
  assert.match(pageSource, /badge-latest/, "Should include Latest badge");
  assert.match(pageSource, /badge-connected/, "Should include Connected badge");
  assert.match(pageSource, /badge-assigned/, "Should include Assigned badge");

  // Add Note UI matching reference design
  assert.match(pageSource, /lead-note-composer-card/, "Should include note composer card");
  assert.match(pageSource, /NEW NOTE/, "Should include NEW NOTE eyebrow in notes tab");
  assert.match(pageSource, /lead-note-context-bar/, "Should include lead context bar");
  assert.match(pageSource, /lead-note-avatar-badge/, "Should include lead avatar badge in notes");
  assert.match(pageSource, /General note/, "Should include General note pill");
  assert.match(pageSource, /Call note/, "Should include Call note pill");
  assert.match(pageSource, /Meeting note/, "Should include Meeting note pill");
  assert.match(pageSource, /Internal handoff/, "Should include Internal handoff pill");
  assert.match(pageSource, /lead-note-toolbar/, "Should include rich text editor toolbar");
  assert.match(pageSource, /lead-note-meta-grid/, "Should include 3-column metadata grid");
  assert.match(pageSource, /Related activity/, "Should include Related activity field");
  assert.match(pageSource, /lead-note-tag-chips/, "Should include tag chips container");
  assert.match(pageSource, /Pin to lead/, "Should include Pin to lead toggle");
  assert.match(pageSource, /Set a reminder/, "Should include Set a reminder toggle");
  assert.match(pageSource, /lead-note-reminder-subrow/, "Should include reminder date, time, and notify controls");
  assert.match(pageSource, /Attachments/, "Should include Attachments section");
  assert.match(pageSource, /Attach files/, "Should include Attach files button");
  assert.match(pageSource, /Show in activity history/, "Should include Show in activity history toggle");
  assert.match(pageSource, /lead-note-save-btn/, "Should include Save note button");
});

test("Lead Details styles exist in leads.css", () => {
  const cssSource = fs.readFileSync("src/screens/leads/leads.css", "utf8");

  assert.match(cssSource, /\.lead-detail-header/);
  assert.match(cssSource, /\.lead-quick-actions-bar/);
  assert.match(cssSource, /\.lead-detail-static-top/);
  assert.match(cssSource, /\.lead-meta-banner/);
  assert.match(cssSource, /\.lead-timeline-container/);
  assert.match(cssSource, /\.lead-timeline-rail/);
  assert.match(cssSource, /\.card-highlight/);
  assert.match(cssSource, /\.lead-note-composer-card/);
  assert.match(cssSource, /\.lead-note-type-pills/);
  assert.match(cssSource, /\.lead-note-toolbar/);
  assert.match(cssSource, /\.lead-toggle-switch/);
  assert.match(cssSource, /\.lead-note-meta-grid/);
  assert.match(cssSource, /\.lead-note-reminder-subrow/);
  assert.match(cssSource, /\.lead-note-save-btn/);
});

