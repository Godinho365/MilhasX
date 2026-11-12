// Tráfego renderizado no servidor: o passo a passo de configurar (só o dono vê as variáveis), conectar, conexão
// vencida, escolher contas e a barra do painel conectado.
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { TrafficState } from "@/server/services/traffic";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {}, replace() {} }) }));
const { TrafficClient } = await import("@/app/app/marketing/trafego/client");
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el).replace(/ /g, " ");
const conn = (o: Partial<NonNullable<TrafficState["connection"]>> = {}): TrafficState["connection"] => ({
  name: "Ana no Facebook", status: "OK", expiresAt: null, connectedAt: "2026-11-12T10:00:00Z",
  accounts: [{ id: "act_1", name: "Agência Ana", currency: "BRL", status: 1 }, { id: "act_3", name: "Clientes", currency: "BRL", status: 1 }], selected: ["act_1", "act_3"], ...o,
});
const props = (state: TrafficState, o: object = {}) => ({ state, today: "2026-11-12", canEdit: true, owner: true, setup: { redirectUri: "https://gomilhasx.com/api/traffic/meta/callback", version: "v26.0" }, flash: { erro: null, conectado: null }, ...o });

describe("Tráfego", () => {
  it("sem o app do Meta: passo a passo para o dono, com o endereço de retorno e as variáveis; membro só vê o aviso", () => {
    const h = html(createElement(TrafficClient, props({ enabled: false, connection: null })));
    expect(h).toContain("Falta configurar a conexão com o Meta");
    expect(h).toContain("https://gomilhasx.com/api/traffic/meta/callback");
    expect(h).toContain("META_APP_ID");
    expect(h).toContain("ads_read");
    const m = html(createElement(TrafficClient, props({ enabled: false, connection: null }, { owner: false })));
    expect(m).not.toContain("META_APP_ID");
    expect(m).toContain("Fale com o dono da conta");
  });

  it("configurado e sem conexão: botão de conectar (só quem edita); aviso de erro e de conectado", () => {
    const h = html(createElement(TrafficClient, props({ enabled: true, connection: null }, { flash: { erro: "Conexão com o Facebook cancelada", conectado: null } })));
    expect(h).toContain('href="/api/traffic/meta/connect"');
    expect(h).toContain("Conexão com o Facebook cancelada");
    expect(html(createElement(TrafficClient, props({ enabled: true, connection: null }, { canEdit: false })))).not.toContain('href="/api/traffic/meta/connect"');
    expect(html(createElement(TrafficClient, props({ enabled: true, connection: conn() }, { flash: { erro: null, conectado: 2 } })))).toContain("2 contas de anúncios encontradas");
  });

  it("conectado: contas no topo, períodos, níveis, filtro de conta e os parâmetros de URL; vencida e sem contas", () => {
    const h = html(createElement(TrafficClient, props({ enabled: true, connection: conn() })));
    expect(h).toContain("Ana no Facebook");
    expect(h).toContain("Agência Ana · Clientes");
    for (const t of ["Hoje", "Ontem", "7 dias", "30 dias", "Personalizado", "Campanhas", "Conjuntos", "Criativos", "Todas as contas", "Atualizar", "Desconectar"]) expect(h).toContain(t);
    expect(h).toContain("utm_source=meta&amp;utm_medium=paid&amp;utm_campaign={{campaign.id}}");
    const exp = html(createElement(TrafficClient, props({ enabled: true, connection: conn({ status: "EXPIRED" }) })));
    expect(exp).toContain("A conexão com o Facebook venceu");
    expect(exp).toContain("Conectar de novo");
    const none = html(createElement(TrafficClient, props({ enabled: true, connection: conn({ selected: [] }) })));
    expect(none).toContain("Escolha as contas de anúncios");
  });
});
