// Visão geral: os blocos do painel, a área que cada um exige (o membro só vê os da função dele) e a ordem padrão.
// Cada pessoa escolhe quais aparecem e em que ordem (guardado nas preferências dela).
import { can, type AreaKey } from "./permissions";

export const OVERVIEW_WIDGETS = {
  agenda: { label: "Agenda", hint: "Hoje e os próximos 7 dias do calendário", area: "calendario" },
  tarefas: { label: "Tarefas", hint: "Pendentes e atrasadas, suas ou da equipe", area: "tarefas" },
  kpis: { label: "KPIs do mês", hint: "Faturamento, lucro, vendas e ticket médio contra o mês anterior", area: "vendas" },
  financeiro: { label: "Financeiro", hint: "Saldo em contas, a receber e a pagar", area: "financeiro" },
  emissoes: { label: "Emissões (CRM Milhas)", hint: "Negociações em cada etapa", area: "crmMilhas" },
  metas: { label: "Metas e comissões", hint: "Meta do mês e comissões a pagar", area: "metas" },
  milhas: { label: "Milhas", hint: "Saldo das contas e o valor de mercado", area: "milhas" },
  clientes: { label: "Clientes", hint: "Clientes novos no mês e interesses de viagem em aberto", area: "contatos" },
  atalhos: { label: "Atalhos", hint: "Os módulos que você usa", area: null },
} as const satisfies Record<string, { label: string; hint: string; area: AreaKey | null }>;
export type WidgetKey = keyof typeof OVERVIEW_WIDGETS;
export const WIDGET_KEYS = Object.keys(OVERVIEW_WIDGETS) as WidgetKey[];

/** Os blocos que a pessoa pode ver, na ordem dela (sem escolha: todos, na ordem padrão). */
export function visibleWidgets(saved: readonly string[], perms: readonly string[] | "ALL") {
  const allowedKeys = WIDGET_KEYS.filter((k) => { const a = OVERVIEW_WIDGETS[k].area; return !a || can(perms, a); });
  if (!saved.length) return allowedKeys;
  return saved.filter((k): k is WidgetKey => (allowedKeys as string[]).includes(k));
}
/** Os que a pessoa pode ver mas escondeu (para "Adicionar bloco"). */
export const hiddenWidgets = (saved: readonly string[], perms: readonly string[] | "ALL") => {
  const shown = new Set<string>(visibleWidgets(saved, perms));
  return WIDGET_KEYS.filter((k) => { const a = OVERVIEW_WIDGETS[k].area; return !shown.has(k) && (!a || can(perms, a)); });
};
