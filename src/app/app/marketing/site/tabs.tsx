"use client";
// Marketing › Site: o site da agência e a Central de atendimento lado a lado, em abas. A Central
// usa o tema do site (como está no editor, mesmo antes de salvar) na prévia e, salvo, nas páginas.
import { useCallback, useMemo, useState } from "react";
import { Globe, MessageCircle } from "lucide-react";
import { PageEditor, type PageEditorProps } from "@/app/editor/editor";
import { centralLook } from "@/domain/central-look";
import { themeById } from "@/domain/site-themes";
import { SiteBuilder } from "./client";

type Tab = "site" | "central";

export function SiteAndCentral({ tab: initialTab, site, packages, central }: { tab: Tab; site: React.ComponentProps<typeof SiteBuilder>["initial"]; packages: React.ComponentProps<typeof SiteBuilder>["packages"]; central: PageEditorProps }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [look, setLook] = useState({ theme: site.theme, accent: site.content.brand.accent, saved: site.exists });
  const onLook = useCallback((theme: string | null, accent: string | null, saved: boolean) => setLook({ theme, accent, saved }), []);
  const siteLook = useMemo(() => (look.theme ? centralLook(themeById(look.theme), look.accent) : null), [look.theme, look.accent]);
  function pick(t: Tab) {
    setTab(t);
    // O endereço guarda a aba (voltar e recarregar abrem a mesma)
    window.history.replaceState(null, "", t === "central" ? "?aba=central" : window.location.pathname);
  }
  const tabs: [Tab, string, typeof Globe][] = [["site", "Site", Globe], ["central", "Central de atendimento", MessageCircle]];
  return (
    <div>
      <div className="mb-4 inline-flex gap-1 rounded-xl border border-line bg-panel p-1" role="tablist" aria-label="Site e Central de atendimento">
        {tabs.map(([k, label, Icon]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => pick(k)} className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium ${tab === k ? "bg-panel2 text-white" : "text-muted hover:text-zinc-100"}`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>
      {/* As duas abas ficam montadas: trocar de aba não perde o que ainda não foi salvo */}
      <div hidden={tab !== "site"}><SiteBuilder initial={site} packages={packages} onLook={onLook} /></div>
      <div hidden={tab !== "central"}><PageEditor {...central} embedded siteLook={siteLook} siteSaved={look.saved} /></div>
    </div>
  );
}
