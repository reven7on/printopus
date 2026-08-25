import { requireAdminPage } from "../../../lib/admin-auth";
import AdminApp from "./admin-app";

export default async function AdminPage() {
  const admin = await requireAdminPage();
  return <AdminApp username={admin.username} />;
}
