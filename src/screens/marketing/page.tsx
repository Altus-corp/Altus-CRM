import { useMarketingScreen } from "./function";
import { WorkspaceDataPage } from "../workspace-data/page";
export function MarketingPage() { return <WorkspaceDataPage title={useMarketingScreen()} view="new_leads" note="Marketing leads from the imported workspace." />; }
