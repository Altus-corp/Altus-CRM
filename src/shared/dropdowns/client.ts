import { useEffect, useState } from "react";
import { api } from "../api/client";

export type DropdownOption = {
  id: string;
  dropdown_id: string;
  label: string;
  value: string;
  semantic_key: string | null;
  sort_order: number;
  is_active: boolean;
};

export type DropdownDefinition = {
  id: string;
  key: string;
  label: string;
  source_type: "managed" | "system_locked" | "api_backed";
  required: boolean;
  default_value: string | null;
  is_visible: boolean;
  is_active: boolean;
  sort_order: number;
  options: DropdownOption[];
};

const cache = new Map<string, DropdownDefinition>();
let request: Promise<DropdownDefinition[]> | null = null;

export function clearDropdownCache() {
  cache.clear();
  request = null;
}

export function primeDropdownCache(definitions: DropdownDefinition[]) {
  definitions.forEach((dropdown) => cache.set(dropdown.key, { ...dropdown, options: [...dropdown.options].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id)) }));
}

async function loadAll() {
  if (!request) {
    request = api<{ dropdowns: DropdownDefinition[] }>("/api/dropdowns").then(({ dropdowns }) => {
      const sorted = dropdowns.map((dropdown) => ({ ...dropdown, options: [...dropdown.options].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id)) })).sort((a, b) => a.sort_order - b.sort_order || a.key.localeCompare(b.key));
      sorted.forEach((dropdown) => cache.set(dropdown.key, dropdown));
      return sorted;
    }).catch((error) => { request = null; throw error; });
  }
  return request;
}

export function dropdownDefault(key: string) {
  return cache.get(key)?.default_value ?? "";
}

export function useDropdown(key: string) {
  const [state, setState] = useState<{ definition: DropdownDefinition | null; loading: boolean; error: string }>({ definition: cache.get(key) || null, loading: !cache.has(key), error: "" });
  useEffect(() => {
    let mounted = true;
    if (cache.has(key)) { setState({ definition: cache.get(key) || null, loading: false, error: "" }); return () => { mounted = false; }; }
    setState((current) => ({ ...current, loading: true, error: "" }));
    void loadAll().then(() => { if (mounted) setState({ definition: cache.get(key) || null, loading: false, error: "" }); }).catch((cause) => { if (mounted) setState({ definition: null, loading: false, error: cause instanceof Error ? cause.message : "Unable to load dropdown." }); });
    return () => { mounted = false; };
  }, [key]);
  return { ...state, options: state.definition?.options || [], defaultValue: state.definition?.default_value || "" };
}
