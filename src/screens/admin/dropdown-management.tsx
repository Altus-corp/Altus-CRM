import { useEffect, useMemo, useState } from "react";
import { api } from "../../shared/api/client";
import type { DropdownDefinition, DropdownOption } from "../../shared/dropdowns/client";

type DefinitionDraft = Pick<DropdownDefinition, "label" | "required" | "default_value" | "is_visible" | "is_active">;

function sortedOptions(options: DropdownOption[]) { return [...options].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id)); }

export function DropdownManagement() {
  const [definitions, setDefinitions] = useState<DropdownDefinition[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [definitionDraft, setDefinitionDraft] = useState<DefinitionDraft | null>(null);
  const [newOption, setNewOption] = useState({ label: "", value: "" });
  const [editingOption, setEditingOption] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [editingSort, setEditingSort] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const selected = definitions.find((definition) => definition.key === selectedKey) || null;
  const managed = selected?.source_type === "managed";
  const options = useMemo(() => selected ? sortedOptions(selected.options) : [], [selected]);

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await api<{ dropdowns: DropdownDefinition[] }>("/api/dropdowns");
      const next = response.dropdowns || [];
      setDefinitions(next); setSelectedKey((current) => next.some((item) => item.key === current) ? current : next[0]?.key || "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load dropdowns."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (selected) setDefinitionDraft({ label: selected.label, required: selected.required, default_value: selected.default_value, is_visible: selected.is_visible, is_active: selected.is_active }); else setDefinitionDraft(null); }, [selected]);

  function replaceSelected(patch: Partial<DropdownDefinition>) { setDefinitions((current) => current.map((item) => item.key === selectedKey ? { ...item, ...patch } : item)); }
  async function saveDefinition(event: React.FormEvent) {
    event.preventDefault(); if (!selected || !definitionDraft || !definitionDraft.label.trim()) { setError("Dropdown label is required."); return; }
    if (definitionDraft.default_value && !selected.options.some((option) => option.value === definitionDraft.default_value)) { setError("Default value must match an existing option."); return; }
    try { await api(`/api/dropdowns/${encodeURIComponent(selected.id)}`, { method: "POST", body: JSON.stringify(definitionDraft) }); replaceSelected(definitionDraft); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save dropdown definition."); }
  }
  async function addOption(event: React.FormEvent) {
    event.preventDefault(); if (!selected || !managed) return;
    const label = newOption.label.trim(); const value = newOption.value.trim();
    if (!label || !value) { setError("Option label and value are required."); return; }
    if (options.some((option) => option.value === value)) { setError("Option values must be unique."); return; }
    try { await api(`/api/dropdowns/${encodeURIComponent(selected.id)}/options`, { method: "POST", body: JSON.stringify({ label, value, sort_order: options.length * 10 + 10 }) }); setNewOption({ label: "", value: "" }); setError(""); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to add option."); }
  }
  function beginEdit(option: DropdownOption) { setEditingOption(option.id); setEditingLabel(option.label); setEditingSort(option.sort_order); }
  async function saveOption(option: DropdownOption) {
    const label = editingLabel.trim(); if (!label) { setError("Option label is required."); return; }
    try { await api(`/api/dropdowns/${encodeURIComponent(selected!.id)}/options/${encodeURIComponent(option.id)}`, { method: "POST", body: JSON.stringify({ label, sort_order: editingSort, is_active: option.is_active }) }); setEditingOption(null); setError(""); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update option."); }
  }
  async function deactivate(option: DropdownOption) {
    if (!selected || !window.confirm(`Deactivate ${option.label}? Existing records will remain valid.`)) return;
    try { await api(`/api/dropdowns/${encodeURIComponent(selected.id)}/options/${encodeURIComponent(option.id)}/deactivate`, { method: "POST" }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to deactivate option."); }
  }
  async function setActive(option: DropdownOption, isActive: boolean) {
    if (!selected || (!isActive && !window.confirm(`Deactivate ${option.label}? Existing records will remain valid.`))) return;
    try { await api(`/api/dropdowns/${encodeURIComponent(selected.id)}/options/${encodeURIComponent(option.id)}`, { method: "POST", body: JSON.stringify({ label: option.label, sort_order: option.sort_order, is_active: isActive }) }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to change option status."); }
  }
  async function move(option: DropdownOption, direction: -1 | 1) {
    if (!selected) return; const index = options.findIndex((item) => item.id === option.id); const target = index + direction; if (target < 0 || target >= options.length) return;
    const next = [...options]; [next[index], next[target]] = [next[target], next[index]];
    try { await api(`/api/dropdowns/${encodeURIComponent(selected.id)}/options/reorder`, { method: "POST", body: JSON.stringify({ option_ids: next.map((item) => item.id) }) }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to reorder options."); }
  }

  if (loading) return <section className="admin-empty" role="status"><h2>Loading dropdowns</h2></section>;
  return <section className="dropdown-management" aria-label="Dropdown Management">
    {error && <p className="admin-reset-error" role="alert">{error}</p>}
    <div className="dropdown-management-grid">
      <aside className="admin-table-wrap dropdown-list"><table className="admin-table"><thead><tr><th>Dropdown</th><th>Source</th></tr></thead><tbody>{definitions.map((definition) => <tr key={definition.id} className={definition.key === selectedKey ? "is-selected" : undefined}><td><button type="button" onClick={() => setSelectedKey(definition.key)}>{definition.label}</button></td><td>{definition.source_type}</td></tr>)}</tbody></table></aside>
      {selected && definitionDraft && <div className="dropdown-editor">
        <form className="admin-reset-form" onSubmit={(event) => void saveDefinition(event)}><h2>{selected.label}</h2><p>Key: <code>{selected.key}</code> · Source: <strong>{selected.source_type}</strong></p><label>Label<input required value={definitionDraft.label} onChange={(event) => setDefinitionDraft({ ...definitionDraft, label: event.target.value })} /></label><label>Default value<input value={definitionDraft.default_value || ""} onChange={(event) => setDefinitionDraft({ ...definitionDraft, default_value: event.target.value || null })} disabled={selected.source_type === "api_backed"} /></label><label className="admin-reset-show"><input type="checkbox" checked={definitionDraft.required} onChange={(event) => setDefinitionDraft({ ...definitionDraft, required: event.target.checked })} /> Required</label><label className="admin-reset-show"><input type="checkbox" checked={definitionDraft.is_visible} onChange={(event) => setDefinitionDraft({ ...definitionDraft, is_visible: event.target.checked })} /> Visible</label><label className="admin-reset-show"><input type="checkbox" checked={definitionDraft.is_active} onChange={(event) => setDefinitionDraft({ ...definitionDraft, is_active: event.target.checked })} /> Active</label><button type="submit">Save definition</button></form>
        <section className="admin-table-wrap"><div className="dropdown-options-heading"><h2>Options</h2>{!managed && <span className="admin-note">Read-only: {selected.source_type} values are controlled by the system/API.</span>}</div>{managed && <form className="dropdown-add-form" onSubmit={(event) => void addOption(event)}><input aria-label="New option label" placeholder="Label" value={newOption.label} onChange={(event) => setNewOption({ ...newOption, label: event.target.value })} /><input aria-label="New option value" placeholder="Value" value={newOption.value} onChange={(event) => setNewOption({ ...newOption, value: event.target.value })} /><button type="submit">Add option</button></form>}<table className="admin-table"><thead><tr><th>Label</th><th>Value</th><th>Order</th><th>Status</th><th>Actions</th></tr></thead><tbody>{options.map((option, index) => <tr key={option.id}><td>{editingOption === option.id ? <input aria-label={`Edit label ${option.value}`} value={editingLabel} onChange={(event) => setEditingLabel(event.target.value)} /> : option.label}</td><td><code>{option.value}</code></td><td>{editingOption === option.id ? <input type="number" value={editingSort} onChange={(event) => setEditingSort(Number(event.target.value))} /> : option.sort_order}</td><td>{option.is_active ? "Active" : "Inactive"}</td><td>{managed && <>{editingOption === option.id ? <><button type="button" onClick={() => void saveOption(option)}>Save</button><button type="button" onClick={() => setEditingOption(null)}>Cancel</button></> : <><button type="button" onClick={() => beginEdit(option)}>Edit</button><button type="button" onClick={() => void setActive(option, !option.is_active)}>{option.is_active ? "Deactivate" : "Activate"}</button><button type="button" onClick={() => void move(option, -1)} disabled={index === 0}>↑</button><button type="button" onClick={() => void move(option, 1)} disabled={index === options.length - 1}>↓</button></>}</>}</td></tr>)}</tbody></table></section>
      </div>}
    </div>
  </section>;
}
