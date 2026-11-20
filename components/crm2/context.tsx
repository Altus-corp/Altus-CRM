"use client";
import { createContext, useContext } from "react";
import type { AppRole } from "@/app/lib/roles";
import type { LeadRow, Workspace } from "@/app/lib/crm2/types";

export type Route = { module: string; page: string; dash?: string };
export type Ctx = {
  ws: Workspace;
  role: AppRole;
  canEdit: boolean;
  product: string; setProduct: (p: string) => void;
  period: string; setPeriod: (p: string) => void;
  route: Route; go: (r: Partial<Route> & { module: string }) => void;
  openLead: (row: LeadRow, list?: LeadRow[]) => void;
  patchRows: (ids: string[], patch: Partial<LeadRow>) => void;
  refresh: () => Promise<void>;
};
export const CrmCtx = createContext<Ctx | null>(null);
export const useCrm = () => { const c = useContext(CrmCtx); if (!c) throw new Error("CrmCtx missing"); return c; };
