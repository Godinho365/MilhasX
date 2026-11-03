// Funis do CRM Passagens: os que todo usuário ganha e as cores das colunas.
// (A migração 20261102040000_order_pipelines cria os mesmos funis para quem já tinha pedidos.)

export const STAGE_COLORS = ["#60a5fa", "#38bdf8", "#a78bfa", "#f472b6", "#ef4444", "#fb923c", "#f59e0b", "#22c55e", "#94a3b8"] as const;

export const DEFAULT_PIPELINES: { name: string; stages: { name: string; color: string }[] }[] = [
  {
    name: "Funil Comercial",
    stages: [
      { name: "Novos pedidos", color: "#60a5fa" },
      { name: "Pesquisa e cotação", color: "#f59e0b" },
      { name: "Cotação enviada", color: "#a78bfa" },
      { name: "Negociação e emissão", color: "#fb923c" },
      { name: "Emitido", color: "#22c55e" },
    ],
  },
  {
    name: "Pós-Venda",
    stages: [
      { name: "Aguardando viagem", color: "#60a5fa" },
      { name: "Viagem em curso", color: "#38bdf8" },
      { name: "Aguardando avaliação", color: "#f59e0b" },
      { name: "Viagem concluída", color: "#94a3b8" },
    ],
  },
  {
    name: "Recuperação de Venda",
    stages: [
      { name: "Perdido recente", color: "#ef4444" },
      { name: "Contato feito", color: "#f59e0b" },
      { name: "Nova proposta", color: "#a78bfa" },
      { name: "Recuperado", color: "#22c55e" },
    ],
  },
];

/** Colunas de um funil novo criado pelo usuário. */
export const NEW_PIPELINE_STAGES = [
  { name: "A fazer", color: "#60a5fa" },
  { name: "Em andamento", color: "#f59e0b" },
  { name: "Concluído", color: "#22c55e" },
];
