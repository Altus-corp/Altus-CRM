import type { SelectHTMLAttributes } from "react";
import { useDropdown, type DropdownOption } from "./client";

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "children"> & {
  dropdownKey: string;
  options?: DropdownOption[];
  includeEmpty?: boolean;
  emptyLabel?: string;
  onValueChange: (value: string) => void;
};

const leadTypeLabels: Record<string, string> = { DL: "Direct Lead", L: "Lead", QDL: "Qualified Direct Lead", QL: "Qualified Lead", R: "Referral" };
function optionLabel(dropdownKey: string, option: DropdownOption) { return dropdownKey === "lead_type" ? leadTypeLabels[option.value] || option.label : option.label; }

export function DropdownSelect({ dropdownKey, options: suppliedOptions, includeEmpty = false, emptyLabel = "Select", value, onValueChange, disabled, ...props }: Props) {
  const dropdown = useDropdown(dropdownKey);
  const options = [...(suppliedOptions || dropdown.options)].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
  const current = value === undefined ? dropdown.defaultValue : value == null ? "" : String(value);
  const currentOption = options.find((option) => option.value === current);
  const visibleOptions = options.filter((option) => option.is_active || option.value === current);
  const hasOptions = visibleOptions.length > 0;
  const blocked = (!hasOptions && dropdown.loading) || (!hasOptions && Boolean(dropdown.error));
  return <>
    {!hasOptions && dropdown.loading && <span className="dropdown-status" role="status">Loading {dropdown.definition?.label || "options"}…</span>}
    {!hasOptions && dropdown.error && <span className="dropdown-status" role="alert">Unable to load {dropdown.definition?.label || "options"}.</span>}
    <select {...props} required={props.required ?? dropdown.definition?.required} data-dropdown-default={dropdown.defaultValue || undefined} aria-busy={dropdown.loading || undefined} disabled={disabled || blocked} value={current} onChange={(event) => onValueChange(event.target.value)}>
    {includeEmpty && <option value="">{emptyLabel}</option>}
    {!dropdown.loading && !visibleOptions.length && !includeEmpty && <option value="">No options available</option>}
    {visibleOptions.map((option) => <option key={option.id} value={option.value} disabled={!option.is_active}>{optionLabel(dropdownKey, option)}{!option.is_active && option.value === current ? " (inactive)" : ""}</option>)}
    {currentOption && !currentOption.is_active && !visibleOptions.some((option) => option.id === currentOption.id) && <option value={currentOption.value} disabled>{optionLabel(dropdownKey, currentOption)} (inactive)</option>}
    </select>
  </>;
}
