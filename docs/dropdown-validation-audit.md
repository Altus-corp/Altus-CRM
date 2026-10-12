# Dropdown validation audit

Phase 4 moved selectable-value validation to the active dropdown rows. The remaining server constants are safety or business semantics, not option membership validation:

| Dropdown | Remaining location | Why it stays |
| --- | --- | --- |
| `lead_type` | `server/index.cjs:68-69`; `server/lead-import.cjs:21-22` | The legacy known types retain their priority mapping; unknown active types use the safe `P3` fallback. Membership is checked with `Dropdowns.assertSelectableOption` in lead create and with active dropdown rows in import. |
| `permission` | `server/index.cjs:38-42,247,314` | `Yes` is a permission-to-call business rule and view predicate, not an option whitelist. Create/update/write validation uses `assertSelectableOption`; import uses active options. |
| `page_size` | `server/index.cjs:53,166,189,231` | Integer parsing, positive-value handling, and the maximum page-size cap protect the API. The selectable page-size list comes from the dropdown API. |
| `note_visibility` | none | No server-side option whitelist remains; writes receive the selected value from the managed API. |
| `notify_before` | none | No server-side option whitelist remains; writes receive the selected value from the managed API. |
| `related_activity` | none | No server-side option whitelist remains; activity values are not hardcoded as a validation list. |

System-locked dropdowns retain internal business constraints where applicable. `filter_operator` is validated by `server/quick-filters.cjs:43-44` because its operators control SQL expression construction; it is not a managed dropdown and cannot be edited through the dropdown API.
