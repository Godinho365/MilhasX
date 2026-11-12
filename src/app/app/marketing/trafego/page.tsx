import { requirePageUser } from "@/server/session";
import { trafficState } from "@/server/services/traffic";
import { metaRedirectUri, graphVersion } from "@/server/meta";
import { PageHeader } from "@/components/stat";
import { can } from "@/domain/permissions";
import { brDay } from "@/domain/brasilia";
import { TrafficClient } from "./client";

// Tráfego: resultado dos anúncios do Meta (Facebook e Instagram) dentro do app, só leitura, ao lado dos pedidos
// que chegam pela página da agência.
export default async function TrafegoPage({ searchParams }: { searchParams: Promise<{ erro?: string; conectado?: string }> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const state = await trafficState(user.id);
  const base = process.env.APP_URL ? new URL(process.env.APP_URL).origin : "";
  return (
    <>
      <PageHeader title="Tráfego" subtitle="Os resultados dos seus anúncios do Meta (Facebook e Instagram) ao lado dos pedidos que chegam pela sua página. Só leitura: nada é publicado nem alterado nos anúncios." />
      <TrafficClient
        state={state} today={brDay()} canEdit={can(user.actor.permissions, "marketing", "edit")} owner={user.actor.isOwner}
        setup={{ redirectUri: base ? metaRedirectUri(new Request(base)) : "/api/traffic/meta/callback", version: graphVersion() }}
        flash={{ erro: sp.erro?.slice(0, 200) ?? null, conectado: sp.conectado ? Number(sp.conectado) || 0 : null }}
      />
    </>
  );
}
