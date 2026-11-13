"use client";
// Moldura do painel da administração: menu lateral em grupos, topo com caminho, período, pendências e o administrador.
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  AlertTriangle, ArrowLeft, BadgeCheck, BarChart3, Bell, BookOpen, Calculator, Calendar, ChevronRight, Hourglass, LayoutDashboard,
  LogOut, Menu, Newspaper, Plane, RotateCcw, ScrollText, Settings, Shield, Ticket, TicketPercent, TrendingUp, UserX, Users, X,
} from "lucide-react";
import { api } from "@/lib/api";
import { BrandMark } from "@/components/brand";

type Item = { label: string; href: string; icon: React.ComponentType<{ className?: string }> };
export const ADMIN_NAV: { group: string; items: Item[] }[] = [
  { group: "", items: [{ label: "Visão geral", href: "/admin", icon: LayoutDashboard }] },
  { group: "Operação", items: [
    { label: "Usuários", href: "/admin/users", icon: Users },
    { label: "Assinaturas", href: "/admin/subscriptions", icon: BadgeCheck },
  ] },
  { group: "Comercial", items: [
    { label: "Conversão", href: "/admin/conversion", icon: TrendingUp },
    { label: "Recuperação", href: "/admin/recovery", icon: RotateCcw },
    { label: "Cupons", href: "/admin/coupons", icon: TicketPercent },
    { label: "Convites", href: "/admin/invites", icon: Ticket },
  ] },
  { group: "Conteúdo", items: [
    { label: "Programas", href: "/admin/programs", icon: Plane },
    { label: "Calculadoras", href: "/admin/calculators", icon: Calculator },
    { label: "Guias", href: "/admin/guides", icon: BookOpen },
    { label: "Novidades", href: "/admin/news", icon: Newspaper },
  ] },
  { group: "Gestão", items: [
    { label: "Relatórios", href: "/admin/reports", icon: BarChart3 },
    { label: "Solicitações LGPD", href: "/admin/privacy", icon: Shield },
    { label: "Auditoria", href: "/admin/audit", icon: ScrollText },
    { label: "Parâmetros", href: "/admin/settings", icon: Settings },
  ] },
];

// Páginas que leem o período (?p=) mostram o seletor no topo
const PERIOD_PAGES = ["/admin", "/admin/conversion", "/admin/reports", "/admin/subscriptions"];
const PERIODS = [["7d", "Últimos 7 dias"], ["30d", "Últimos 30 dias"], ["90d", "Últimos 90 dias"], ["12m", "Últimos 12 meses"]] as const;
const PEND_ICONS: Record<string, Item["icon"]> = { "badge-check": BadgeCheck, "alert-triangle": AlertTriangle, "user-x": UserX, hourglass: Hourglass, "rotate-ccw": RotateCcw, shield: Shield };

const activeHref = (path: string) => {
  if (path === "/admin") return "/admin";
  let best = "";
  for (const g of ADMIN_NAV) for (const i of g.items) if (i.href !== "/admin" && path.startsWith(i.href) && i.href.length > best.length) best = i.href;
  return best || "/admin";
};

