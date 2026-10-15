import { createContext, useContext, useEffect, useRef, type Dispatch, type SetStateAction } from "react";

export type LeadNavbarActions = {
  openBulkUpload: () => void;
  openNewLead: () => void;
};

export const LeadNavbarActionsContext = createContext<Dispatch<SetStateAction<LeadNavbarActions | null>> | null>(null);

export function useRegisterLeadNavbarActions(actions: LeadNavbarActions) {
  const setActions = useContext(LeadNavbarActionsContext);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  useEffect(() => {
    if (!setActions) return;
    const registered = { openBulkUpload: () => actionsRef.current.openBulkUpload(), openNewLead: () => actionsRef.current.openNewLead() };
    setActions(registered);
    return () => setActions((current) => current === registered ? null : current);
  }, [setActions]);
}
