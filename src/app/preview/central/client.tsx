"use client";
import { useEffect, useState } from "react";
import { resolveDesign, bannerUrl, type DesignPage } from "@/domain/page-design";
import { CentralPage, PageShell, type CentralData } from "@/app/p/[slug]/central";
import { CotacaoView, ReservaView, GestaoMilhasView, ContratoView, SAMPLE_ORDER, SAMPLE_BALANCES } from "@/app/p/[slug]/pages";

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
  if (view === "home" || view === "captacao" || view === "gestao") return <CentralPage data={data} brand={brand} appName={appName} view={view} preview bannerSrc={bannerSrc} />;
  const d = data.design;
  return (
    <PageShell brand={brand} appName={appName} bgColor={d.bgColor} banner={bannerUrl(data.slug, data.bannerVersion, bannerSrc)}>
      {view === "cotacao" && <CotacaoView design={d.cotacao} order={SAMPLE_ORDER} whatsapp={data.whatsapp ?? "11900000000"} />}
      {view === "reserva" && <ReservaView design={d.reserva} order={SAMPLE_ORDER} fileBase={null} />}
      {view === "gestaoMilhas" && <GestaoMilhasView design={d.gestaoMilhas} data={SAMPLE_BALANCES} />}
      {view === "contrato" && <ContratoView key="contrato" design={d.contrato} slug={data.slug} preview />}
      <p className="mt-6 text-center text-xs text-muted">Prévia com dados de exemplo</p>
    </PageShell>
  );
}
