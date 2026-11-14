// Barra de paginação (sem estado: roda no servidor). Os links vêm de `href(p)`, que mantém os filtros da URL (ver pageHref).
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { pageItems } from "@/lib/paging";

const n = (x: number) => x.toLocaleString("pt-BR");
const BOX = "inline-flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-[13px] font-medium tabular-nums transition-colors";
// No tema do admin `text-white` é o azul-marinho do texto: o branco de verdade é #fff. `accent` é a cor da marca em cada tema.
const IDLE = "border-line bg-panel text-zinc-100 hover:bg-panel2";

export function Pagination({ page, pages, total, pageSize, href, noun, className = "mt-4" }: {
  page: number; pages: number; total: number; pageSize: number; href: (p: number) => string;
  /** Singular e plural do que se conta ("lead", "leads"). */
  noun?: [string, string];
  className?: string;
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const what = noun ? ` ${total === 1 ? noun[0] : noun[1]}` : "";

  const step = (target: number, label: string, text: string, icon: React.ReactNode, next: boolean) => {
    const body = <>{!next && icon}<span className="hidden sm:inline">{text}</span>{next && icon}</>;
    return target < 1 || target > pages
      ? <span className={`${BOX} cursor-default gap-1 border-line text-muted opacity-50 sm:px-2.5`} aria-disabled="true" aria-label={label}>{body}</span>
      : <Link className={`${BOX} ${IDLE} gap-1 sm:px-2.5`} href={href(target)} aria-label={label} rel={next ? "next" : "prev"}>{body}</Link>;
  };
  const numbers = (siblings: number, cls: string) => (
    <span className={cls}>
      {pageItems(page, pages, siblings).map((p, i) => p === "gap"
        ? <span key={`gap${i}`} className="w-5 text-center text-muted" aria-hidden="true">…</span>
        : p === page
          ? <span key={p} className={`${BOX} border-accent bg-accent text-[#fff]`} aria-current="page" aria-label={`Página ${p}, atual`}>{n(p)}</span>
          : <Link key={p} className={`${BOX} ${IDLE}`} href={href(p)} aria-label={`Página ${p}`}>{n(p)}</Link>)}
    </span>
  );

  return (
    <nav aria-label="Paginação" className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-sm text-muted ${className}`}>
      <p className="tabular-nums">
        {pages > 1
          ? <>Mostrando <b className="font-semibold text-zinc-100">{n(from)}–{n(to)}</b> de <b className="font-semibold text-zinc-100">{n(total)}</b>{what}</>
          : <><b className="font-semibold text-zinc-100">{n(total)}</b>{what}</>}
      </p>
      {pages > 1 && (
        <div className="flex items-center gap-1">
          {step(page - 1, "Página anterior", "Anterior", <ChevronLeft className="h-4 w-4" />, false)}
          {/* No celular: a 1ª, a atual e a última. Do sm em diante: mais uma vizinha de cada lado. */}
          {numbers(0, "flex items-center gap-1 sm:hidden")}
          {numbers(1, "hidden items-center gap-1 sm:flex")}
          {step(page + 1, "Próxima página", "Próxima", <ChevronRight className="h-4 w-4" />, true)}
        </div>
      )}
    </nav>
  );
}
