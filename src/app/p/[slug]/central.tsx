"use client";
import { Send, Star, MessageCircle, ChevronRight, ExternalLink, AtSign, Mail } from "lucide-react";
import { ProgramLogo } from "@/components/program-logo";
import { themeForBg, bannerUrl, type PageDesign, type PageButton } from "@/domain/page-design";

export type CentralData = {
  slug: string;
  displayName: string;
  headline: string | null;
  bio: string | null;
  whatsapp: string | null;
  instagram: string | null;
  email: string | null;
  acceptsOrders: boolean;
  acceptsLeads: boolean;
  programs: { id: string; name: string; color: string }[];
  design: PageDesign;
  bannerVersion: string | null;
};

export const waLink = (phone: string | null, text?: string) => {
  const d = (phone ?? "").replace(/\D/g, "");
  if (!d) return null;
  return `https://wa.me/${d.length <= 11 ? `55${d}` : d}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
};

/** Moldura das páginas do cliente: cor de fundo, selo da marca, banner e rodapé. */
export function PageShell({ brand, appName, bgColor, banner, children, wide = false }: { brand: string; appName: string; bgColor: string | null; banner: string | null; children: React.ReactNode; wide?: boolean }) {
  return (
    <div data-theme={themeForBg(bgColor)} className="min-h-screen bg-bg text-zinc-100" style={bgColor ? { backgroundColor: bgColor } : undefined}>
      <main className={`mx-auto px-4 pb-28 pt-6 ${wide ? "max-w-2xl" : "max-w-xl"}`}>
        <div className="mb-5 flex justify-center">
          <span className="rounded-full border border-line bg-panel px-4 py-1.5 text-sm font-bold tracking-tight shadow-sm">{brand}</span>
        </div>
        {banner && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={banner} alt="" className="mb-5 block aspect-[3/1] w-full rounded-2xl object-cover" />
        )}
        {children}
        <p className="mt-10 text-center text-xs text-muted">Página criada com {brand}</p>
      </main>
    </div>
  );
}

/** Página Principal (Bio): nome, frase e os cartões de ação, cada um levando à sua página. */
export function CentralPage({ data, brand, appName, preview = false, bannerSrc }: { data: CentralData; brand: string; appName: string; preview?: boolean; bannerSrc?: string | null }) {
  return (
    <PageShell brand={brand} appName={appName} bgColor={data.design.bgColor} banner={bannerUrl(data.slug, data.bannerVersion, bannerSrc)}>
      <section className="card px-6 py-7 text-center" aria-label="Apresentação">
        <h1 className="text-2xl font-bold">{data.displayName}</h1>
        <p className="mt-1.5 text-muted">{data.headline || "Sua viagem começa aqui"}</p>
        {data.bio && <p className="mt-3 whitespace-pre-line text-sm text-muted">{data.bio}</p>}
        {data.programs.length > 0 && (
          <ul className="mt-4 flex flex-wrap justify-center gap-2" aria-label="Programas">
            {data.programs.map((pr) => (
              <li key={pr.id} className="flex items-center gap-1.5 rounded-full border border-line bg-panel2 px-2.5 py-1 text-xs font-medium">
                <ProgramLogo programId={pr.id} name={pr.name} color={pr.color} size={16} />
                {pr.name}
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="mt-5">
        <CentralActions data={data} preview={preview} />
      </div>
      {(data.instagram || data.email) && (
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {data.instagram && <a className="btn-ghost h-9 bg-panel" href={`https://instagram.com/${data.instagram}`} target="_blank" rel="noopener noreferrer"><AtSign className="h-4 w-4" />{data.instagram}</a>}
          {data.email && <a className="btn-ghost h-9 bg-panel" href={`mailto:${data.email}`}><Mail className="h-4 w-4" />E-mail</a>}
        </div>
      )}
    </PageShell>
  );
}

const ICONS = {
  cotacao: { Icon: Send, tone: "bg-blue-500/10 text-blue-400" },
  gestao: { Icon: Star, tone: "bg-fuchsia-500/10 text-fuchsia-400" },
  whatsapp: { Icon: MessageCircle, tone: "bg-green-500/10 text-green-400" },
  link: { Icon: ExternalLink, tone: "bg-violet-500/10 text-violet-400" },
} as const;

/** Botões da Bio na ordem escolhida pelo dono; cada botão fixo só aparece se estiver ligado. */
function CentralActions({ data, preview }: { data: CentralData; preview: boolean }) {
  const wa = waLink(data.whatsapp);
  const visible = (b: PageButton) => (b.kind === "cotacao" ? data.acceptsOrders : b.kind === "gestao" ? data.acceptsLeads : b.kind === "whatsapp" ? !!wa : true);
  const target = (b: PageButton) => (b.kind === "cotacao" ? `/p/${data.slug}/solicitar` : b.kind === "gestao" ? `/p/${data.slug}/gestao` : b.kind === "whatsapp" ? wa! : b.url!);
  const external = (b: PageButton) => b.kind === "whatsapp" || b.kind === "link";
  return (
    <div className="space-y-3">
      {data.design.buttons.filter(visible).map((b, i) => {
        const { Icon, tone } = ICONS[b.kind];
        return (
          <a
            key={`${b.kind}-${i}`}
            // Na prévia do editor os cartões não navegam (o rascunho ainda não foi salvo)
            href={preview ? undefined : target(b)}
            {...(external(b) && !preview ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="card flex w-full cursor-pointer items-center gap-4 p-4 text-left transition-colors hover:border-zinc-600"
          >
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1"><span className="block font-semibold">{b.label}</span>{b.description && <span className="block text-sm text-muted">{b.description}</span>}</span>
            <ChevronRight className="h-5 w-5 text-muted" />
          </a>
        );
      })}
    </div>
  );
}
