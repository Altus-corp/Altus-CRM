import { useQuotesInvoicingScreen } from "./function";
import { WorkspaceDataPage } from "../workspace-data/page";
export function QuotesInvoicingPage() { return <WorkspaceDataPage title={useQuotesInvoicingScreen()} view="sale_registration" note="Registration and sales records from the imported workspace." />; }
