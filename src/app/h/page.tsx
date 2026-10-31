import { cookies } from "next/headers";
import { fmtDay } from "@/lib/format";
import { holderView, HOLDER_COOKIE } from "@/server/services/holder-access";
import { appName, publicBrand } from "@/server/session";
import { ownerBranding } from "@/server/services/client-pages";
import { PageShell } from "@/app/p/[slug]/central";
import { bannerUrl } from "@/domain/page-design";
import { PainelView } from "@/app/p/[slug]/painel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Página do titular", robots: { index: false } };

// Página só de leitura que o titular abre pelo link recebido por e-mail
export default async function HolderPage({ searchParams }: { searchParams: Promise<{ link?: string }> }) {
  const view = await holderView((await cookies()).get(HOLDER_COOKIE)?.value);
  const invalid = (await searchParams).link === "invalido";
  if (!view) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
        <div className="card card-pad w-full space-y-2 text-center">
          <h1 className="text-lg font-semibold">{invalid ? "Link inválido ou expirado" : "Acesso encerrado"}</h1>
          <p className="text-sm text-muted">{invalid ? "Este link já foi usado ou passou da validade. " : ""}Peça a quem gerencia suas contas um novo link de acesso.</p>
        </div>
      </main>
    );
  }
  // "Gestão de Milhas": mesma personalização (cor, banner, textos) da página Sua MilhasX do gestor
  const b = await ownerBranding(view.ownerId);
  return (
    <PageShell brand={publicBrand()} appName={appName()} bgColor={b.design.bgColor} banner={b.slug ? bannerUrl(b.slug, b.bannerVersion) : null}>
      <PainelView
        agency={b.agency}
        design={b.design.gestaoMilhas}
        data={view}
        footer={
          <div className="mt-6 flex items-center justify-between gap-3 text-xs text-muted">
            <span>Acesso válido até {fmtDay(view.sessionExpiresAt)}. Somente leitura.</span>
            <form action="/api/holder-access/logout" method="post"><button className="btn-ghost h-8 bg-panel text-xs">Sair</button></form>
          </div>
        }
      />
    </PageShell>
  );
}
