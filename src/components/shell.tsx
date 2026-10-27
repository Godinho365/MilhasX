"use client";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { watchLinkClicks, refreshSafe } from "@/lib/nav";
import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard, LineChart, FileText, ShoppingBag, Tag, CreditCard, Calculator, ReceiptText, Contact, Bell, Settings,
  LogOut, PanelLeft, ChevronsUpDown, Layers, ShieldCheck, ChevronRight, Menu, X, GraduationCap, Megaphone, LifeBuoy,
  LayoutGrid, WalletCards, UserPlus, HandCoins, Eye, EyeOff, PlayCircle, KanbanSquare, PlaneTakeoff, FilePlus2, Languages, Palette,
} from "lucide-react";
import { VALUES_MODES, VALUES_LABELS, type ValuesMode } from "@/domain/plans";
import { api } from "@/lib/api";
import { UserAvatar } from "./user-avatar";
import { HolderPicker, type HolderOpt } from "./holder-picker";
import { ThemeMenuItem } from "./theme-switch";
import { DashboardViewPicker, type DashboardView } from "./dashboard-view";
import { EntryForms, type AccountOpt, type StoreOpt } from "./entry-forms";
import type { CardOpt } from "./form-parts";
import { ProgramLogo } from "./program-logo";
import { AssistantButton } from "./assistant";

type Icon = React.ComponentType<{ className?: string }>;

const NAV: { group: string; items: { href: string; label: string; icon: Icon }[] }[] = [
  { group: "Análise", items: [
    { href: "/app", label: "Painel", icon: LayoutDashboard },
    { href: "/app/reports", label: "Relatórios", icon: LineChart },
    { href: "/app/entries", label: "Extrato", icon: FileText },
  ] },
  { group: "Ganhe pontos", items: [
    { href: "/app/purchases", label: "Compras", icon: ShoppingBag },
    { href: "/app/offers", label: "Promoções", icon: Tag },
    { href: "/app/credit-cards", label: "Cartões de Crédito", icon: CreditCard },
  ] },
  { group: "Ferramentas", items: [
    { href: "/app/crm", label: "CRM", icon: KanbanSquare },
    { href: "/app/buscador", label: "Buscador", icon: PlaneTakeoff },
    { href: "/app/tradutor", label: "Tradutor de milhas", icon: Languages },
    { href: "/app/simulators", label: "Simuladores", icon: Calculator },
    { href: "/app/sales", label: "Vendas", icon: ReceiptText },
    { href: "/app/management", label: "Fornecedores", icon: Contact },
  ] },
];

const REPORT_LABELS: Record<string, string> = { overview: "Visão Geral", purchases: "Compras", "credit-cards": "Cartões", savings: "Economia", evolution: "Evolução", sales: "Vendas", assets: "Bens e Direitos" };
const SIM_LABELS: Record<string, string> = { "purchase/bonificada": "Compra Bonificada", purchase: "Compra Bonificada", "purchase/store-comparison": "Pontos vs Cashback", "purchase/pontos": "Compra de Pontos", transfer: "Transferência", flight: "Passagem Aérea", hotel: "Hospedagem", sale: "Venda", "supplier-ranking": "Melhor fornecedor" };
const TITLES: [string, string][] = [
  ["/app/reports", "Relatórios"], ["/app/entries", "Extrato"], ["/app/purchases", "Compras"], ["/app/offers", "Promoções"],
  ["/app/credit-cards", "Cartões de Crédito"], ["/app/simulators", "Simuladores"], ["/app/sales", "Vendas"],
  ["/app/management", "Fornecedores"], ["/app/programs", "Programas"], ["/app/notifications", "Notificações"],
  ["/app/settings", "Configurações"], ["/app/crm", "CRM"], ["/app/buscador", "Buscador de passagens"], ["/app/tradutor", "Tradutor de milhas"], ["/app/upgrade", "Planos"], ["/app/guides", "Guias"], ["/app/news", "Novidades"],
];

