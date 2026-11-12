// Chat Balcões no formato de mensageiro: a tela renderizada no servidor (lista de conversas com busca e filtros,
// conversa aberta com o resumo do pedido no topo e "Ver no grupo", acessibilidade dos controles).
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatBalcoesClient, type Dm } from "@/app/app/chat-balcoes/client";
import type { EmissionAccount } from "@/domain/balcao-ads";

const chats = [
  { id: "g1", title: "Balcão de Milhas ASM - Oficial", account: "Milhas X", clearedUpTo: null },
  { id: "g2", title: "BALCÃO MILHAS VIP PRO", account: "Milhas Y", clearedUpTo: null },
];
const dm: Dm = {
  id: "d1", linkId: "l1", name: "Giorgi Schneiders | Turistar Travel", username: null, via: "Milhas X", group: "Balcão de Milhas ASM - Oficial", clearedUpTo: null,
  offer: { chatId: "g1", messageId: 10, text: "Compro LATAM 36k 2 cpf 26,50", sender: "Giorgi", group: "Balcão de Milhas ASM - Oficial", cpmCents: 2650, at: "2026-11-12T17:48:00.000Z" },
  crm: null,
};
// conta de LATAM com saldo: o lucro do pedido aparece (custo 21,30/milheiro → 36.000 × 5,20 = R$ 187,20)
const accounts: EmissionAccount[] = [{ id: "a1", label: "LATAM Pass Kamila", programCode: "LATAM", available: 200_000, cpfFree: 20, costCpmCents: 2130, load: { balance: 200_000, reserved: 0, cpfFree: 20, ptsPerCpf: 30_000 } }];
// o real brasileiro sai com espaço que não quebra entre "R$" e o valor: aqui vira espaço comum para comparar
const render = (props: Partial<Parameters<typeof ChatBalcoesClient>[0]> = {}) =>
  renderToStaticMarkup(createElement(ChatBalcoesClient, { chats, initialAlerts: [], initialDms: [dm], accounts, realtime: false, ...props })).replace(/\u00a0/g, " ");

describe("Chat Balcões: tela de mensageiro", () => {
  it("lista de conversas: título, busca, filtros Todas/Não lidas, grupos, privado e Alertas", () => {
    const html = render();
    expect(html).toContain(">Chat Balcões</h1>");
    expect(html).toMatch(/<input[^>]*type="search"[^>]*placeholder="Buscar conversas"/);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Todas</);
    expect(html).toMatch(/aria-pressed="false"[^>]*>Não lidas/);
    for (const name of ["Balcão de Milhas ASM - Oficial", "BALCÃO MILHAS VIP PRO", "Giorgi Schneiders | Turistar Travel", "Alertas"]) expect(html).toContain(name);
    expect(html).toContain('aria-label="Fechar a conversa com Giorgi Schneiders | Turistar Travel"');
    // a primeira conversa fica selecionada (destacada) e só ela aparece aberta
    expect(html).toMatch(/aria-current="true"[^>]*>.*Balcão de Milhas ASM - Oficial/);
  });

  it("conversa no privado ligada a um pedido: resumo compacto no topo com o lucro e Ver no grupo", () => {
    const html = render({ openDmId: "d1" });
    expect(html).toContain("LATAM · 36.000 milhas · 2 CPFs · R$ 26,50/milheiro");
    expect(html).toContain("Lucro R$ 187,20");
    expect(html).toContain("Ver no grupo");
    // cabeçalho com nome, status e ações acessíveis; campo de mensagem com rótulo
    expect(html).toMatch(/<h2[^>]*>Giorgi Schneiders \| Turistar Travel<\/h2>/);
    for (const label of ["Voltar para as conversas", "Atualizar agora", "Limpar o chat aqui", "Mostrar os detalhes do pedido", "Enviar foto, print ou PDF", "Mensagem no privado"]) expect(html).toContain(`aria-label="${label}"`);
    // no celular, vindo direto para a conversa, a lista fica escondida e a conversa aparece
    expect(html).toMatch(/<aside class="hidden md:flex[^"]*"[^>]*aria-label="Conversas"/);
  });

  it("sem tempo real: o indicador diz que as mensagens são buscadas de 15 em 15 s", () => {
    expect(render()).toContain("A cada 15 s");
  });
});
