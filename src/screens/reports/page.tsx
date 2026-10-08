import { useReportsScreen } from "./function";
import { WorkspaceDataPage } from "../workspace-data/page";
export function ReportsPage() { return <WorkspaceDataPage title={useReportsScreen()} note="Pipeline report from the imported lead dataset." />; }
