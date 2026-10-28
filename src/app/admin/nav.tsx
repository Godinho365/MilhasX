"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  ["/admin", "Indicadores"], ["/admin/users", "Usuários"], ["/admin/programs", "Programas"], ["/admin/offers", "Lojas e ofertas"],
  ["/admin/promotions", "Promoções"], ["/admin/calculators", "Calculadoras"], ["/admin/guides", "Guias"], ["/admin/news", "Novidades"], ["/admin/audit", "Auditoria"], ["/admin/settings", "Parâmetros"],
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 pb-2 sm:px-5" aria-label="Administração">
      {NAV.map(([href, label]) => {
        const active = href === "/admin" ? path === "/admin" : path.startsWith(href!);
        return (
          <Link key={href} href={href!} aria-current={active ? "page" : undefined} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${active ? "bg-panel2 text-white" : "text-muted hover:text-white"}`}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
