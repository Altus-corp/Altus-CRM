import { useEffect, useMemo, useState } from "react";
import { api } from "../../shared/api/client";
import type { DropdownDefinition, DropdownOption } from "../../shared/dropdowns/client";

type DefinitionDraft = Pick<DropdownDefinition, "label" | "required" | "default_value" | "is_visible" | "is_active">;
type ProductCatalogItem = { id: string; code: string | null; label: string; active: boolean; sort_order: number };

function sortedOptions(options: DropdownOption[]) {
  return [...options].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
}

export function DropdownManagement() {
  const [definitions, setDefinitions] = useState<DropdownDefinition[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [definitionDraft, setDefinitionDraft] = useState<DefinitionDraft | null>(null);
  const [newOption, setNewOption] = useState({ label: "", value: "" });
  const [editingOption, setEditingOption] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [editingSort, setEditingSort] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingDef, setSavingDef] = useState(false);
  const [addingOpt, setAddingOpt] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [searchFilter, setSearchFilter] = useState("");

  const selected = definitions.find((definition) => definition.key === selectedKey) || null;
  const managed = selected?.source_type === "managed";
  const reorderable = managed || selected?.key === "products";
  const options = useMemo(() => (selected ? sortedOptions(selected.options) : []), [selected]);

  const filteredDefinitions = useMemo(() => {
    const q = searchFilter.trim().toLowerCase();
    if (!q) return definitions;
    return definitions.filter(
      (def) => def.label.toLowerCase().includes(q) || def.key.toLowerCase().includes(q)
    );
  }, [definitions, searchFilter]);

  async function load(preserveKey?: string) {
    setLoading(true);
    setError("");
    try {
      const [response, productResponse] = await Promise.all([
        api<{ dropdowns: DropdownDefinition[] }>("/api/dropdowns"),
        api<{ values: ProductCatalogItem[] }>("/api/masters?type=product"),
      ]);
      const productOptions: DropdownOption[] = (productResponse.values || []).map((product) => ({ id: product.id, dropdown_id: "dropdown-products-catalog", label: product.label, value: product.code || product.label, semantic_key: null, sort_order: product.sort_order || 0, is_active: product.active }));
      const productsDefinition: DropdownDefinition = { id: "dropdown-products-catalog", key: "products", label: "Products", source_type: "api_backed", required: false, default_value: null, is_visible: true, is_active: true, sort_order: 145, options: productOptions };
      const next = [...(response.dropdowns || []).filter((item) => item.key !== "products"), productsDefinition];
      setDefinitions(next);
      const activeKey = preserveKey || selectedKey;
      setSelectedKey(next.some((item) => item.key === activeKey) ? activeKey : next[0]?.key || "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load dropdowns.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (selected) {
      setDefinitionDraft({
        label: selected.label,
        required: selected.required,
        default_value: selected.default_value,
        is_visible: selected.is_visible,
        is_active: selected.is_active,
      });
    } else {
      setDefinitionDraft(null);
    }
    setEditingOption(null);
    setNewOption({ label: "", value: "" });
  }, [selectedKey]);

  function replaceSelected(patch: Partial<DropdownDefinition>) {
    setDefinitions((current) =>
      current.map((item) => (item.key === selectedKey ? { ...item, ...patch } : item))
    );
  }

  async function saveDefinition(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !definitionDraft || !definitionDraft.label.trim()) {
      setError("Dropdown label is required.");
      return;
    }
    if (
      definitionDraft.default_value &&
      !selected.options.some((option) => option.value === definitionDraft.default_value)
    ) {
      setError("Default value must match an existing option.");
      return;
    }
    setSavingDef(true);
    setError("");
    setSuccessMessage("");
    try {
      await api(`/api/dropdowns/${encodeURIComponent(selected.id)}`, {
        method: "POST",
        body: JSON.stringify(definitionDraft),
      });
      replaceSelected(definitionDraft);
      setSuccessMessage("Dropdown configuration saved successfully.");
      setTimeout(() => setSuccessMessage(""), 4000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save dropdown definition.");
    } finally {
      setSavingDef(false);
    }
  }

  async function addOption(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !managed) return;
    const label = newOption.label.trim();
    const value = newOption.value.trim();
    if (!label || !value) {
      setError("Option label and value are required.");
      return;
    }
    if (options.some((option) => option.value === value)) {
      setError("Option values must be unique.");
      return;
    }
    setAddingOpt(true);
    setError("");
    try {
      await api(`/api/dropdowns/${encodeURIComponent(selected.id)}/options`, {
        method: "POST",
        body: JSON.stringify({ label, value, sort_order: options.length * 10 + 10 }),
      });
      setNewOption({ label: "", value: "" });
      setSuccessMessage(`Option "${label}" added.`);
      setTimeout(() => setSuccessMessage(""), 4000);
      await load(selected.key);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to add option.");
    } finally {
      setAddingOpt(false);
    }
  }

  function beginEdit(option: DropdownOption) {
    setEditingOption(option.id);
    setEditingLabel(option.label);
    setEditingSort(option.sort_order);
  }

  async function saveOption(option: DropdownOption) {
    const label = editingLabel.trim();
    if (!label) {
      setError("Option label is required.");
      return;
    }
    setError("");
    try {
      await api(
        `/api/dropdowns/${encodeURIComponent(selected!.id)}/options/${encodeURIComponent(option.id)}`,
        {
          method: "POST",
          body: JSON.stringify({ label, sort_order: editingSort, is_active: option.is_active }),
        }
      );
      setEditingOption(null);
      await load(selected!.key);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update option.");
    }
  }

  async function deactivate(option: DropdownOption) {
    if (!selected || !window.confirm(`Deactivate ${option.label}? Existing records will remain valid.`)) return;
    setError("");
    try {
      await api(
        `/api/dropdowns/${encodeURIComponent(selected.id)}/options/${encodeURIComponent(option.id)}/deactivate`,
        { method: "POST" }
      );
      await load(selected.key);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to deactivate option.");
    }
  }

  async function setActive(option: DropdownOption, isActive: boolean) {
    if (
      !selected ||
      (!isActive && !window.confirm(`Deactivate ${option.label}? Existing records will remain valid.`))
    )
      return;
    setError("");
    try {
      await api(
        `/api/dropdowns/${encodeURIComponent(selected.id)}/options/${encodeURIComponent(option.id)}`,
        {
          method: "POST",
          body: JSON.stringify({ label: option.label, sort_order: option.sort_order, is_active: isActive }),
        }
      );
      await load(selected.key);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to change option status.");
    }
  }

  async function move(option: DropdownOption, direction: -1 | 1) {
    if (!selected) return;
    const index = options.findIndex((item) => item.id === option.id);
    const target = index + direction;
    if (target < 0 || target >= options.length) return;
    const next = [...options];
    [next[index], next[target]] = [next[target], next[index]];
    setError("");
    try {
      await api(selected.key === "products" ? "/api/products/reorder" : `/api/dropdowns/${encodeURIComponent(selected.id)}/options/reorder`, {
        method: "POST",
        body: JSON.stringify(selected.key === "products" ? { product_ids: next.map((item) => item.id) } : { option_ids: next.map((item) => item.id) }),
      });
      await load(selected.key);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to reorder options.");
    }
  }

  if (loading) {
    return (
      <section className="dropdown-loading-wrap" role="status">
        <div className="dropdown-spinner"></div>
        <h2>Loading dropdown definitions...</h2>
        <p>Retrieving configuration records and active options.</p>
      </section>
    );
  }

  return (
    <section className="dropdown-management" aria-label="Dropdown Management">
      {error && (
        <div className="dropdown-alert dropdown-alert-error" role="alert">
          <span className="alert-icon">⚠</span>
          <span>{error}</span>
          <button type="button" className="alert-close" onClick={() => setError("")} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {successMessage && (
        <div className="dropdown-alert dropdown-alert-success" role="status">
          <span className="alert-icon">✓</span>
          <span>{successMessage}</span>
          <button
            type="button"
            className="alert-close"
            onClick={() => setSuccessMessage("")}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      <div className="dropdown-management-grid">
        {/* LEFT MASTER LIST */}
        <aside className="dropdown-sidebar-card">
          <div className="dropdown-sidebar-header">
            <div className="dropdown-sidebar-title-row">
              <h3>Dropdowns</h3>
              <span className="dropdown-badge-counter">{definitions.length}</span>
            </div>
            <div className="dropdown-search-box">
              <span className="search-icon" aria-hidden="true">
                ⌕
              </span>
              <input
                type="search"
                className="dropdown-search-input"
                placeholder="Search dropdowns..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                aria-label="Filter dropdown list"
              />
            </div>
          </div>

          <div className="dropdown-items-scroller" role="tablist" aria-label="Dropdowns">
            {filteredDefinitions.length === 0 ? (
              <div className="dropdown-no-results">No matching dropdowns found.</div>
            ) : (
              filteredDefinitions.map((def) => {
                const isSelected = def.key === selectedKey;
                return (
                  <button
                    key={def.id}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    className={`dropdown-list-item-btn ${isSelected ? "is-selected" : ""}`}
                    onClick={() => {
                      setSelectedKey(def.key);
                      setError("");
                      setSuccessMessage("");
                    }}
                  >
                    <div className="dropdown-item-header">
                      <span className="dropdown-item-name">{def.label}</span>
                      <span className={`dropdown-tag-pill source-${def.source_type}`}>
                        {def.source_type === "managed"
                          ? "Managed"
                          : def.source_type === "system_locked"
                          ? "System"
                          : "API"}
                      </span>
                    </div>
                    <div className="dropdown-item-meta">
                      <code>{def.key}</code>
                      <span className="dropdown-meta-bullet">•</span>
                      <span>{def.options?.length ?? 0} options</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* RIGHT DETAILS WORKSPACE */}
        {selected && definitionDraft ? (
          <div className="dropdown-editor">
            {/* CARD 1: SETTINGS */}
            <div className="dropdown-card dropdown-settings-card">
              <div className="dropdown-card-topbar">
                <div className="dropdown-header-titles">
                  <div className="dropdown-header-keyline">
                    <span className="eyebrow-chip">Configuration</span>
                    <span className={`source-pill-lg source-${selected.source_type}`}>
                      Source: <strong>{selected.source_type}</strong>
                    </span>
                    <span className="key-code-chip">
                      Key: <code>{selected.key}</code>
                    </span>
                  </div>
                  <h2>{selected.label}</h2>
                  <p>
                    Manage default behavior, validation constraints, and visibility for this dropdown.
                  </p>
                </div>
              </div>

              <form className="dropdown-settings-form" onSubmit={(event) => void saveDefinition(event)}>
                <div className="dropdown-fields-row">
                  <div className="dropdown-field-block">
                    <label htmlFor="field-label">Display Label *</label>
                    <input
                      id="field-label"
                      required
                      value={definitionDraft.label}
                      onChange={(event) =>
                        setDefinitionDraft({ ...definitionDraft, label: event.target.value })
                      }
                      placeholder="e.g. Lead stage"
                    />
                    <span className="field-hint-text">Label displayed across forms and reports</span>
                  </div>

                  <div className="dropdown-field-block">
                    <label htmlFor="field-default">Default Value</label>
                    {options.length > 0 && selected.source_type !== "api_backed" ? (
                      <select
                        id="field-default"
                        value={definitionDraft.default_value || ""}
                        onChange={(event) =>
                          setDefinitionDraft({
                            ...definitionDraft,
                            default_value: event.target.value || null,
                          })
                        }
                      >
                        <option value="">(None - No default value)</option>
                        {options.map((opt) => (
                          <option key={opt.id} value={opt.value}>
                            {opt.label} ({opt.value})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id="field-default"
                        value={definitionDraft.default_value || ""}
                        onChange={(event) =>
                          setDefinitionDraft({
                            ...definitionDraft,
                            default_value: event.target.value || null,
                          })
                        }
                        disabled={selected.source_type === "api_backed"}
                        placeholder="No default value"
                      />
                    )}
                    <span className="field-hint-text">Value automatically pre-selected on new records</span>
                  </div>
                </div>

                <div className="dropdown-flags-group">
                  <label className="dropdown-flag-toggle">
                    <input
                      type="checkbox"
                      checked={definitionDraft.required}
                      onChange={(event) =>
                        setDefinitionDraft({ ...definitionDraft, required: event.target.checked })
                      }
                    />
                    <div className="flag-content">
                      <strong>Required</strong>
                      <span>Mandatory on record creation</span>
                    </div>
                  </label>

                  <label className="dropdown-flag-toggle">
                    <input
                      type="checkbox"
                      checked={definitionDraft.is_visible}
                      onChange={(event) =>
                        setDefinitionDraft({ ...definitionDraft, is_visible: event.target.checked })
                      }
                    />
                    <div className="flag-content">
                      <strong>Visible</strong>
                      <span>Displayed in UI forms &amp; filters</span>
                    </div>
                  </label>

                  <label className="dropdown-flag-toggle">
                    <input
                      type="checkbox"
                      checked={definitionDraft.is_active}
                      onChange={(event) =>
                        setDefinitionDraft({ ...definitionDraft, is_active: event.target.checked })
                      }
                    />
                    <div className="flag-content">
                      <strong>Active</strong>
                      <span>Available for team selection</span>
                    </div>
                  </label>
                </div>

                <div className="dropdown-form-footer">
                  <button type="submit" className="dropdown-primary-btn" disabled={savingDef}>
                    {savingDef ? "Saving changes..." : "Save definition"}
                  </button>
                </div>
              </form>
            </div>

            {/* CARD 2: OPTIONS TABLE */}
            <div className="dropdown-card dropdown-options-card">
              <div className="dropdown-options-heading">
                <div>
                  <div className="options-title-row">
                    <h2>Options</h2>
                    <span className="options-count-badge">{options.length}</span>
                  </div>
                  <p className="options-sub-text">
                    Control display labels, values, display ordering, and availability.
                  </p>
                </div>
                {!managed && (
                  <span className="dropdown-system-banner">
                    Read-only: {selected.source_type} values are controlled by the system/API.
                  </span>
                )}
              </div>

              {managed && (
                <form className="dropdown-add-form" onSubmit={(event) => void addOption(event)}>
                  <div className="add-field-group">
                    <label htmlFor="new-opt-lbl">Option Label</label>
                    <input
                      id="new-opt-lbl"
                      aria-label="New option label"
                      placeholder="e.g. Enterprise Tier"
                      value={newOption.label}
                      onChange={(event) => setNewOption({ ...newOption, label: event.target.value })}
                    />
                  </div>
                  <div className="add-field-group">
                    <label htmlFor="new-opt-val">Internal Value</label>
                    <input
                      id="new-opt-val"
                      aria-label="New option value"
                      placeholder="e.g. enterprise"
                      value={newOption.value}
                      onChange={(event) => setNewOption({ ...newOption, value: event.target.value })}
                    />
                  </div>
                  <button type="submit" className="dropdown-add-submit-btn" disabled={addingOpt}>
                    {addingOpt ? "Adding…" : "＋ Add option"}
                  </button>
                </form>
              )}

              <div className="dropdown-table-wrapper">
                <table className="admin-table dropdown-options-table">
                  <thead>
                    <tr>
                      <th style={{ width: "70px" }}>Order</th>
                      <th>Label</th>
                      <th>Value</th>
                      <th style={{ width: "90px" }}>Sort</th>
                      <th style={{ width: "110px" }}>Status</th>
                      {managed && <th style={{ width: "200px", textAlign: "right" }}>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {options.length === 0 ? (
                      <tr>
                        <td colSpan={managed ? 6 : 5} className="dropdown-empty-row">
                          No options have been created for this dropdown.
                        </td>
                      </tr>
                    ) : (
                      options.map((option, index) => {
                        const isEditing = editingOption === option.id;
                        return (
                          <tr
                            key={option.id}
                            className={`${isEditing ? "is-editing-row" : ""} ${
                              !option.is_active ? "is-inactive-row" : ""
                            }`}
                          >
                            <td className="cell-reorder">
                              {reorderable ? (
                                <div className="reorder-btn-pair">
                                  <button
                                    type="button"
                                    className="reorder-arrow-btn"
                                    onClick={() => void move(option, -1)}
                                    disabled={index === 0}
                                    title="Move up"
                                    aria-label={`Move ${option.label} up`}
                                  >
                                    ↑
                                  </button>
                                  <button
                                    type="button"
                                    className="reorder-arrow-btn"
                                    onClick={() => void move(option, 1)}
                                    disabled={index === options.length - 1}
                                    title="Move down"
                                    aria-label={`Move ${option.label} down`}
                                  >
                                    ↓
                                  </button>
                                </div>
                              ) : (
                                <span className="order-index-badge">{index + 1}</span>
                              )}
                            </td>

                            <td className="cell-label-text">
                              {isEditing ? (
                                <input
                                  className="inline-edit-field"
                                  aria-label={`Edit label ${option.value}`}
                                  value={editingLabel}
                                  onChange={(event) => setEditingLabel(event.target.value)}
                                  autoFocus
                                />
                              ) : (
                                <strong className="opt-title">{option.label}</strong>
                              )}
                            </td>

                            <td className="cell-value-code">
                              <code>{option.value}</code>
                            </td>

                            <td className="cell-sort-num">
                              {isEditing ? (
                                <input
                                  type="number"
                                  className="inline-edit-field edit-sort-num"
                                  value={editingSort}
                                  onChange={(event) => setEditingSort(Number(event.target.value))}
                                  aria-label="Edit sort order"
                                />
                              ) : (
                                <span className="sort-order-pill">{option.sort_order}</span>
                              )}
                            </td>

                            <td className="cell-status-badge">
                              <span
                                className={`status-indicator-pill ${
                                  option.is_active ? "is-active" : "is-inactive"
                                }`}
                              >
                                <span className="status-dot"></span>
                                {option.is_active ? "Active" : "Inactive"}
                              </span>
                            </td>

                            {managed && (
                              <td className="cell-actions-btns">
                                {isEditing ? (
                                  <div className="action-buttons-wrap">
                                    <button
                                      type="button"
                                      className="btn-opt-save"
                                      onClick={() => void saveOption(option)}
                                    >
                                      Save
                                    </button>
                                    <button
                                      type="button"
                                      className="btn-opt-cancel"
                                      onClick={() => setEditingOption(null)}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <div className="action-buttons-wrap">
                                    <button
                                      type="button"
                                      className="btn-opt-edit"
                                      onClick={() => beginEdit(option)}
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      className={`btn-opt-toggle ${
                                        option.is_active ? "is-deactivate" : "is-activate"
                                      }`}
                                      onClick={() => void setActive(option, !option.is_active)}
                                    >
                                      {option.is_active ? "Deactivate" : "Activate"}
                                    </button>
                                  </div>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
