import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { requirePageAdmin, appName } from "@/server/session";
import { AdminNav } from "./nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requirePageAdmin();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-3 py-3 sm:px-5">
          <span className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-5 w-5 text-amber-300" />{appName()} <span className="text-muted">· Administração</span></span>
          <span className="ml-auto hidden text-sm text-muted sm:inline">{admin.email}</span>
          <Link href="/app" className="btn-ghost h-8"><ArrowLeft className="h-4 w-4" />Voltar ao app</Link>
        </div>
        <AdminNav />
      </header>
      <main className="mx-auto max-w-6xl px-3 py-6 sm:px-5">{children}</main>
    </div>
  );
}
