import { requirePageAdmin } from "@/server/session";
import { adminPending } from "@/server/services/admin-pending";
import { AdminShell } from "./shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requirePageAdmin();
  const pending = await adminPending();
  return (
    <div data-theme="admin" className="adm-root min-h-screen bg-bg text-white">
      <AdminShell admin={{ name: admin.name, email: admin.email }} pending={pending}>{children}</AdminShell>
    </div>
  );
}