// Tag dos guias que explica cada página (botão "Tutorial" do cabeçalho)
const TUTORIAL_TAGS: [string, string][] = [
  ["/app/entries", "Extrato"], ["/app/credit-cards", "Cartões"], ["/app/offers", "Promoções"], ["/app/purchases", "Bônus"],
  ["/app/simulators", "Cálculos"], ["/app/reports", "Métricas"], ["/app/programs", "Programas"],
];

const BOTTOM: { href: string; label: string; icon: Icon }[] = [
  { href: "/app", label: "Painel", icon: LayoutDashboard },
  { href: "/app/purchases", label: "Compras", icon: ShoppingBag },
  { href: "/app/entries", label: "Extrato", icon: FileText },
];

export function Shell(props: {
  appName: string;
  user: { name: string; email: string; role: string; avatarVersion: string | null };
  holders: HolderOpt[];
  programs: { id: string; name: string; color: string }[];
  accounts: AccountOpt[];
  cards?: CardOpt[];
  stores?: StoreOpt[];
  holderId: string;
  unread: number;
  unreadNews: number;
  supportEmail: string;
  dashboardView: DashboardView;
  prefs: { sound: boolean; valuesMode: ValuesMode; hideTutorials: boolean };
  plan: { name: string; trialDaysLeft: number };
  guides: { slug: string; title: string; tags: string[]; video: boolean }[];
  brand: string;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  // Vigia de navegação nos links internos (ver src/lib/nav.ts)
  useEffect(() => watchLinkClicks((href) => router.push(href)), [router]);
  // Ação principal da página no botão flutuante, como na referência
  const fab =
    path === "/app/programs" && search.get("view") === "titulares"
      ? { label: "Novo titular", event: "mm:new-holder", icon: <UserPlus className="h-5 w-5" /> }
      : path.startsWith("/app/simulators/")
        ? { label: "Simular", event: "mm:simulate", icon: <Calculator className="h-5 w-5" /> }
        : path === "/app/purchases" && search.get("tab") === "compras"
          ? { label: "Criar nova compra", event: "mm:new-purchase", icon: <ShoppingBag className="h-5 w-5" /> }
        : path === "/app/crm" && search.get("view") !== "dashboard"
          ? { label: "Novo pedido", event: "mm:new-order", icon: <FilePlus2 className="h-5 w-5" /> }
        : path === "/app/sales" && search.get("tab") !== "clientes"
          ? { label: "Registrar venda", event: "mm:new-sale", icon: <HandCoins className="h-5 w-5" /> }
          : null;
  const [mobileMenu, setMobileMenu] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [valuesMode, setValuesMode] = useState<ValuesMode>(props.prefs.valuesMode);
  // Preferências que valem para a página toda (som dos avisos e visibilidade dos valores)
  useEffect(() => {
    const d = document.documentElement.dataset;
    d.sound = props.prefs.sound ? "on" : "off";
    d.values = valuesMode.toLowerCase();
  }, [props.prefs.sound, valuesMode]);
  useEffect(() => setValuesMode(props.prefs.valuesMode), [props.prefs.valuesMode]);
  async function cycleValues() {
    const next = VALUES_MODES[(VALUES_MODES.indexOf(valuesMode) + 1) % VALUES_MODES.length]!;
    setValuesMode(next);
    const r = await api("/api/preferences", "PATCH", { valuesMode: next });
    if (r.ok) refreshSafe(router);
  }
  const userRef = useRef<HTMLDivElement>(null);
  const active = (href: string) => (href === "/app" ? path === "/app" : path.startsWith(href));
  const title = TITLES.find(([p]) => path.startsWith(p))?.[1];
  const tutorialTag = path === "/app" ? "Painel" : TUTORIAL_TAGS.find(([p]) => path.startsWith(p))?.[1];
  const tutorial = props.prefs.hideTutorials || !tutorialTag
    ? null
    : [...props.guides].sort((a, b) => Number(b.video) - Number(a.video)).find((g) => g.tags.includes(tutorialTag));
  // Terceiro nível do caminho nas abas dos relatórios (Painel › Relatórios › Compras)
  const reportTab = REPORT_LABELS[path.split("/")[3] ?? ""];
  const simTab = SIM_LABELS[path.replace(/^\/app\/simulators\//, "")];
  const sub = path.startsWith("/app/reports/") && reportTab
    ? { parent: "/app/reports", label: reportTab }
    : path.startsWith("/app/simulators/") && simTab
      ? { parent: "/app/simulators", label: simTab }
      : null;

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("mm_sidebar") === "0");
    } catch {}
  }, []);
  useEffect(() => {
    setMobileMenu(false);
    setUserMenu(false);
  }, [path]);
  useEffect(() => {
    if (!userMenu) return;
    const close = (e: MouseEvent) => !userRef.current?.contains(e.target as Node) && setUserMenu(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [userMenu]);

  function toggleSidebar() {
    if (window.matchMedia("(max-width: 1023px)").matches) return setMobileMenu(true);
    setCollapsed((c) => {
      try {
        localStorage.setItem("mm_sidebar", c ? "1" : "0");
      } catch {}
      return !c;
    });
  }
  async function logout() {
    await api("/api/auth/logout", "POST");
    window.location.href = "/login";
  }

  const navLink = (href: string, label: string, Icon: Icon, badge?: number, external?: boolean) => {
    const cls = `relative flex items-center gap-3 rounded-[10px] px-2.5 py-2 text-[13.5px] font-semibold transition-colors ${!external && active(href) ? "bg-panel2 text-white" : "text-zinc-300 hover:bg-panel2/70 hover:text-white"}`;
    const inner = (
      <>
        {!external && active(href) && <span className="absolute -left-3 top-1.5 h-6 w-[3px] rounded-r bg-accent-light" aria-hidden />}
        <Icon className="h-[18px] w-[18px] shrink-0 text-zinc-400" />
        <span className="truncate">{label}</span>
        {!!badge && <span className="ml-auto rounded-full bg-red-500/20 px-1.5 text-[11px] font-semibold text-red-300">{badge > 9 ? "9+" : badge}</span>}
      </>
    );
    return external ? (
      <a key={href} href={href} className={cls}>{inner}</a>
    ) : (
      <Link key={href} href={href} aria-current={active(href) ? "page" : undefined} className={cls}>{inner}</Link>
    );
  };

  // Atalhos de contas seguem o titular escolhido no seletor (todos, minhas contas ou um titular)
  const chosenHolder = props.holderId === "self" ? props.holders.find((h) => h.isSelf)?.id : props.holderId || undefined;
  const visibleAccounts = chosenHolder ? props.accounts.filter((a) => a.holderId === chosenHolder) : props.accounts;
  // Fixadas primeiro ("Fixar na barra lateral"); sem fixadas, as de maior saldo
  const pinnedAccounts = visibleAccounts.filter((a) => a.pinned);
  const topAccounts = (pinnedAccounts.length ? pinnedAccounts : [...visibleAccounts].sort((a, b) => b.balance - a.balance)).slice(0, 5);
  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-5">
        <Link href="/app" className="flex items-center gap-2 text-[17px] font-semibold tracking-tight">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-400 to-violet-500 text-[13px] font-bold text-white">M</span>
          {props.appName}
        </Link>
        <button className="btn-subtle ml-auto h-8 w-8 px-0 lg:hidden" onClick={() => setMobileMenu(false)} aria-label="Fechar menu"><X className="h-4 w-4" /></button>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Menu principal">
        {NAV.map((g) => (
          <div key={g.group}>
            <p className="kicker mb-1.5 px-2.5">{g.group}</p>
            <div className="space-y-0.5">{g.items.map((it) => navLink(it.href, it.label, it.icon))}</div>
          </div>
        ))}
        <div>
          <div className="mb-2 flex items-center px-2.5">
            <p className="kicker">Programas</p>
            <Link href="/app/programs" className="ml-auto text-xs font-medium text-muted hover:text-white">Ver todos ({visibleAccounts.length})</Link>
          </div>
          {/* Atalhos das contas (titular × programa), maiores saldos primeiro, como na referência */}
          <div className="flex flex-wrap gap-1.5 px-2.5">
            {topAccounts.map((a) => (
              <Link key={a.id} href={`/app/programs/${a.id}`} title={`${a.holder} - ${a.program}`} aria-label={`${a.holder} - ${a.program}`} className="rounded-full transition-transform hover:scale-110">
                <ProgramLogo programId={a.programId ?? a.id} name={a.program} color={a.color} version={a.logo} size={32} />
              </Link>
            ))}
            {visibleAccounts.length > 5 && (
              <Link href="/app/programs" className="flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-line text-[11px] text-muted" aria-label={`Ver mais ${visibleAccounts.length - 5} programas`}>+{visibleAccounts.length - 5}</Link>
            )}
            {visibleAccounts.length === 0 && <Link href="/app/programs" className="flex items-center gap-1.5 text-xs text-muted hover:text-white"><WalletCards className="h-3.5 w-3.5" />Cadastrar contas</Link>}
          </div>
        </div>
      </nav>
      <div className="space-y-0.5 border-t border-line px-3 py-3">
        {navLink("/app/settings?tab=sales-profile", `Sua ${props.brand}`, Palette)}
        {navLink("/app/guides", "Guias", GraduationCap)}
        {navLink("/app/news", "Novidades", Megaphone, props.unreadNews)}
        {props.supportEmail && navLink(`mailto:${props.supportEmail}?subject=${encodeURIComponent(`Ajuda no ${props.appName}`)}`, "Fale com o suporte", LifeBuoy, undefined, true)}
        <div className="relative pt-1" ref={userRef}>
          <button onClick={() => setUserMenu((v) => !v)} aria-expanded={userMenu} aria-haspopup="menu" className="flex w-full items-center gap-3 rounded-[10px] px-2 py-2 text-left hover:bg-panel2">
            <UserAvatar name={props.user.name} version={props.user.avatarVersion} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5"><span className="truncate text-sm font-semibold">{props.user.name}</span><span className="shrink-0 rounded bg-accent-soft px-1 text-[10px] font-bold uppercase text-accent-light">{props.plan.name}</span></span>
              <span className="block truncate text-xs text-muted">{props.user.email}</span>
            </span>
            <ChevronsUpDown className="h-4 w-4 text-muted" />
          </button>
          {userMenu && (
            <div role="menu" className="absolute bottom-full left-0 right-0 mb-2 animate-pop-in rounded-xl border border-line bg-panel2 p-1 shadow-xl shadow-black/40">
              <Link role="menuitem" href="/app/notifications" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-line">
                <Bell className="h-4 w-4" />Notificações{props.unread > 0 && <span className="ml-auto rounded-full bg-accent-light px-1.5 text-[11px] font-bold text-zinc-950">{props.unread}</span>}
              </Link>
              <Link role="menuitem" href="/app/settings" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-line"><Settings className="h-4 w-4" />Configurações</Link>
              <ThemeMenuItem />
              <button role="menuitem" onClick={cycleValues} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-line">
                {valuesMode === "VISIBLE" ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}Valores: {VALUES_LABELS[valuesMode]}
              </button>
              {props.user.role === "ADMIN" && <Link role="menuitem" href="/admin" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-amber-300 hover:bg-line"><ShieldCheck className="h-4 w-4" />Administração</Link>}
              <button role="menuitem" onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-300 hover:bg-line"><LogOut className="h-4 w-4" />Sair</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen transition-[padding] ${collapsed ? "" : "lg:pl-[248px]"}`}>
      <aside className={`fixed inset-y-0 left-0 z-30 hidden w-[248px] border-r border-line bg-side ${collapsed ? "" : "lg:block"}`}>{sidebar}</aside>
      {mobileMenu && (
        <div className="fixed inset-0 z-50 animate-fade-in bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setMobileMenu(false)}>
          <aside className="h-full w-[290px] max-w-[85vw] border-r border-line bg-side" onClick={(e) => e.stopPropagation()}>{sidebar}</aside>
        </div>
      )}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-bg/60 px-3 backdrop-blur-md sm:px-5">
        <button className="btn-subtle relative h-9 w-9 px-0" onClick={toggleSidebar} aria-label="Abrir/fechar menu lateral">
          <PanelLeft className="hidden h-[18px] w-[18px] lg:block" />
          <Menu className="h-5 w-5 lg:hidden" />
          {(props.unreadNews > 0 || props.unread > 0) && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500 lg:hidden" aria-hidden />}
        </button>
        <nav aria-label="Você está em" className="flex min-w-0 items-center gap-1.5 text-sm">
          {title ? (
            <>
              <Link href="/app" className="hidden text-muted hover:text-white sm:inline">Painel</Link>
              <ChevronRight className="hidden h-4 w-4 text-zinc-600 sm:inline" />
              {sub ? (
                <>
                  <Link href={sub.parent} className="hidden text-muted hover:text-white sm:inline">{title}</Link>
                  <ChevronRight className="hidden h-4 w-4 text-zinc-600 sm:inline" />
                  <span className="truncate font-semibold">{sub.label}</span>
                </>
              ) : (
                <span className="truncate font-semibold">{title}</span>
              )}
            </>
          ) : (
            <span className="font-semibold">Painel</span>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {props.plan.trialDaysLeft > 0 && (
            <Link href="/app/upgrade" className="hidden items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/20 md:flex" title={`Você está experimentando o ${props.plan.name}. ${props.plan.trialDaysLeft} dias restantes`}>
              Teste {props.plan.name} · {props.plan.trialDaysLeft} {props.plan.trialDaysLeft === 1 ? "dia" : "dias"}<span className="font-semibold underline underline-offset-2">Assinar</span>
            </Link>
          )}
          {tutorial && (
            <Link href={`/app/guides/${tutorial.slug}`} className="btn-subtle hidden h-9 gap-1.5 rounded-full px-3 text-xs font-semibold sm:inline-flex" title={tutorial.title}>
              <PlayCircle className="h-4 w-4" />Tutorial
            </Link>
          )}
          <AssistantButton />
          {path === "/app" && <DashboardViewPicker value={props.dashboardView} />}
          <HolderPicker holders={props.holders} value={props.holderId} />
          <Link href="/app/notifications" className="btn-subtle relative h-9 w-9 rounded-full px-0" aria-label={`Notificações (${props.unread} não lidas)`}>
            <Bell className="h-[18px] w-[18px]" />
            {props.unread > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />}
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-3 py-5 pb-36 sm:px-5 sm:py-6 lg:pb-28">{props.children}</main>

      {/* Barra inferior no celular */}
      <nav aria-label="Navegação rápida" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-side/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        {BOTTOM.map((it) => (
          <Link key={it.href} href={it.href} aria-current={active(it.href) ? "page" : undefined} className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${active(it.href) ? "text-accent-light" : "text-muted"}`}>
            <it.icon className="h-5 w-5" />
            {it.label}
          </Link>
        ))}
        <button onClick={() => setMobileMenu(true)} className="relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted" aria-label="Mais opções do menu">
          <LayoutGrid className="h-5 w-5" />
          Mais
          {(props.unreadNews > 0 || props.unread > 0) && <span className="absolute right-[30%] top-2 h-2 w-2 rounded-full bg-red-500" aria-hidden />}
        </button>
      </nav>
      <EntryForms accounts={props.accounts} cards={props.cards} stores={props.stores} fab={fab} />
    </div>
  );
}
