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

  // Notes tab list view & toggle
  assert.match(pageSource, /lead-notes-tab-header/, "Should include notes tab header bar");
  assert.match(pageSource, /lead-add-note-trigger-btn/, "Should include + Add note trigger button");
  assert.match(pageSource, /lead-notes-count-badge/, "Should include notes count badge");
  assert.match(pageSource, /lead-note-composer-close-btn/, "Should include composer close button");

  // Redesigned Add Activity drawer
  assert.match(pageSource, /lead-add-activity-drawer/, "Should include Add Activity drawer aside");
  assert.match(pageSource, /ADD ACTIVITY/, "Should include ADD ACTIVITY eyebrow");
  assert.match(pageSource, /Log an activity/, "Should include Log an activity title");
  assert.match(pageSource, /lead-add-activity-lead-row/, "Should include lead context row");
  assert.match(pageSource, /Score 42/, "Should include Score 42 in lead row");
  assert.match(pageSource, /View lead/, "Should include View lead link");
  assert.match(pageSource, /Activity type/, "Should include Activity type label");
  assert.match(pageSource, /Activity types are managed by your administrator\./, "Should include admin helper text");
  assert.match(pageSource, /Activity details/, "Should include Activity details label");
  assert.match(pageSource, /Add attachment/, "Should include Add attachment button");
  assert.match(pageSource, /Add follow-up task/, "Should include Add follow-up task toggle");
  assert.match(pageSource, /Task title/, "Should include Task title field");
  assert.match(pageSource, /Send notification/, "Should include Send notification toggle");
  assert.match(pageSource, /Notify me/, "Should include Notify me checkbox");
  assert.match(pageSource, /15 minutes before/, "Should include 15 minutes before option");
  assert.match(pageSource, /Chrome desktop pop-up/, "Should include Chrome desktop pop-up helper");
  assert.match(pageSource, /Send by email/, "Should include Send by email helper");
  assert.match(pageSource, /lead-add-activity-save-btn/, "Should include Save activity button");
  assert.match(pageSource, /Save activity/, "Should include Save activity text");

  // Follow-up tab & form
  assert.match(pageSource, /lead-followup-tab-header/, "Should include follow-up tab header");
  assert.match(pageSource, /lead-add-followup-trigger-btn/, "Should include + Add follow-up button");
  assert.match(pageSource, /lead-followup-count-badge/, "Should include follow-up count badge");
  assert.match(pageSource, /lead-followup-form-card/, "Should include follow-up form card");
  assert.match(pageSource, /Schedule follow-up/, "Should include Schedule follow-up title");
  assert.match(pageSource, /Follow-up Note/, "Should include Follow-up Note label");
  assert.match(pageSource, /Notification set/, "Should include Notification set label");
  assert.match(pageSource, /In-app pop-up/, "Should include In-app pop-up choice");
  assert.match(pageSource, /Email notification/, "Should include Email notification choice");
  assert.match(pageSource, /lead-followup-save-btn/, "Should include Save follow-up button");
  assert.match(pageSource, /lead-followup-feed-container/, "Should include follow-up feed container");
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
  assert.match(cssSource, /\.lead-notes-tab-header/);
  assert.match(cssSource, /\.lead-add-note-trigger-btn/);
  assert.match(cssSource, /\.lead-note-composer-close-btn/);
  assert.match(cssSource, /\.lead-note-composer-card/);
  assert.match(cssSource, /\.lead-note-type-pills/);
  assert.match(cssSource, /\.lead-note-toolbar/);
  assert.match(cssSource, /\.lead-toggle-switch/);
  assert.match(cssSource, /\.lead-note-meta-grid/);
  assert.match(cssSource, /\.lead-note-reminder-subrow/);
  assert.match(cssSource, /\.lead-note-save-btn/);

  // Add Activity drawer styles
  assert.match(cssSource, /\.lead-add-activity-drawer/);
  assert.match(cssSource, /\.lead-add-activity-header/);
  assert.match(cssSource, /\.lead-add-activity-eyebrow/);
  assert.match(cssSource, /\.lead-add-activity-lead-row/);
  assert.match(cssSource, /\.lead-add-activity-dropdown-menu/);
  assert.match(cssSource, /\.lead-add-activity-task-grid/);
  assert.match(cssSource, /\.lead-add-activity-notify-row/);
  assert.match(cssSource, /\.lead-add-activity-choice-card/);
  assert.match(cssSource, /\.lead-add-activity-footer/);
  assert.match(cssSource, /\.lead-add-activity-save-btn/);

  // Follow-up tab styles
  assert.match(cssSource, /\.lead-followup-tab-header/);
  assert.match(cssSource, /\.lead-add-followup-trigger-btn/);
  assert.match(cssSource, /\.lead-followup-form-card/);
  assert.match(cssSource, /\.lead-followup-notify-card/);
  assert.match(cssSource, /\.lead-followup-save-btn/);
  assert.match(cssSource, /\.lead-followup-feed-container/);
  assert.match(cssSource, /\.lead-followup-card/);
});


