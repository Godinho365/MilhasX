import Link from "next/link";
import { BrandMark } from "@/components/brand";

/** Cabeçalho das páginas públicas (início, login, cadastro, termos e privacidade). */
export function PublicHeader({ name, links }: { name: string; links?: { href: string; label: string }[] }) {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
      <Link href="/" aria-label="Página inicial" className="text-lg">
        <BrandMark name={name} size={30} />
      </Link>
      {links && (
        <nav className="hidden items-center gap-6 text-sm text-muted md:flex" aria-label="Seções">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="hover:text-accent-light">{l.label}</a>
          ))}
        </nav>
      )}
      <nav className="flex items-center gap-2">
        <Link href="/login" className="btn-subtle">Login</Link>
        <Link href="/register" className="btn-primary">Criar conta</Link>
      </nav>
    </header>
  );
}

export function PublicFooter({ name }: { name: string }) {
  const cols = [
    { title: "Produto", links: [["/#recursos", "Recursos"], ["/#simulador", "Simulador"], ["/#planos", "Planos"]] },
    { title: "Conta", links: [["/register", "Criar conta"], ["/login", "Entrar"], ["/#duvidas", "Dúvidas"]] },
    { title: "Políticas", links: [["/termos", "Termos de Serviço"], ["/privacidade", "Política de Privacidade"]] },
  ];
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:grid-cols-4 sm:px-6">
        <div>
          <BrandMark name={name} size={28} />
          <p className="mt-3 text-sm text-muted">Gestão de milhas e pontos para quem acumula, compra e vende.</p>
        </div>
        {cols.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <p className="mb-3 text-sm font-semibold">{c.title}</p>
            <ul className="space-y-2 text-sm text-muted">
              {c.links.map(([href, label]) => (
                <li key={href}><Link href={href} className="hover:text-accent-light">{label}</Link></li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <p className="border-t border-line px-4 py-4 text-center text-xs text-muted">© {new Date().getFullYear()} {name}. Todos os direitos reservados.</p>
    </footer>
  );
}
