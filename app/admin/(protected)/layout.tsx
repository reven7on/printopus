import { requireAdminPage } from "../../../lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function ProtectedAdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireAdminPage();
  return children;
}
