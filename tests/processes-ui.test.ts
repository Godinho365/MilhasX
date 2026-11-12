// Processos renderizados no servidor: o seletor, as caixas do fluxograma (início, etapa, decisão, fim, nota) com
// responsável e página, as setas com rótulo, a barra de inserir de quem edita e a tela só de consulta.
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TEMPLATES, cleanFlow, layoutFlow } from "@/domain/process-flow";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {}, replace() {} }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/app/equipe/processos" }));
const { ProcessesClient } = await import("@/app/app/equipe/processos/client");

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el).replace(/ /g, " ");
const flow = layoutFlow(cleanFlow({
  nodes: [
    { id: "i", kind: "start", title: "Pedido do cliente" },
    { id: "a", kind: "step", title: "Confirmar datas", owner: "Atendimento", link: "/app/crm" },
    { id: "d", kind: "decision", title: "Aprovou?" },
    { id: "f", kind: "end", title: "Fim" },
    { id: "n", kind: "note", title: "Atenção", detail: "Prazo de 24 horas" },
  ],
  edges: [{ from: "i", to: "a" }, { from: "a", to: "d" }, { from: "d", to: "f", label: "Sim" }],
}));
const procs = [{ id: "p1", title: "Emissão", description: "Do pedido à reserva", flow }, { id: "p2", title: "Reembolso", description: null, flow: TEMPLATES[1]!.flow() }];
const props = (o: object = {}) => ({ processes: procs, members: [{ id: "m1", name: "Bia" }], canEdit: true, ai: { enabled: false, owner: true }, initialId: null, ...o });

describe("Processos", () => {
  it("abre o primeiro processo: seletor, caixas, setas com rótulo, barra de quem edita", () => {
    const h = html(createElement(ProcessesClient, props()));
    expect(h).toContain('<option value="p1" selected="">Emissão</option>');
    expect(h).toContain("Reembolso");
    for (const l of ["Início: Pedido do cliente", "Etapa: Confirmar datas", "Decisão: Aprovou?", "Fim: Fim", "Nota: Atenção"]) expect(h).toContain(`aria-label="${l}"`);
    expect(h).toContain("Atendimento");
    expect(h).toContain("CRM Passagens");
    expect(h).toContain(">Sim</text>");
    expect(h).toContain("Prazo de 24 horas");
    expect(h).toContain('aria-label="Inserir"');
    expect(h).toContain("Organizar");
    expect(h).toContain('value="Emissão"'); // nome editável
    expect(h).toContain("Pergunte à IA");
    expect(h).toContain('aria-label="Travar a edição"');
    expect(h).toContain("Puxe até outra caixa para ligar");
  });

  it("abre o pedido na URL; só consulta sem os botões de editar; vazio", () => {
    const h = html(createElement(ProcessesClient, props({ initialId: "p2", canEdit: false })));
    expect(h).toContain('<option value="p2" selected="">Reembolso</option>');
    expect(h).toContain("Está dentro das 24 horas?");
    expect(h).not.toContain('aria-label="Inserir"');
    expect(h).not.toContain(">Novo<");
    expect(h).not.toContain("Puxe até outra caixa para ligar");
    expect(h).not.toContain("Usar");
    const empty = html(createElement(ProcessesClient, props({ processes: [] })));
    expect(empty).toContain("Crie ou selecione um processo para começar");
    expect(empty).toContain("Criar processo");
  });
});