export function AdminShell({ admin, pending, children }: {
  admin: { name: string; email: string };
  pending: { items: { label: string; href: string; icon: string; n: number }[]; total: number; nav: Record<string, number> };
  children: React.ReactNode;
}) {
  const path = usePathname();
  const sp = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [bell, setBell] = useState(false);
  const active = activeHref(path);
  const section = ADMIN_NAV.flatMap((g) => g.items).find((i) => i.href === active);
  const initials = admin.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "A";

  // Diálogos e avisos abrem fora desta moldura (no body): o tema do admin vai para o <html> enquanto o painel está aberto
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.dataset.theme;
    html.dataset.theme = "admin";
    return () => { if (prev) html.dataset.theme = prev; };
  }, []);
  useEffect(() => { setOpen(false); setBell(false); }, [path]);

  function setPeriod(p: string) {
    const q = new URLSearchParams(sp.toString());
    q.set("p", p);
    router.push(`${path}?${q}`);
  }
  async function logout() {
    await api("/api/auth/logout", "POST");
    window.location.assign("/login");
  }

  const crumbs: { label: string; href?: string }[] = [{ label: "Administração", href: "/admin" }];
  if (section && section.href !== "/admin") crumbs.push({ label: section.label, href: path === section.href ? undefined : section.href });
  else if (path === "/admin") crumbs.push({ label: "Visão geral" });
  if (section && path !== section.href) crumbs.push({ label: path.startsWith("/admin/users/") ? "Ficha do usuário" : "Detalhe" });

  return (
    <div className="min-h-screen">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-line bg-side transition-transform lg:translate-x-0 ${open ? "translate-x-0 shadow-2xl" : "-translate-x-full"}`} aria-label="Menu da administração">
        <div className="flex items-end gap-2 border-b border-line px-5 pb-4 pt-5">
          <Link href="/admin" className="flex items-end gap-2"><BrandMark name="MilhasX" size={26} /><span className="pb-0.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[rgb(var(--gold))]">Admin</span></Link>
          <button className="btn-icon ml-auto h-8 w-8 lg:hidden" onClick={() => setOpen(false)} aria-label="Fechar menu"><X className="h-4 w-4" /></button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-2.5">
          {ADMIN_NAV.map((g) => (
            <div key={g.group || "home"}>
              {g.group && <p className="mx-2.5 mb-1.5 mt-4 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500">{g.group}</p>}
              {g.items.map((i) => {
                const on = i.href === active;
                const n = pending.nav[i.href];
                return (
                  <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined}
                    className={`my-px flex items-center gap-2.5 rounded-[10px] px-2.5 py-[9px] text-sm transition-colors ${on ? "bg-[rgb(var(--brand)/0.05)] font-semibold text-[rgb(var(--brand))] shadow-[inset_3px_0_0_rgb(var(--gold))]" : "font-medium text-zinc-200 hover:bg-panel2"}`}>
                    <i.icon className={`h-[18px] w-[18px] shrink-0 ${on ? "text-[rgb(var(--gold))]" : ""}`} />
                    <span>{i.label}</span>
                    {!!n && <em className="ml-auto rounded-full bg-[rgb(var(--gold))] px-[7px] py-px text-[11px] font-bold not-italic text-[rgb(var(--brand))]">{n}</em>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="border-t border-line px-4 py-3">
          <Link href="/app" className="mb-2 flex items-center gap-2 rounded-[10px] px-2 py-1.5 text-xs font-medium text-muted hover:bg-panel2 hover:text-zinc-100"><ArrowLeft className="h-3.5 w-3.5" />Voltar ao app</Link>
          <div className="flex items-center gap-2.5">
            <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-[rgb(var(--brand))] text-[13px] font-extrabold text-[rgb(var(--gold))]">{initials}</span>
            <div className="min-w-0"><b className="block truncate text-[13px]">{admin.name}</b><small className="text-xs text-muted">Administrador</small></div>
            <button onClick={logout} title="Sair" aria-label="Sair" className="ml-auto grid h-[34px] w-[34px] place-items-center rounded-[9px] text-muted hover:bg-panel2 hover:text-red-400"><LogOut className="h-[18px] w-[18px]" /></button>
          </div>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-[rgb(15_27_45/0.35)] lg:hidden" onClick={() => setOpen(false)} />}

      <div className="lg:ml-[248px]">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3.5 border-b border-line bg-bg/90 px-4 backdrop-blur-md sm:px-7">
          <button className="grid h-10 w-10 place-items-center rounded-[10px] border border-line bg-panel lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menu"><Menu className="h-[18px] w-[18px]" /></button>
          <nav className="hidden min-w-0 flex-wrap items-center gap-1.5 text-sm text-muted sm:flex" aria-label="Caminho">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-zinc-600" />}
                {c.href && i < crumbs.length - 1 ? <Link href={c.href} className="hover:text-zinc-50">{c.label}</Link> : <span className="font-semibold text-zinc-50">{c.label}</span>}
              </span>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2.5">
            {PERIOD_PAGES.includes(path) && (
              <label className="flex h-10 items-center gap-1.5 rounded-[10px] border border-line bg-panel pl-2.5 pr-1 text-muted">
                <Calendar className="h-4 w-4" />
                <select className="max-w-[140px] cursor-pointer bg-transparent py-2 pr-1 text-[13px] font-semibold text-zinc-50 outline-none" value={sp.get("p") ?? "30d"} onChange={(e) => setPeriod(e.target.value)} aria-label="Período de análise">
                  {PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </label>
            )}
            <div className="relative">
              <button onClick={() => setBell((b) => !b)} aria-expanded={bell} aria-label={`Pendências: ${pending.total}`} className="relative grid h-10 w-10 place-items-center rounded-[10px] border border-line bg-panel text-zinc-200">
                <Bell className="h-[18px] w-[18px]" />
                {pending.total > 0 && <em className="absolute -right-1.5 -top-1.5 rounded-full border-2 border-bg bg-red-600 px-1.5 text-[11px] font-bold not-italic text-white">{pending.total}</em>}
              </button>
              {bell && (
                <div className="absolute right-0 top-12 z-50 w-[300px] rounded-[14px] border border-line bg-panel p-2 shadow-[0_12px_32px_rgb(15_27_45/0.12)]">
                  <p className="mx-2 mb-2 mt-1.5 text-xs font-bold uppercase tracking-[0.06em] text-muted">Pendências</p>
                  {pending.items.filter((i) => i.n).map((i) => {
                    const Icon = PEND_ICONS[i.icon] ?? Bell;
                    return (
                      <Link key={i.href} href={i.href} className="flex items-center gap-2.5 rounded-[10px] p-2.5 text-sm hover:bg-panel2">
                        <Icon className="h-4 w-4 text-[rgb(var(--brand))]" /><span>{i.label}</span>
                        <b className="ml-auto rounded-full bg-[rgb(var(--brand)/0.07)] px-2 py-0.5 text-xs">{i.n}</b>
                      </Link>
                    );
                  })}
                  {!pending.items.some((i) => i.n) && <p className="p-2 text-sm text-muted">Nenhuma pendência. Tudo em dia.</p>}
                </div>
              )}
            </div>
            <div className="hidden items-center gap-2.5 pl-1.5 md:flex">
              <span className="grid h-[34px] w-[34px] place-items-center rounded-full bg-[rgb(var(--brand))] text-[13px] font-extrabold text-[rgb(var(--gold))]">{initials}</span>
              <div><b className="block text-[13px]">{admin.name}</b><small className="text-xs text-muted">Administrador</small></div>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1280px] px-4 pb-12 pt-6 sm:px-7">{children}</main>
      </div>
    </div>
  );
}
