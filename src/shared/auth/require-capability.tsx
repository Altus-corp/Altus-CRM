import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { usePermission, type Capability } from "./permissions";

export function RequireCapability({ capability, children }: { capability: Capability; children: ReactNode }) {
  return usePermission(capability) ? <>{children}</> : <Navigate to="/leads" replace />;
}
