const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("Lead Details UI structure in page.tsx matches reference design", () => {
  const pageSource = fs.readFileSync("src/screens/leads/page.tsx", "utf8");
  assert.match(pageSource, /<th scope="col">Status<\/th>/, "Leads table should show a status column");
  assert.match(pageSource, /className="lead-status-select"/, "Lead status should use the table dropdown");
  assert.match(pageSource, /updateLeadStatus/, "Lead status dropdown should save changes");
  assert.match(pageSource, /Basic details/, "Lead form should include grouped basic details");
  assert.match(pageSource, /Introducer details/, "Lead form should include grouped introducer details");
  assert.match(pageSource, /Calling details/, "Lead form should include grouped calling details");
  assert.match(pageSource, /Outreach tracking/, "Lead form should include grouped outreach fields");
  assert.match(pageSource, /System info/, "Lead detail should include system info");
  assert.match(pageSource, /Choose columns/, "Lead list should include a column chooser");
  assert.match(pageSource, /quick-add-modal/, "Leads page should include the Quick Add modal");
  assert.match(pageSource, /lead-quick-chip-bar/, "Leads page should include the quick-filter chip bar");
  assert.match(pageSource, /Call Logs/, "Leads page should include the Call Logs filter");
  assert.match(pageSource, /Select Member/, "Admin Call Logs filter should include member selection");

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
  assert.match(pageSource, /ref=\{activityTypePickerRef\}/, "Should attach ref to dropdown container for outside click handling");
  assert.match(pageSource, /Activity types are managed by your administrator\./, "Should include admin helper text");
  assert.match(pageSource, /Activity details/, "Should include Activity details label");
  assert.match(pageSource, /Add attachment/, "Should include Add attachment button");
  assert.match(pageSource, /Add follow-up task/, "Should include Add follow-up task toggle");
  assert.match(pageSource, /Task title/, "Should include Task title field");
  assert.match(pageSource, /Send notification/, "Should include Send notification toggle");
  assert.match(pageSource, /Notify me/, "Should include Notify me checkbox");
  assert.match(pageSource, /dropdownKey="notify_before"/, "Should load notification timing options dynamically");
  assert.match(pageSource, /<strong>App<\/strong>/, "Should include App notification choice");
  assert.match(pageSource, /In-app pop-up/, "Should include In-app pop-up helper");
  assert.match(pageSource, /Send by email/, "Should include Send by email helper");
  assert.match(pageSource, /choice-checkbox/, "Should include choice checkbox for multi-select notifications");
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

  // Redesigned Details tab UI
  assert.match(pageSource, /lead-details-header-row/, "Should include details header row");
  assert.match(pageSource, /lead-details-edit-btn/, "Should include Edit details button");
  assert.match(pageSource, /lead-details-more-btn/, "Should include more details menu button");
  assert.match(pageSource, /lead-details-hero-card/, "Should include hero summary card");
  assert.match(pageSource, /lead-details-hero-avatar/, "Should include hero avatar badge");
  assert.match(pageSource, /lead-details-hero-stage-pill/, "Should include hero stage pill");
  assert.match(pageSource, /Contact information/, "Should include Contact information section header");
  assert.match(pageSource, /First name/, "Should include First name field");
  assert.match(pageSource, /Last name/, "Should include Last name field");
  assert.match(pageSource, /Professional information/, "Should include Professional information section header");
  assert.match(pageSource, /Lead qualification/, "Should include Lead qualification section header");
  assert.match(pageSource, /Attribution & ownership/, "Should include Attribution & ownership section header");
  assert.match(pageSource, /Additional fields \(6\)/, "Should include Additional fields (6) accordion");
  assert.match(pageSource, /Permission To Call/, "Should include Permission To Call field");
  assert.match(pageSource, /PSO Date/, "Should include PSO Date field");
  assert.match(pageSource, /Pre-PS Done/, "Should include Pre-PS Done field");
  assert.match(pageSource, /Last called on/, "Should include Last called on field");
  assert.match(pageSource, /Next follow-up/, "Should include Next follow-up field");
  assert.match(pageSource, /Products/, "Should include Products field");
});

test("Lead Details edit transition dismisses the drawer before showing the edit form", () => {
  const functionSource = fs.readFileSync("src/screens/leads/function.tsx", "utf8");
  const pageSource = fs.readFileSync("src/screens/leads/page.tsx", "utf8");
  assert.match(functionSource, /function beginEdit\(\).*setDetail\(null\)/s);
  assert.match(functionSource, /function beginEdit\(\).*next\.delete\("open"\)/s);
  assert.match(functionSource, /const leadId = editingLeadId \|\| detail\?\.lead\.id/);
  assert.match(pageSource, /onClick=\{screen\.beginEdit\}/);
  assert.match(pageSource, /onCancel=\{screen\.cancelEdit\}/);
});

test("Lead Details edit action follows the lead edit capability", () => {
  const functionSource = fs.readFileSync("src/screens/leads/function.tsx", "utf8");
  const pageSource = fs.readFileSync("src/screens/leads/page.tsx", "utf8");
  assert.match(pageSource, /className="lead-details-edit-btn"[\s\S]*disabled=\{!screen\.canEdit\}/);
  assert.match(functionSource, /function beginEdit\(\)[\s\S]*if \(!canEdit\)[\s\S]*permission to edit leads/);
  assert.match(functionSource, /async function saveLeadEdit[\s\S]*if \(!canEdit\)/);
});

