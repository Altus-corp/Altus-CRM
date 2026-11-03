"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Notification = {
  id: string;
  notification_type?: string | null;
  title: string;
  body: string | null;
  href: string | null;
  metadata?: { count?: number } | null;
  created_at: string;
};
type AssignmentPopup = { ids: string[]; leadCount: number };
const isAssignmentPopupNotification = (notification: Notification) =>
  ["lead_assigned", "fresh_form_lead", "pre_paid_lead", "qualified_inbound_lead"].includes(notification.notification_type ?? "");
type SearchResult = {
  assignmentId: string;
  leadId: string;
  name: string;
  phone: string | null;
  email: string | null;
  product: string | null;
  stage: string | null;
};

export function LeadNavTools() {
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [assignmentPopupsEnabled, setAssignmentPopupsEnabled] = useState(true);
  const [assignmentPopup, setAssignmentPopup] = useState<AssignmentPopup | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadNotifications = async () => {
    const response = await fetch("/api/notifications", { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as {
      notifications?: Notification[];
      assignmentPopupsEnabled?: boolean;
    } | null;
    if (response.ok) {
      setNotifications(payload?.notifications ?? []);
      setAssignmentPopupsEnabled(payload?.assignmentPopupsEnabled ?? true);
    }
  };
  useEffect(() => {
    void loadNotifications();
    const interval = window.setInterval(() => void loadNotifications(), 10_000);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    if (!assignmentPopupsEnabled || assignmentPopup) return;
    const batch = notifications.filter(isAssignmentPopupNotification);
    if (!batch.length) return;
    setAssignmentPopup({
      ids: batch.map((notification) => notification.id),
      leadCount: batch.reduce((total, notification) => total + Math.max(1, Number(notification.metadata?.count) || 1), 0),
    });
  }, [notifications, assignmentPopup, assignmentPopupsEnabled]);
  useEffect(() => {
    if (searchOpen) window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [searchOpen]);
  useEffect(() => {
    const timer = window.setTimeout(async () => {
      if (query.trim().length < 2) {
        setResults([]);
        return;
      }
      const response = await fetch(
        `/api/leads/search?q=${encodeURIComponent(query)}`,
        { cache: "no-store" },
      );
      const payload = (await response.json().catch(() => null)) as {
        results?: SearchResult[];
      } | null;
      if (response.ok) setResults(payload?.results ?? []);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  const openNotifications = async () => {
    setNotificationsOpen((open) => !open);
    setSearchOpen(false);
    await loadNotifications();
  };
  const markRead = async () => {
    const ids = notifications.map((item) => item.id);
    setNotifications([]);
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationIds: ids }),
    });
  };
  const dismissAssignmentPopup = async (openLeadList: boolean, stopNotifying = false) => {
    const popup = assignmentPopup;
    if (!popup) return;
    setAssignmentPopup(null);
    if (stopNotifying) setAssignmentPopupsEnabled(false);
    setNotifications((current) =>
      current.filter((item) => !popup.ids.includes(item.id)),
    );
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationIds: popup.ids, disableAssignmentPopups: stopNotifying }),
    });
    if (openLeadList)
      router.push("/dashboard/leads?view=focused");
  };

  return (
    <>
      <div className="relative flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setSearchOpen((open) => !open);
            setNotificationsOpen(false);
          }}
          aria-label="Search my assigned leads"
          title="Search my assigned leads"
          className="grid h-9 w-9 place-items-center rounded-full text-[#182035] hover:bg-slate-100"
        >
          <Search className="h-4 w-4" />
        </button>
        {searchOpen && (
          <div className="absolute right-[124px] top-11 z-50 w-[min(390px,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
            <div className="flex items-center gap-2 border-b border-slate-100 px-2 pb-2">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search your assigned leads..."
                className="h-8 w-full text-sm font-medium outline-none"
              />
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              {query.trim().length < 2 ? (
                <p className="px-2 py-5 text-center text-xs text-slate-400">
                  Search by any lead detail, product, stage, or custom field.
                </p>
              ) : results.length ? (
                results.map((result) => (
                  <Link
                    key={result.assignmentId}
                    href="/dashboard/leads"
                    onClick={() => setSearchOpen(false)}
                    className="block rounded-lg px-2 py-2 hover:bg-red-50"
                  >
                    <p className="text-xs font-extrabold text-slate-800">
                      {result.name}{" "}
                      {result.product && (
                        <span className="ml-1 text-red-600">
                          · {result.product}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] text-slate-500">
                      {[result.phone, result.email, result.stage]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </Link>
                ))
              ) : (
                <p className="px-2 py-5 text-center text-xs text-slate-400">
                  No assigned leads found.
                </p>
              )}
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={openNotifications}
          aria-label="Notifications"
          title="Notifications"
          className="relative grid h-9 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-[#182035]"
        >
          <Bell className="h-4 w-4" />{" "}
          <span className="absolute -right-1 -top-2 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#d90000] px-1 text-[9px] font-bold text-white">
            {notifications.length}
          </span>
        </button>
        {notificationsOpen && (
          <div className="absolute right-0 top-11 z-50 w-80 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-2 pb-2">
              <p className="text-xs font-extrabold text-slate-800">
                Notifications
              </p>
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={markRead}
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600"
                >
                  <CheckCheck className="h-3.5 w-3.5" /> Mark read
                </button>
              )}
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              {notifications.length ? (
                notifications.map((notification) => (
                  <Link
                    key={notification.id}
                    href={notification.href ?? "/dashboard"}
                    onClick={() => {
                      setNotificationsOpen(false);
                      void markRead();
                    }}
                    className="block rounded-lg px-2 py-2 hover:bg-red-50"
                  >
                    <p className="text-xs font-extrabold text-slate-800">
                      {notification.title}
                    </p>
                    {notification.body && (
                      <p className="mt-0.5 text-[10px] text-slate-500">
                        {notification.body}
                      </p>
                    )}
                  </Link>
                ))
              ) : (
                <p className="px-2 py-5 text-center text-xs text-slate-400">
                  You are all caught up.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
      {assignmentPopup && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/40 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="New lead assignments"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
          >
            <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-red-600">
              New lead assignment
            </p>
            <h2 className="mt-2 text-xl font-extrabold text-slate-900">
              {assignmentPopup.leadCount} new lead{assignmentPopup.leadCount === 1 ? "" : "s"} assigned
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Your new leads are ready in Focused Leads. Please work on them as soon as possible.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => void dismissAssignmentPopup(false, true)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600"
              >
                Stop notifying
              </button>
              <button
                type="button"
                onClick={() => void dismissAssignmentPopup(true)}
                className="rounded-lg bg-[#df0000] px-4 py-2 text-sm font-bold text-white"
              >
                Accepted
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
