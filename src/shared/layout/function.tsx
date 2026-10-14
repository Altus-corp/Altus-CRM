import { useEffect, useState } from "react";
import { api } from "../api/client";
import { usePermission } from "../auth/permissions";

const NAV_GROUP_STORAGE_KEY = "altus-crm-nav-groups";

function readNavGroups(): Record<string, boolean> {
  try {
    const stored = window.localStorage.getItem(NAV_GROUP_STORAGE_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function useNavGroupState() {
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => readNavGroups());
  useEffect(() => {
    try {
      window.localStorage.setItem(NAV_GROUP_STORAGE_KEY, JSON.stringify(collapsedGroups));
    } catch {
      // Local storage is optional.
    }
  }, [collapsedGroups]);
  return {
    collapsedGroups,
    toggleNavGroup: (label: string) => setCollapsedGroups((current) => ({ ...current, [label]: !current[label] })),
  };
}

export function useLeadNavCounts(enabled = true) {
  const canView = usePermission("leads.view");
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!enabled || !canView) {
      setCounts({});
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    void api<Record<string, number>>("/api/leads/counts")
      .then((next) => { if (live) setCounts(Object.fromEntries(Object.entries(next).filter(([, value]) => Number.isFinite(value)).map(([key, value]) => [key, Number(value)]))); })
      .catch(() => { if (live) setCounts({}); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [canView, enabled]);
  return { counts, loading };
}