test("successful lead edit returns to the main list and uses a short success toast", () => {
  const source = fs.readFileSync("src/screens/leads/function.tsx", "utf8");
  assert.match(source, /showToast\(\"Lead updated successfully\.\", 1800\)/);
  assert.match(source, /setEditing\(false\); setEditingLeadId\(null\); showToast/);
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
  assert.match(cssSource, /\.choice-checkbox/);
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

  // Details tab styles
  assert.match(cssSource, /\.lead-details-tab-panel/);
  assert.match(cssSource, /\.lead-details-header-row/);
  assert.match(cssSource, /\.lead-details-title/);
  assert.match(cssSource, /\.lead-details-edit-btn/);
  assert.match(cssSource, /\.lead-details-more-btn/);
  assert.match(cssSource, /\.lead-details-hero-card/);
  assert.match(cssSource, /\.lead-details-hero-avatar/);
  assert.match(cssSource, /\.lead-details-hero-stage-pill/);
  assert.match(cssSource, /\.lead-details-hero-divider/);
  assert.match(cssSource, /\.lead-details-section/);
  assert.match(cssSource, /\.lead-details-section-header/);
  assert.match(cssSource, /\.lead-details-grid/);
  assert.match(cssSource, /\.lead-details-item/);
  assert.match(cssSource, /\.lead-details-label/);
  assert.match(cssSource, /\.lead-details-value/);
  assert.match(cssSource, /\.lead-details-accordion/);
  assert.match(cssSource, /\.lead-details-accordion-btn/);
});

test("Leads list exposes supported rows-per-page choices", () => {
  const pageSource = fs.readFileSync("src/screens/leads/page.tsx", "utf8");
  const functionSource = fs.readFileSync("src/screens/leads/function.tsx", "utf8");
  assert.match(pageSource, /Rows per page/);
  assert.match(pageSource, /dropdownKey="page_size"/);
  assert.match(fs.readFileSync("shared/dropdown-seed.json", "utf8"), /"page_size"/);
  assert.match(functionSource, /pageSizeDropdown\.options/);
  assert.match(functionSource, /params\.set\("page_size", String\(pageSize\)\)/);
  assert.match(functionSource, /setPageSize\(Number\(value\)\); setPage\(1\)/);
});

test("Leads list includes checkbox for every lead and select all option", () => {
  const pageSource = fs.readFileSync("src/screens/leads/page.tsx", "utf8");
  const functionSource = fs.readFileSync("src/screens/leads/function.tsx", "utf8");
  const cssSource = fs.readFileSync("src/screens/leads/leads.css", "utf8");

  // Table header has select-all checkbox
  assert.match(pageSource, /TableSelectAllCheckbox/);
  assert.match(pageSource, /lead-table-checkbox-col/);
  assert.match(pageSource, /Select all leads/);

  // Table rows have checkbox with stopPropagation
  assert.match(pageSource, /type="checkbox"/);
  assert.match(pageSource, /lead-table-checkbox/);
  assert.match(pageSource, /stopPropagation/);

  // Function exposes selection state & controls
  assert.match(functionSource, /selectedLeadIds/);
  assert.match(functionSource, /selectAllView/);
  assert.match(functionSource, /toggleSelectLead/);
  assert.match(functionSource, /toggleSelectAll/);
  assert.match(functionSource, /clearSelection/);

  // CSS has checkbox and selection styles
  assert.match(cssSource, /\.lead-table-checkbox-col/);
  assert.match(cssSource, /\.lead-table-checkbox-label/);
  assert.match(cssSource, /\.lead-table-checkbox/);
  assert.match(cssSource, /\.is-selected/);
  assert.match(cssSource, /\.lead-selection-bar/);

  // Manage header buttons hover styling preserves text contrast
  assert.match(cssSource, /\.manage-add/);
  assert.match(cssSource, /\.manage-add:hover[\s\S]*color:\s*var\(--bg\)/);
});

test("Leads list Columns control renders the column chooser", () => {
  const pageSource = fs.readFileSync("src/screens/leads/page.tsx", "utf8");
  const cssSource = fs.readFileSync("src/screens/leads/leads.css", "utf8");
  assert.match(pageSource, /aria-label="Choose columns"/);
  assert.match(pageSource, /checked=\{(?:visibleColumnKeys|pendingColumnKeys)\.includes\(field\.key\)\}/);
  assert.match(pageSource, /(?:setVisibleColumnKeys|togglePendingColumn|applyColumnSelection)/);
  assert.match(cssSource, /\.lead-column-menu/);
});

test("Leads list column selection persists by user, restores, applies order, and resets", () => {
  const pageSource = fs.readFileSync("src/screens/leads/page.tsx", "utf8");
  assert.match(pageSource, /leads\.columns\.v1/);
  assert.match(pageSource, /window\.localStorage\.getItem/);
  assert.match(pageSource, /\/api\/user-preferences/);
  assert.match(pageSource, /method: "DELETE"/);
  assert.match(pageSource, /normalizeColumnKeys/);
  assert.match(pageSource, /visibleColumnKeys\.map\(\(key\) => allChooserFields\.find/);
});



