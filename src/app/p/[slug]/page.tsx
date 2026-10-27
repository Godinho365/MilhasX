import { notFound } from "next/navigation";
import { AtSign, Mail } from "lucide-react";
import { publicSalesProfile } from "@/server/services/settings";
import { appName, publicBrand } from "@/server/session";
import { ProgramLogo } from "@/components/program-logo";
import { countPublicView } from "@/server/services/orders";
import { CentralActions } from "./central";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const p = await publicSalesProfile((await params).slug);
  return { title: p ? `${p.displayName} · Central de Atendimento — ${publicBrand()}` : publicBrand(), robots: { index: false } };
}

// Central de Atendimento da agência (como a página da agência na simbora.la): mostra só o que
// o dono escolheu publicar e recebe pedidos de cotação e interessados em gestão de milhas.
export default async function PublicProfile({ params }: { params: Promise<{ slug: string }> }) {
  const p = await publicSalesProfile((await params).slug);
  if (!p) notFound();
  await countPublicView(p.slug);
  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-xl items-center px-4 py-3">
          <span className="text-lg font-bold tracking-tight">{publicBrand()}</span>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 py-10">
        <p className="kicker">Central de Atendimento</p>
        <h1 className="mt-1 text-3xl font-semibold">{p.displayName}</h1>
        <p className="mt-2 text-lg text-muted">{p.headline || "Sua viagem começa aqui"}</p>
        {p.bio && <p className="mt-4 whitespace-pre-line text-sm text-muted">{p.bio}</p>}
        {p.programs.length > 0 && (
          <ul className="mt-5 flex flex-wrap gap-2" aria-label="Programas">
            {p.programs.map((pr) => (
              <li key={pr.id} className="flex items-center gap-2 rounded-full border border-line px-3 py-1 text-sm">
                <ProgramLogo programId={pr.id} name={pr.name} color={pr.color} size={18} />
                {pr.name}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-8">
          <CentralActions slug={p.slug} acceptsOrders={p.acceptsOrders} acceptsLeads={p.acceptsLeads} whatsapp={p.whatsapp} />
        </div>
        {(p.instagram || p.email) && (
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {p.instagram && <a className="btn-ghost h-9" href={`https://instagram.com/${p.instagram}`} target="_blank" rel="noopener noreferrer"><AtSign className="h-4 w-4" />{p.instagram}</a>}
            {p.email && <a className="btn-ghost h-9" href={`mailto:${p.email}`}><Mail className="h-4 w-4" />E-mail</a>}
          </div>
        )}
        <p className="mt-10 text-center text-xs text-muted">{publicBrand()} · página criada com o {appName()}</p>
      </main>
    </div>
  );
}
