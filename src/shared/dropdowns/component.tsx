import type { SelectHTMLAttributes } from "react";
import { useDropdown, type DropdownOption } from "./client";

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "children"> & {
  dropdownKey: string;
  options?: DropdownOption[];
  includeEmpty?: boolean;
  emptyLabel?: string;
  onValueChange: (value: string) => void;
};

export function DropdownSelect({ dropdownKey, options: suppliedOptions, includeEmpty = false, emptyLabel = "Select", value, onValueChange, disabled, ...props }: Props) {
  const dropdown = useDropdown(dropdownKey);
  const options = [...(suppliedOptions || dropdown.options)].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
  const current = value == null ? "" : String(value);
  const currentOption = options.find((option) => option.value === current);
  const visibleOptions = options.filter((option) => option.is_active || option.value === current);
  return <select {...props} disabled={disabled || dropdown.loading} value={current} onChange={(event) => onValueChange(event.target.value)}>
    {includeEmpty && <option value="">{emptyLabel}</option>}
    {!dropdown.loading && !visibleOptions.length && !includeEmpty && <option value="">{dropdown.error || "No options available"}</option>}
    {visibleOptions.map((option) => <option key={option.id} value={option.value} disabled={!option.is_active}>{option.label}{!option.is_active && option.value === current ? " (inactive)" : ""}</option>)}
    {currentOption && !currentOption.is_active && !visibleOptions.some((option) => option.id === currentOption.id) && <option value={currentOption.value} disabled>{currentOption.label} (inactive)</option>}
  </select>;
}
