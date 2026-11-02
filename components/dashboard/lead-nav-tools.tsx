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
  created_at: string;
};
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
  const [freshLeadNotification, setFreshLeadNotification] =
    useState<Notification | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadNotifications = async () => {
    const response = await fetch("/api/notifications", { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as {
      notifications?: Notification[];
    } | null;
    if (response.ok) setNotifications(payload?.notifications ?? []);
  };
  useEffect(() => {
    void loadNotifications();
    const interval = window.setInterval(() => void loadNotifications(), 10_000);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    const fresh = notifications.find(
      (notification) =>
        notification.notification_type === "fresh_form_lead" ||
        notification.notification_type === "pre_paid_lead" ||
        notification.notification_type === "qualified_inbound_lead",
    );
    if (fresh && fresh.id !== freshLeadNotification?.id)
      setFreshLeadNotification(fresh);
  }, [notifications, freshLeadNotification?.id]);
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
  const dismissFreshLead = async (openLeadList: boolean) => {
    const notification = freshLeadNotification;
    if (!notification) return;
    setFreshLeadNotification(null);
    setNotifications((current) =>
      current.filter((item) => item.id !== notification.id),
    );
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationIds: [notification.id] }),
    });
    if (openLeadList)
      router.push(notification.href ?? "/dashboard/leads?view=focused");
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
      {freshLeadNotification && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/40 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="New inbound lead"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
          >
            <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-red-600">
              New inbound lead
            </p>
            <h2 className="mt-2 text-xl font-extrabold text-slate-900">
              {freshLeadNotification.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {freshLeadNotification.body ??
                "A newly registered lead has been added to your focused list."}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => void dismissFreshLead(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600"
              >
                Stop notifying
              </button>
              <button
                type="button"
                onClick={() => void dismissFreshLead(true)}
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
