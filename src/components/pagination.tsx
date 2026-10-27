import Link from "next/link";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

export function Pagination({ page, pages, total, pageSize, href }: { page: number; pages: number; total: number; pageSize: number; href: (p: number) => string }) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const link = (p: number, icon: React.ReactNode, label: string, disabled: boolean) =>
    disabled ? (
      <span className="btn-ghost btn-icon opacity-40" aria-disabled="true" aria-label={label}>{icon}</span>
    ) : (
      <Link className="btn-ghost btn-icon" href={href(p)} aria-label={label}>{icon}</Link>
    );
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
      <span>Mostrando {from}-{to} de {total}</span>
      <div className="flex items-center gap-1">
        {link(1, <ChevronsLeft className="h-4 w-4" />, "Primeira página", page <= 1)}
        {link(page - 1, <ChevronLeft className="h-4 w-4" />, "Página anterior", page <= 1)}
        <span className="px-2">Página {page} de {pages}</span>
        {link(page + 1, <ChevronRight className="h-4 w-4" />, "Próxima página", page >= pages)}
        {link(pages, <ChevronsRight className="h-4 w-4" />, "Última página", page >= pages)}
      </div>
    </div>
  );
}
