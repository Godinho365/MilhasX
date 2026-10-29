export type DashboardView = "visao-geral" | "vendas" | "gestao";

export const VIEWS: { key: DashboardView; label: string; sub: string }[] = [
  { key: "visao-geral", label: "Visão Geral", sub: "Saldo, evolução e atividade recente da sua carteira" },
  { key: "vendas", label: "Vendas", sub: "Faturamento, lucro e milhas vendidas" },
  { key: "gestao", label: "Gestão", sub: "Visão consolidada dos titulares e contas gerenciadas" },
];
