# Dropdown inventory

Phase 1 reconciles the scan as 26 select controls: 17 in Leads and 9 in Settings. The count includes system controls and API-backed user lists so later frontend work can account for every `<select>`.

| File:line | Control | Source type |
|---|---|---|
| `src/screens/leads/page.tsx:328` | Advanced filter join (`AND` / `OR`) | `system_locked` |
| `src/screens/leads/page.tsx:329` | Advanced filter field | `system_locked` |
| `src/screens/leads/page.tsx:330` | Advanced filter operator | `system_locked` |
| `src/screens/leads/page.tsx:509` | New lead type | `managed` |
| `src/screens/leads/page.tsx:509` | New lead Permission To Call | `system_locked` |
| `src/screens/leads/page.tsx:512` | Detail lead stage | `managed` |
| `src/screens/leads/page.tsx:512` | Detail Permission To Call | `system_locked` |
| `src/screens/leads/page.tsx:513` | Edit lead type | `managed` |
| `src/screens/leads/page.tsx:519` | Stage filter | `managed` |
| `src/screens/leads/page.tsx:519` | Permission filter | `system_locked` |
| `src/screens/leads/page.tsx:520` | Follow-up filter | `system_locked` |
| `src/screens/leads/page.tsx:523` | Rows per page | `system_locked` |
| `src/screens/leads/page.tsx:1683` | Related activity | `managed` |
| `src/screens/leads/page.tsx:1737` | Note visibility | `system_locked` |
| `src/screens/leads/page.tsx:1821` | Reminder recipient | `api_backed` |
| `src/screens/leads/page.tsx:2475` | Follow-up assignee | `api_backed` |
| `src/screens/leads/page.tsx:2522` | Notify before | `managed` |
| `src/screens/settings/page.tsx:13` | New member role | `system_locked` |
| `src/screens/settings/page.tsx:14` | Replacement owner | `api_backed` |
| `src/screens/settings/page.tsx:17` | Employee | `api_backed` |
| `src/screens/settings/page.tsx:17` | Employee role | `system_locked` |
| `src/screens/settings/page.tsx:17` | Backup person | `api_backed` |
| `src/screens/settings/page.tsx:18` | Master type | `system_locked` |
| `src/screens/settings/page.tsx:19` | Target salesperson | `api_backed` |
| `src/screens/settings/page.tsx:19` | Weekday | `system_locked` |
| `src/screens/settings/page.tsx:20` | Workspace-setting key | `system_locked` |

## Lead stage semantics

Stage values are active DB-backed `lead_stage` options. `server/index.cjs`, `server/admin.cjs`, and the importer validate against active options; reports and funnel predicates resolve `semantic_key`, so label edits do not change logic. No `won`/`lost` stage logic exists in the current branch. `shared/lead-stages.json` remains only as a compatibility seed/reference artifact and is no longer consumed by application code.

The current related-activity values are existing synthetic demo values. They are seeded only to preserve current UI behavior; no customer data is added to the seed.
