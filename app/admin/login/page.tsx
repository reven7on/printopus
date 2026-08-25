import { redirect } from "next/navigation";
import { getAdminIdentity } from "../../../lib/admin-auth";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  if (await getAdminIdentity()) redirect("/admin");
  return <LoginForm />;
}
