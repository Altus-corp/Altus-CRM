import { useTasksActivityScreen } from "./function";
import { WorkspaceDataPage } from "../workspace-data/page";
export function TasksActivityPage() { return <WorkspaceDataPage title={useTasksActivityScreen()} note="Lead activity and follow-up work from the imported workspace." />; }
