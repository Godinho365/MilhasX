import { notFound } from "next/navigation";
import { MessageCircle, Send } from "lucide-react";
import { publicShowcase } from "@/server/services/showcase";
import { appName, publicBrand } from "@/server/session";
import { PackageCard } from "@/components/package-card";
import { PageShell } from "../central";

export const dynamic = "force-dynamic";

/** Link do WhatsApp da agência com a mensagem já escrita (DDI 55 quando vem só com DDD). */
const waLink = (phone: string | null, text: string) => {
  const d = (phone ?? "").replace(/\D/g, "");
  return d ? `https://wa.me/${d.length <= 11 ? `55${d}` : d}?text=${encodeURIComponent(text)}` : null;
};

type P = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: P) {
  const v = await publicShowcase((await params).slug);
  const title = v ? `${v.title || "Pacotes em destaque"} · ${v.agency}` : publicBrand();
  return { title, robots: { index: false }, openGraph: v ? { title, description: `${v.items.length} pacotes de viagem de ${v.agency}`, type: "website" } : undefined };
}

// Vitrine pública: os cards ativos da agência, cada um com o botão para falar sobre o pacote.
export default async function VitrinePage({ params }: P) {
  const v = await publicShowcase((await params).slug);
  if (!v) notFound();
  return (
    <PageShell brand={publicBrand()} appName={appName()} bgColor={null} banner={null} wide look={v.look}>
      <header className="mb-6 text-center">
        <p className="kicker">{v.agency}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{v.title || "Pacotes em destaque"}</h1>
        <p className="mt-1 text-sm text-muted">Valores sujeitos a disponibilidade no momento da emissão.</p>
      </header>
      {v.items.length === 0 ? (
        <p className="card p-8 text-center text-sm text-muted">Nenhum pacote no momento. Volte em breve!</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {v.items.map((it) => {
            const wa = waLink(v.whatsapp, `Olá! Tenho interesse no pacote "${it.title}"${it.period ? ` (${it.period})` : ""}.`);
            return (
              <PackageCard key={it.id} it={it} img={it.imageVersion ? `/api/public/showcase/${v.slug}/${it.id}?v=${it.imageVersion}` : null}>
                {it.description && <p className="whitespace-pre-line text-sm text-muted">{it.description}</p>}
                {wa ? <a href={wa} target="_blank" rel="noopener noreferrer" className="btn-primary mt-2 h-10 w-full"><MessageCircle className="h-4 w-4" />Quero este pacote</a>
                  : v.canRequest ? <a href={`/p/${v.slug}/solicitar`} className="btn-primary mt-2 h-10 w-full"><Send className="h-4 w-4" />Pedir cotação</a> : null}
              </PackageCard>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
