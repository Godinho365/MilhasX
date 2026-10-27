"use client";
import { useEffect, useState } from "react";
import { resolveDesign, bannerUrl, type DesignPage } from "@/domain/page-design";
import { contractText } from "@/domain/proposal";
import { CentralPage, PageShell, type CentralData } from "@/app/p/[slug]/central";
import { CaptacaoForm, GestaoForm } from "@/app/p/[slug]/forms";
import { CotacaoView, ReservaView, ContratoView, SAMPLE_ORDER } from "@/app/p/[slug]/pages";
import { PainelView, SAMPLE_PAINEL } from "@/app/p/[slug]/painel";

export type PreviewMessage = {
  type: "central-preview";
  draft: Omit<CentralData, "programs" | "design" | "bannerVersion"> & { programIds: string[]; design: unknown };
  view: DesignPage;
  bannerSrc: string | null;
};

export function PreviewClient({ initial, programs, brand, appName }: { initial: CentralData; programs: CentralData["programs"]; brand: string; appName: string }) {
  const [data, setData] = useState(initial);
  const [view, setView] = useState<DesignPage>("home");
  const [bannerSrc, setBannerSrc] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      // Só aceita o rascunho vindo do próprio app (a página que contém este iframe)
      if (e.origin !== window.location.origin || e.data?.type !== "central-preview") return;
      const m = e.data as PreviewMessage;
      const { programIds, design, ...rest } = m.draft;
      setData((d) => ({ ...d, ...rest, programs: programs.filter((p) => programIds.includes(p.id)), design: resolveDesign(design) }));
      setView(m.view);
      setBannerSrc(m.bannerSrc);
    }
    window.addEventListener("message", onMessage);
    window.parent?.postMessage({ type: "central-preview-ready" }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, [programs]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);
  if (view === "home") return <CentralPage data={data} brand={brand} appName={appName} preview bannerSrc={bannerSrc} />;
  const d = data.design;
  const agency = data.displayName;
  return (
    // key: cada página começa do zero ao trocar de aba (formulários voltam à primeira etapa)
    <PageShell key={view} brand={brand} appName={appName} bgColor={d.bgColor} banner={bannerUrl(data.slug, data.bannerVersion, bannerSrc)}>
      {view === "captacao" && <CaptacaoForm slug={data.slug} agency={agency} design={d.captacao} whatsapp={data.whatsapp} preview />}
      {view === "gestao" && <GestaoForm slug={data.slug} agency={agency} design={d.gestao} whatsapp={data.whatsapp} preview />}
      {view === "cotacao" && <CotacaoView agency={agency} whatsapp={data.whatsapp ?? "11900000000"} design={d.cotacao} order={SAMPLE_ORDER} />}
      {view === "reserva" && <ReservaView agency={agency} whatsapp={data.whatsapp ?? "11900000000"} design={d.reserva} order={SAMPLE_ORDER} fileBase={null} links={{ cotacao: "#", contrato: "#" }} />}
      {view === "gestaoMilhas" && <PainelView agency={agency} design={d.gestaoMilhas} data={SAMPLE_PAINEL} />}
      {view === "contrato" && <ContratoView slug={data.slug} token="exemplo" agency={agency} design={d.contrato} order={SAMPLE_ORDER} text={contractText(d.contrato.terms, { name: agency, doc: d.contrato.agencyDoc, address: d.contrato.agencyAddress }, SAMPLE_ORDER)} preview />}
      <p className="mt-6 text-center text-xs text-muted">Prévia com dados de exemplo</p>
    </PageShell>
  );
}
