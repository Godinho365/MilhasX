/** Modos do painel (/app). Compartilhado entre servidor e cliente; o padrão é "gestao". */

export type DashboardView = "visao-geral" | "vendas" | "gestao";

export const VIEWS: readonly { key: DashboardView; label: string; sub: string }[] = [
  { key: "visao-geral", label: "Visão geral", sub: "Saldos, custo médio e evolução das carteiras" },
  { key: "vendas", label: "Vendas", sub: "Faturamento, lucro e clientes do mês" },
  { key: "gestao", label: "Gestão", sub: "Carteiras, pontos a receber e alertas" },
];
