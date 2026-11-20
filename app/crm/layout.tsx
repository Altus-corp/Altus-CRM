import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./crm.css";

// Altus CRM v2 lives under /crm. The classic CRM under /dashboard is untouched, so both run side by side.
export const metadata: Metadata = { title: "Altus CRM", manifest: "/crm.webmanifest", appleWebApp: { capable: true, title: "Altus CRM", statusBarStyle: "default" } };
export const viewport: Viewport = { themeColor: "#C8102E", width: "device-width", initialScale: 1, maximumScale: 1 };

export const instant = false;

export default function CrmLayout({ children }: { children: ReactNode }) {
  return children;
}
