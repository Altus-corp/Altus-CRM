import { useAccountsContactsScreen } from "./function";
import { WorkspaceDataPage } from "../workspace-data/page";
export function AccountsContactsPage() { return <WorkspaceDataPage title={useAccountsContactsScreen()} note="Accounts and contacts from the imported lead dataset." />; }
