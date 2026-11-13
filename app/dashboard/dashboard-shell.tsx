"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { isAmbassadorWorkspace, type AppRole } from "@/app/lib/roles";
import type { DashboardNavItem } from "@/app/lib/navigation";
import { signOut } from "./actions";
import { TodaysCallTarget } from "@/components/dashboard/todays-call-target";
import { WmsProfileAvatar } from "@/components/dashboard/wms-profile-avatar";
import { LeadNavTools } from "@/components/dashboard/lead-nav-tools";

type DashboardShellProps = {
  children: ReactNode;
  navigation: DashboardNavItem[];
  roles: AppRole[];
  displayName: string;
  email: string;
  roleLabel: string;
  ambassadorOwnerLabel?: string;
  ambassadorOwnerPhone?: string;
  todayAssignedLeads: number;
  products: { id: string; code: string; name: string }[];
};

function NavigationIcon({ label }: { label: string }) {
  const iconClass = "h-5 w-5 stroke-[2]";

  if (label.includes("Template")) {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={iconClass}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" /><path d="M8 8h8M8 12h5" /></svg>;
  }
  if (label.includes("DND")) {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={iconClass}><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></svg>;
  }
  if (label.includes("Lead") || label.includes("Client") || label === "Users" || label === "Team" || label === "My Team" || label === "My Ambassador" || label === "Ambassador") {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={iconClass}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
  }
  if (label.includes("Task") || label.includes("Roles")) {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={iconClass}><path d="m9 11 3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>;
  }
  if (label.includes("Report")) {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={iconClass}><path d="M3 3v18h18" /><path d="m7 16 4-5 3 3 5-7" /></svg>;
  }
  if (label.includes("Campaign") || label.includes("Marketing")) {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={iconClass}><path d="m3 11 18-5v12L3 13v-2Z" /><path d="M11.6 15.4 10 21H6l1.4-7.1M21 10a3 3 0 0 1 0 4" /></svg>;
  }
  if (label.includes("Market")) {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={iconClass}><path d="M4 9h16l-1 11H5L4 9Z" /><path d="M8 9V7a4 4 0 0 1 8 0v2M3 9h18" /></svg>;
  }
  if (label.includes("Deal") || label.includes("Sales") || label.includes("Product")) {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={iconClass}><path d="M3 3v18h18" /><path d="M7 16V9m5 7V5m5 11v-4" /></svg>;
  }
  if (label.includes("Appointment")) {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={iconClass}><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M8 2v4m8-4v4M3 10h18" /></svg>;
  }
  if (label.includes("Setting")) {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={iconClass}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.55V20.3h-3v-.09A1.7 1.7 0 0 0 10.68 18.66a1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7.02 15 1.7 1.7 0 0 0 5.47 14H5.4v-3h.07A1.7 1.7 0 0 0 7.02 9.97a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.12-2.12.06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1.03-1.55V4.7h3v.06a1.7 1.7 0 0 0 1.03 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.12 2.12-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.55 1.03H21v3h-.06A1.7 1.7 0 0 0 19.4 15Z" /></svg>;
  }

  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={iconClass}><path d="M3 13a9 9 0 1 1 18 0" /><path d="M12 13 16 9M12 13l-3 5" /><circle cx="12" cy="13" r="1" /></svg>;
}

function ProductsNavigation({ products, pathname }: { products: DashboardShellProps["products"]; pathname: string }) {
  const onProductPage = pathname.startsWith("/dashboard/products");
  const [isOpen, setIsOpen] = useState<boolean | null>(null);
  const open = isOpen ?? onProductPage;

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen(!open)}
        aria-expanded={open}
        aria-controls="products-navigation"
        className={`flex min-h-9 w-full items-center gap-2.5 rounded-[12px] px-2.5 py-1 text-left text-[13px] font-bold leading-tight transition ${onProductPage ? "bg-gradient-to-r from-red-100 via-red-50 to-transparent text-[#172036]" : "text-[#182035] hover:bg-slate-50"}`}
      >
        <span className={onProductPage ? "text-[#d00000]" : "text-[#182035]"}><NavigationIcon label="Products" /></span>
        Products
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className={`ml-auto h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}><path d="m5 7.5 5 5 5-5" /></svg>
      </button>
      {open && (
        <div id="products-navigation" className="ml-3 mt-1.5 border-l-2 border-red-200 pl-3">
          {products.length ? products.map((product) => {
            const href = `/dashboard/products/${product.code.toLowerCase()}`;
            return <Link key={product.id} href={href} title={product.name} className={`block py-0.5 text-[11px] font-semibold ${pathname === href ? "text-red-600" : "text-slate-500 hover:text-red-600"}`}>{product.code}</Link>;
          }) : <p className="py-0.5 text-[10px] font-semibold text-slate-400">No products yet</p>}
        </div>
      )}
    </div>
  );
}

function LeadsNavigation({ item, pathname, activeHref, isAdmin, isSalesManager }: { item: DashboardNavItem; pathname: string; activeHref: string; isAdmin: boolean; isSalesManager: boolean }) {
  const children = item.children?.filter((child) => {
    if (child.href === "/dashboard/leads?team=1") return isAdmin;
    if (child.href === "/dashboard/team-leads") return isSalesManager;
    return true;
  }) ?? [];
  const [isOpen, setIsOpen] = useState<boolean | null>(null);
  if (!children.length) {
    const isActive = pathname === item.href;
    return <Link href={item.href} className={`flex min-h-9 items-center gap-2.5 rounded-[12px] px-2.5 py-1 text-[13px] font-bold leading-tight transition ${isActive ? "bg-gradient-to-r from-red-100 via-red-50 to-transparent text-[#172036]" : "text-[#182035] hover:bg-slate-50"}`}><span className={isActive ? "text-[#d00000]" : "text-[#182035]"}><NavigationIcon label="Leads" /></span>{item.label}</Link>;
  }

  const isCurrentSection = pathname === item.href;
  const open = isOpen ?? isCurrentSection;
  return <div>
    <div className={`flex min-h-9 items-center rounded-[12px] transition ${isCurrentSection ? "bg-gradient-to-r from-red-100 via-red-50 to-transparent text-[#172036]" : "text-[#182035] hover:bg-slate-50"}`}>
      <Link href={item.href} className="flex min-h-9 min-w-0 flex-1 items-center gap-2.5 px-2.5 py-1 text-[13px] font-bold leading-tight"><span className={isCurrentSection ? "text-[#d00000]" : "text-[#182035]"}><NavigationIcon label="Leads" /></span>{item.label}</Link>
      <button type="button" onClick={() => setIsOpen(!open)} aria-expanded={open} aria-controls="leads-navigation" aria-label={`${open ? "Collapse" : "Expand"} Leads menu`} className="mr-1 grid h-7 w-7 place-items-center rounded text-slate-500 hover:bg-white/70"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}><path d="m5 7.5 5 5 5-5" /></svg></button>
    </div>
    {open && <div id="leads-navigation" className="ml-3 mt-1.5 border-l-2 border-red-200 pl-3">{children.map((child) => <Link key={child.href} href={child.href} className={`block py-0.5 text-[11px] font-semibold ${activeHref === child.href ? "text-red-600" : "text-slate-500 hover:text-red-600"}`}>{child.label}</Link>)}</div>}
  </div>;
}

function DoNotCallNavigation({ item, pathname, activeHref, isAdmin, isSalesManager }: { item: DashboardNavItem; pathname: string; activeHref: string; isAdmin: boolean; isSalesManager: boolean }) {
  const children = item.children?.filter((child) => {
    if (child.href === "/dashboard/dnd-master?type=abandoned") return isAdmin;
    if (child.href === "/dashboard/team-dnd-master") return isSalesManager;
    return true;
  }) ?? [];
  const [isOpen, setIsOpen] = useState<boolean | null>(null);
  if (!children.length) {
    const isActive = pathname === item.href;
    return <Link href={item.href} className={`flex min-h-9 items-center gap-2.5 rounded-[12px] px-2.5 py-1 text-[13px] font-bold leading-tight transition ${isActive ? "bg-gradient-to-r from-red-100 via-red-50 to-transparent text-[#172036]" : "text-[#182035] hover:bg-slate-50"}`}>
      <span className={isActive ? "text-[#d00000]" : "text-[#182035]"}><NavigationIcon label="DND" /></span>
      {item.label}
    </Link>;
  }

  const isCurrentSection = pathname === item.href || children.some((child) => child.href.split("?")[0] === pathname);
  const open = isOpen ?? Boolean(isCurrentSection);

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen(!open)}
        aria-expanded={open}
        aria-controls="do-not-call-navigation"
        className={`flex min-h-9 w-full items-center gap-2.5 rounded-[12px] px-2.5 py-1 text-left text-[13px] font-bold leading-tight transition ${isCurrentSection ? "bg-gradient-to-r from-red-100 via-red-50 to-transparent text-[#172036]" : "text-[#182035] hover:bg-slate-50"}`}
      >
        <span className={isCurrentSection ? "text-[#d00000]" : "text-[#182035]"}><NavigationIcon label="DND" /></span>
        {item.label}
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className={`ml-auto h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}><path d="m5 7.5 5 5 5-5" /></svg>
      </button>
      {open && (
        <div id="do-not-call-navigation" className="ml-3 mt-1.5 border-l-2 border-red-200 pl-3">
          {children.map((child) => (
            <Link key={child.href} href={child.href} className={`block py-0.5 text-[11px] font-semibold ${activeHref === child.href ? "text-red-600" : "text-slate-500 hover:text-red-600"}`}>
              {child.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function AmbassadorNavigation({ item, pathname, activeHref }: { item: DashboardNavItem; pathname: string; activeHref: string }) {
  const children = item.children ?? [];
  const [isOpen, setIsOpen] = useState<boolean | null>(null);
  if (!children.length) {
    const isActive = pathname === item.href;
    return <Link href={item.href} className={`flex min-h-9 items-center gap-2.5 rounded-[12px] px-2.5 py-1 text-[13px] font-bold leading-tight transition ${isActive ? "bg-gradient-to-r from-red-100 via-red-50 to-transparent text-[#172036]" : "text-[#182035] hover:bg-slate-50"}`}><span className={isActive ? "text-[#d00000]" : "text-[#182035]"}><NavigationIcon label="Ambassador" /></span>{item.label}</Link>;
  }

  const isCurrentSection = pathname === item.href || children.some((child) => child.href === pathname);
  const open = isOpen ?? isCurrentSection;
  return <div>
    <div className={`flex min-h-9 items-center rounded-[12px] transition ${isCurrentSection ? "bg-gradient-to-r from-red-100 via-red-50 to-transparent text-[#172036]" : "text-[#182035] hover:bg-slate-50"}`}>
      <Link href={item.href} className="flex min-h-9 min-w-0 flex-1 items-center gap-2.5 px-2.5 py-1 text-[13px] font-bold leading-tight"><span className={isCurrentSection ? "text-[#d00000]" : "text-[#182035]"}><NavigationIcon label="Ambassador" /></span>{item.label}</Link>
      <button type="button" onClick={() => setIsOpen(!open)} aria-expanded={open} aria-controls="ambassador-navigation" aria-label={`${open ? "Collapse" : "Expand"} Ambassador menu`} className="mr-1 grid h-7 w-7 place-items-center rounded text-slate-500 hover:bg-white/70"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}><path d="m5 7.5 5 5 5-5" /></svg></button>
    </div>
    {open && <div id="ambassador-navigation" className="ml-3 mt-1.5 border-l-2 border-red-200 pl-3">{children.map((child) => <Link key={child.href} href={child.href} className={`block py-0.5 text-[11px] font-semibold ${activeHref === child.href ? "text-red-600" : "text-slate-500 hover:text-red-600"}`}>{child.label}</Link>)}</div>}
  </div>;
}

export function DashboardShell({
  children,
  navigation,
  roles,
  displayName,
  email,
  roleLabel,
  ambassadorOwnerLabel,
  ambassadorOwnerPhone,
  todayAssignedLeads,
  products,
}: DashboardShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isConfigurationOpen, setIsConfigurationOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const isConfigurationPage = pathname === "/dashboard/lead-settings";
  const isAdmin = roles.includes("admin");
  const isSalesManager = roles.includes("sales_manager");
  const canUseTemplates = roles.some((role) => role === "admin" || role === "sales_executive" || role === "sales_manager");
  const ambassadorWhatsappNumber = ambassadorOwnerPhone?.replace(/\D/g, "");
  const ambassadorWhatsappHref = ambassadorWhatsappNumber
    ? `https://wa.me/${ambassadorWhatsappNumber.length === 10 ? `91${ambassadorWhatsappNumber}` : ambassadorWhatsappNumber}`
    : undefined;
  const configurationLinks = [
    { label: "Lead configuration", href: "/dashboard/lead-settings" },
    { label: "Columns management", href: "/dashboard/lead-settings?tab=columns" },
    { label: "Product management", href: "/dashboard/lead-settings?tab=products" },
    { label: "Dropdown management", href: "/dashboard/lead-settings?tab=stages" },
  ];

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-[#131c33]">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[196px] flex-col border-r border-slate-100 bg-white px-2.5 pb-2 pt-2 md:flex xl:w-[212px]">
        <div className="flex items-center gap-2">
          <button aria-label="Go back" className="grid h-9 w-9 place-items-center rounded-[13px] border border-slate-200 bg-[#fafafa] text-lg text-slate-500">‹</button>
          <button aria-label="Go forward" className="grid h-9 w-9 place-items-center rounded-[13px] border border-slate-200 bg-[#fafafa] text-lg text-slate-500">›</button>
          <span className="mx-1 h-5 w-px bg-slate-200" />
          <button aria-label="Toggle sidebar" className="ml-auto grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-sm text-slate-600">▣</button>
        </div>

        <Link href="/dashboard" className="mt-3 flex items-center gap-2.5 border-b border-slate-200 pb-3.5 px-1">
          <span className="grid h-10 w-10 place-items-center rounded-[15px] bg-[#d90000] text-xl font-bold text-white shadow-[0_8px_18px_rgba(217,0,0,0.16)]">A</span>
          <div>
            <p className="text-[18px] font-extrabold tracking-[-0.04em] text-[#c90000]">ALTUS</p>
            <p className="-mt-1 text-[10px] font-bold tracking-[0.17em] text-slate-500">CRM</p>
          </div>
        </Link>

        <nav className="mt-2.5 min-h-0 flex-1 space-y-0 overflow-y-auto overscroll-contain pr-1" aria-label="Dashboard navigation">
          {navigation.filter((item) => item.label !== "Lead configuration").map((item) => {
            if (item.href === "/dashboard/products") return <ProductsNavigation key={item.href} products={products} pathname={pathname} />;
            if (item.href === "/dashboard/leads" && (isAdmin || isSalesManager)) return <LeadsNavigation key={item.href} item={item} pathname={pathname} activeHref={pathname === "/dashboard/leads" ? `${pathname}${searchParams.get("team") === "1" ? "?team=1" : ""}` : pathname} isAdmin={isAdmin} isSalesManager={isSalesManager} />;
            if (item.href === "/dashboard/dnd-master") return <DoNotCallNavigation key={item.href} item={item} pathname={pathname} activeHref={pathname === "/dashboard/dnd-master" ? `${pathname}${searchParams.get("type") ? `?type=${searchParams.get("type")}` : ""}` : pathname} isAdmin={isAdmin} isSalesManager={isSalesManager} />;
            if ((item.href === "/dashboard/my-ambassador" && item.label === "Ambassador") || (item.href === "/dashboard/senior-ambassadors" && item.label === "My Ambassador")) return <AmbassadorNavigation key={item.href} item={item} pathname={pathname} activeHref={`${pathname}${searchParams.get("stage") ? `?stage=${searchParams.get("stage")}` : ""}`} />;

            const isActive = pathname === item.href;

            return (
              <div key={item.href}>
                <Link
                  href={item.href}
                  className={`flex min-h-9 items-center gap-2.5 rounded-[12px] px-2.5 py-1 text-[13px] font-bold leading-tight transition ${
                    isActive
                      ? "bg-gradient-to-r from-red-100 via-red-50 to-transparent text-[#172036]"
                      : "text-[#182035] hover:bg-slate-50"
                  }`}
                >
                  <span className={isActive ? "text-[#d00000]" : "text-[#182035]"}>
                    <NavigationIcon label={item.label} />
                  </span>
                  {item.label}
                </Link>

                {isAdmin && item.label === "Roles & permissions" && (
                  <div className="mt-0.5">
                    <button
                      type="button"
                      onClick={() => setIsConfigurationOpen((isOpen) => !isOpen)}
                      aria-expanded={isConfigurationOpen}
                      aria-controls="configuration-navigation"
                      className={`flex min-h-9 w-full items-center gap-2.5 rounded-[12px] px-2.5 py-1 text-left text-[13px] font-bold leading-tight transition [&>span:first-child]:h-5 [&>span:first-child]:w-5 [&>span:first-child]:rounded-none [&>span:first-child]:bg-transparent [&>span.ml-auto]:hidden ${
                        isConfigurationPage
                          ? "bg-gradient-to-r from-red-100 via-red-50 to-transparent text-[#172036] [&>span:first-child]:text-[#d00000]"
                          : "text-[#182035] hover:bg-slate-50 [&>span:first-child]:text-[#182035]"
                      }`}
                    >
                      <span className="grid h-6 w-6 place-items-center rounded-md bg-red-100 text-red-600">⚙</span>
                      Configuration
                      <span className="ml-auto text-xs">⌃</span>
                      <svg
                        viewBox="0 0 20 20"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden="true"
                        className={`ml-auto h-4 w-4 transition-transform ${isConfigurationOpen ? "rotate-180" : ""}`}
                      >
                        <path d="m5 7.5 5 5 5-5" />
                      </svg>
                    </button>
                    {isConfigurationOpen && (
                    <div id="configuration-navigation" className="ml-3 mt-1.5 border-l-2 border-red-200 pl-3">
                      {configurationLinks.map((link) => {
                          const active = pathname === "/dashboard/lead-settings" && (link.label === "Lead configuration" ? !searchParams.get("tab") : link.href.includes(`tab=${searchParams.get("tab")}`));
                        return <Link key={link.label} href={link.href} className={`block py-0.5 text-[10px] font-semibold ${active ? "text-red-600" : "text-slate-500 hover:text-red-600"}`}>{link.label}</Link>;
                      })}
                    </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="mt-2 shrink-0">
          {!isAdmin && !isAmbassadorWorkspace(roles) && roles.some((role) => role === "sales_executive" || role === "sales_manager" || role === "consultant") && <TodaysCallTarget assignedLeads={todayAssignedLeads} />}
          <form action={signOut}>
          <button className="flex w-full items-center gap-3 rounded-[16px] px-3 py-3 text-left text-sm font-bold text-slate-600 transition hover:bg-red-50 hover:text-red-700">
            <span className="text-lg">↪</span>
            Sign out
          </button>
          </form>
        </div>
      </aside>

      <div className="md:pl-[196px] xl:pl-[212px]">
        <header className="sticky top-0 z-10 flex h-[52px] items-center justify-between border-b border-slate-200 bg-white px-3 shadow-[0_3px_12px_rgba(28,39,64,0.08)] md:px-5">
          <Link href="/dashboard" className="font-extrabold text-[#cf0000] md:hidden">
            ALTUS CRM
          </Link>
          <p className="hidden text-[17px] font-extrabold tracking-[-0.035em] text-[#cf0000] md:block">
            CRM <span className="mx-1 text-slate-400">›</span> {pathname === "/dashboard/leads" && searchParams.get("team") === "1" ? "Team Leads" : pathname === "/dashboard/message-templates" ? "Templates" : navigation.find((item) => item.href === pathname)?.label ?? navigation.flatMap((item) => item.children ?? []).find((item) => item.href === pathname)?.label ?? "Workspace"}
          </p>
          <div className="flex items-center gap-2">
            {ambassadorWhatsappHref && <a href={ambassadorWhatsappHref} target="_blank" rel="noreferrer" aria-label="Message Sales Person on WhatsApp" title="Message Sales Person on WhatsApp" className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-600 transition hover:bg-emerald-100">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="h-4 w-4"><path d="M20.5 11.6A8.5 8.5 0 0 1 8 19.1L3.5 20.5 4.9 16A8.5 8.5 0 1 1 20.5 11.6Z" /><path d="M8.1 8.4c.2-.5.4-.5.7-.5h.5c.2 0 .4.1.5.4l.7 1.7c.1.3.1.5-.1.7l-.5.6c.7 1.4 1.6 2.3 3 3l.6-.5c.2-.2.5-.2.7-.1l1.7.7c.3.1.4.3.4.5v.5c0 .3 0 .5-.5.7-.6.2-1.6.1-3-.6-1.5-.7-3-2.1-4.2-4.2-.7-1.4-.8-2.4-.6-3Z" /></svg>
            </a>}
            {ambassadorOwnerLabel && <span title={`Sales Person: ${ambassadorOwnerLabel}`} className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700">
              <span className="shrink-0 font-medium">Sales Person:</span><span>{ambassadorOwnerLabel}</span>
            </span>}
            <LeadNavTools />
            <button aria-label="Add" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-[#fafafa] text-xl font-light text-[#182035]">+</button>
            <button aria-label="Expand" className="hidden h-9 w-9 place-items-center rounded-lg text-base text-slate-600 lg:grid">↗</button>
            <div className="relative">
              <WmsProfileAvatar initials={initialsFor(displayName)} expanded={isProfileMenuOpen} onClick={() => setIsProfileMenuOpen((value) => !value)} />
              {isProfileMenuOpen && <div role="dialog" aria-label="Account menu" className="absolute right-0 top-[46px] z-50 w-[280px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_18px_46px_rgba(25,38,61,0.22)]">
                <div className="flex items-center gap-3 px-1 py-2">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-50 text-xs font-extrabold text-red-700">{initialsFor(displayName)}</span>
                  <div className="min-w-0"><p className="truncate text-sm font-extrabold text-slate-900">{displayName}</p><p className="truncate text-xs font-medium text-slate-500">{email || "No email address"}</p><span className="mt-1 inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{roleLabel}</span></div>
                </div>
                <div className="my-2 border-t border-slate-200" />
                <Link href="/dashboard/settings" onClick={() => setIsProfileMenuOpen(false)} className="flex min-h-10 items-center gap-3 rounded-xl px-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 hover:text-red-700">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="h-4 w-4"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.55V20.3h-3v-.09A1.7 1.7 0 0 0 10.68 18.66a1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7.02 15 1.7 1.7 0 0 0 5.47 14H5.4v-3h.07A1.7 1.7 0 0 0 7.02 9.97a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.12-2.12.06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1.03-1.55V4.7h3v.06a1.7 1.7 0 0 0 1.03 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.12 2.12-.06.06A1.7 1.7 0 0 0 19.4 15Z" /></svg>
                  Settings
                  <span className="ml-auto text-lg font-medium text-slate-400">›</span>
                </Link>
                {canUseTemplates && <Link href="/dashboard/message-templates" onClick={() => setIsProfileMenuOpen(false)} className="flex min-h-10 items-center gap-3 rounded-xl px-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 hover:text-red-700">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="h-4 w-4"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" /><path d="M8 8h8M8 12h5" /></svg>
                  Templates
                  <span className="ml-auto text-lg font-medium text-slate-400">›</span>
                </Link>}
                <div className="my-2 border-t border-slate-200" />
                <form action={signOut}><button className="flex min-h-10 w-full items-center gap-3 rounded-xl px-2.5 text-left text-sm font-extrabold text-red-700 transition hover:bg-red-50"><span className="text-lg">↪</span>Sign out</button></form>
              </div>}
            </div>
          </div>
        </header>

        <main className="min-h-[calc(100vh-52px)] p-3 md:p-5">{children}</main>
      </div>
    </div>
  );
}

function initialsFor(name: string) {
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  return initials || "CR";
}
