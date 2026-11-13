// Fluxograma dos processos: nós (início, etapa, decisão, fim, nota) e ligações. Aqui ficam os limites, a limpeza
// do que chega do navegador ou da IA, a ordem de execução (o "Usar" cria uma tarefa por etapa), o fluxograma de
// uma lista de etapas (processos antigos), a organização automática, os modelos e o texto que a IA lê.

export const NODE_KINDS = {
  start: { label: "Início", w: 160, h: 48 },
  step: { label: "Etapa", w: 220, h: 76 },
  decision: { label: "Decisão", w: 200, h: 112 },
  end: { label: "Fim", w: 160, h: 48 },
  note: { label: "Nota", w: 220, h: 96 },
} as const;
export type NodeKind = keyof typeof NODE_KINDS;
export const NODE_KIND_KEYS = Object.keys(NODE_KINDS) as NodeKind[];
export type FlowNode = { id: string; kind: NodeKind; x: number; y: number; title: string; detail: string | null; owner: string | null; link: string | null };
export type FlowEdge = { id: string; from: string; to: string; label: string | null };
export type Flow = { nodes: FlowNode[]; edges: FlowEdge[] };
export const FLOW_LIMITS = { nodes: 150, edges: 300, title: 200, detail: 1000, owner: 80, label: 40, link: 200, coord: 100_000 };

export class FlowError extends Error {}

const ID = /^[A-Za-z0-9_-]{1,40}$/;
const LINK = /^\/app(\/[\w\-./?=&%#]*)?$/;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(-FLOW_LIMITS.coord, Math.min(FLOW_LIMITS.coord, Math.round(v))) : 0);
const isKind = (k: unknown): k is NodeKind => typeof k === "string" && k in NODE_KINDS;
export const isWork = (n: FlowNode) => n.kind === "step" || n.kind === "decision";

/**
 * Limpa e confere o fluxograma: ids únicos, tipo conhecido, textos cortados no limite, link só para páginas do
 * app, ligações só entre nós que existem (sem nota, sem laço no mesmo nó, sem repetir).
 */
export function cleanFlow(input: unknown): Flow {
  const raw = (input && typeof input === "object" ? input : {}) as { nodes?: unknown; edges?: unknown };
  const nodesIn = Array.isArray(raw.nodes) ? raw.nodes : [];
  const edgesIn = Array.isArray(raw.edges) ? raw.edges : [];
  if (nodesIn.length > FLOW_LIMITS.nodes) throw new FlowError(`No máximo ${FLOW_LIMITS.nodes} caixas por processo`);
  if (edgesIn.length > FLOW_LIMITS.edges) throw new FlowError(`No máximo ${FLOW_LIMITS.edges} ligações por processo`);
  const nodes: FlowNode[] = [];
  const seen = new Set<string>();
  for (const n of nodesIn as Record<string, unknown>[]) {
    if (!n || typeof n !== "object" || typeof n.id !== "string" || !ID.test(n.id) || seen.has(n.id) || !isKind(n.kind)) continue;
    seen.add(n.id);
    const link = str(n.link, FLOW_LIMITS.link);
    nodes.push({
      id: n.id, kind: n.kind, x: num(n.x), y: num(n.y),
      title: str(n.title, FLOW_LIMITS.title) || (n.kind === "note" ? "" : NODE_KINDS[n.kind].label),
      detail: str(n.detail, FLOW_LIMITS.detail) || null,
      owner: n.kind === "note" ? null : str(n.owner, FLOW_LIMITS.owner) || null,
      link: link && LINK.test(link) ? link : null,
    });
  }
  const kindOf = new Map(nodes.map((n) => [n.id, n.kind]));
  const edges: FlowEdge[] = [];
  const pairs = new Set<string>();
  const ids = new Set<string>();
  for (const e of edgesIn as Record<string, unknown>[]) {
    if (!e || typeof e !== "object" || typeof e.from !== "string" || typeof e.to !== "string") continue;
    const a = kindOf.get(e.from), b = kindOf.get(e.to);
    if (!a || !b || a === "note" || b === "note" || e.from === e.to || a === "end" || b === "start") continue;
    const pair = `${e.from}>${e.to}`;
    if (pairs.has(pair)) continue;
    pairs.add(pair);
    let id = typeof e.id === "string" && ID.test(e.id) && !ids.has(e.id) ? e.id : `e-${e.from}-${e.to}`.slice(0, 40);
    while (ids.has(id)) id = `${id.slice(0, 36)}-${ids.size}`;
    ids.add(id);
    edges.push({ id, from: e.from, to: e.to, label: str(e.label, FLOW_LIMITS.label) || null });
  }
  return { nodes, edges };
}

const byPos = (a: FlowNode, b: FlowNode) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id);

/** Os nós de onde o fluxo começa: os de início, ou (sem início) os que não recebem ligação. */
function roots(f: Flow) {
  const starts = f.nodes.filter((n) => n.kind === "start");
  if (starts.length) return starts.sort(byPos);
  const incoming = new Set(f.edges.map((e) => e.to));
  return f.nodes.filter((n) => n.kind !== "note" && !incoming.has(n.id)).sort(byPos);
}

/** Ordem de execução: em largura a partir do início, os vizinhos de cima para baixo; o que ficou solto vai no fim. */
export function executionOrder(f: Flow): FlowNode[] {
  const byId = new Map(f.nodes.map((n) => [n.id, n]));
  const out = new Map<string, FlowNode[]>();
  for (const e of f.edges) out.set(e.from, [...(out.get(e.from) ?? []), byId.get(e.to)!]);
  const seen = new Set<string>();
  const order: FlowNode[] = [];
  const queue = [...roots(f)];
  for (const r of queue) seen.add(r.id);
  while (queue.length) {
    const n = queue.shift()!;
    order.push(n);
    for (const m of [...(out.get(n.id) ?? [])].sort(byPos)) if (!seen.has(m.id)) { seen.add(m.id); queue.push(m); }
  }
  const rest = f.nodes.filter((n) => !seen.has(n.id) && n.kind !== "note").sort(byPos);
  return [...order, ...rest].filter(isWork);
}

/** As etapas do processo (o "Usar" cria uma tarefa para cada uma): etapas e decisões na ordem de execução. */
export function stepsOf(f: Flow): { title: string; detail: string | null }[] {
  const byId = new Map(f.nodes.map((n) => [n.id, n]));
  return executionOrder(f).map((n) => {
    const branches = n.kind === "decision"
      ? f.edges.filter((e) => e.from === n.id).map((e) => `${e.label ?? "Segue"} → ${byId.get(e.to)?.title ?? "?"}`).join(" · ")
      : "";
    const detail = [n.detail, branches || null, n.owner ? `Responsável: ${n.owner}` : null].filter(Boolean).join("\n");
    return { title: n.kind === "decision" ? `Decidir: ${n.title}` : n.title, detail: detail || null };
  });
}

/** Fluxograma de uma lista de etapas (processos de antes do fluxograma): início, as etapas em fila e o fim. */
export function flowFromSteps(steps: { title: string; detail?: string | null }[]): Flow {
  const ids = steps.map((_, i) => `s${i + 1}`);
  const gap = 130;
  const nodes: FlowNode[] = [
    { id: "inicio", kind: "start", x: 30, y: 0, title: "Início", detail: null, owner: null, link: null },
    ...steps.map((s, i): FlowNode => ({ id: ids[i]!, kind: "step", x: 0, y: (i + 1) * gap, title: s.title, detail: s.detail ?? null, owner: null, link: null })),
    { id: "fim", kind: "end", x: 30, y: (steps.length + 1) * gap, title: "Fim", detail: null, owner: null, link: null },
  ];
  const chain = ["inicio", ...ids, "fim"];
  return { nodes, edges: chain.slice(1).map((to, i) => ({ id: `e${i + 1}`, from: chain[i]!, to, label: null })) };
}

/**
 * Organiza o fluxograma em camadas de cima para baixo: cada nó fica uma camada abaixo do mais fundo que liga
 * nele (ligações que voltam, como "refazer", não empurram); dentro da camada, perto da média dos pais. As notas
 * ficam onde estão.
 */
export function layoutFlow(f: Flow, gapX = 270, gapY = 150): Flow {
  const work = f.nodes.filter((n) => n.kind !== "note");
  const byId = new Map(work.map((n) => [n.id, n]));
  // ordem em largura: define o que é ligação "para a frente"
  const order = new Map<string, number>();
  const queue = roots(f).filter((n) => n.kind !== "note");
  queue.forEach((n) => order.set(n.id, order.size));
  const out = new Map<string, string[]>();
  for (const e of f.edges) out.set(e.from, [...(out.get(e.from) ?? []), e.to]);
  for (let i = 0; i < queue.length; i++) {
    for (const t of out.get(queue[i]!.id) ?? []) if (!order.has(t) && byId.has(t)) { order.set(t, order.size); queue.push(byId.get(t)!); }
  }
  for (const n of [...work].sort(byPos)) if (!order.has(n.id)) order.set(n.id, order.size);
  const level = new Map<string, number>();
  const sorted = [...work].sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  for (const n of sorted) level.set(n.id, 0);
  for (const n of sorted) {
    for (const t of out.get(n.id) ?? []) {
      if (!byId.has(t) || order.get(t)! <= order.get(n.id)!) continue; // volta: não empurra
      level.set(t, Math.max(level.get(t)!, level.get(n.id)! + 1));
    }
  }
  const parents = new Map<string, string[]>();
  for (const e of f.edges) if (byId.has(e.to) && order.get(e.from)! < order.get(e.to)!) parents.set(e.to, [...(parents.get(e.to) ?? []), e.from]);
  const rows = new Map<number, FlowNode[]>();
  for (const n of sorted) rows.set(level.get(n.id)!, [...(rows.get(level.get(n.id)!) ?? []), n]);
  const pos = new Map<string, { x: number; y: number }>();
  for (const l of [...rows.keys()].sort((a, b) => a - b)) {
    const row = rows.get(l)!;
    const want = (n: FlowNode) => {
      const ps = (parents.get(n.id) ?? []).map((p) => pos.get(p)?.x).filter((x): x is number => x != null);
      return ps.length ? ps.reduce((t, x) => t + x, 0) / ps.length : 0;
    };
    row.sort((a, b) => want(a) - want(b) || order.get(a.id)! - order.get(b.id)!);
    const width = (row.length - 1) * gapX;
    const center = row.reduce((t, n) => t + want(n), 0) / row.length;
    row.forEach((n, i) => pos.set(n.id, { x: Math.round(center - width / 2 + i * gapX), y: l * gapY }));
  }
  return {
    edges: f.edges,
    nodes: f.nodes.map((n) => {
      const p = pos.get(n.id);
      if (!p) return n;
      return { ...n, x: p.x - Math.round(NODE_KINDS[n.kind].w / 2), y: p.y };
    }),
  };
}

/** Retângulo que cobre todos os nós (para enquadrar e para o minimapa). */
export function flowBounds(f: Flow) {
  if (!f.nodes.length) return { x: 0, y: 0, w: 800, h: 500 };
  const x0 = Math.min(...f.nodes.map((n) => n.x)), y0 = Math.min(...f.nodes.map((n) => n.y));
  const x1 = Math.max(...f.nodes.map((n) => n.x + NODE_KINDS[n.kind].w)), y1 = Math.max(...f.nodes.map((n) => n.y + NODE_KINDS[n.kind].h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Um id que ainda não existe no fluxograma. */
export function newId(f: Flow, prefix = "n") {
  const used = new Set([...f.nodes.map((n) => n.id), ...f.edges.map((e) => e.id)]);
  let i = f.nodes.length + f.edges.length + 1;
  while (used.has(`${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}

/** O processo em texto, para a IA ler: etapas na ordem, quem faz, as decisões com cada caminho e as notas. */
export function flowText(p: { title: string; description: string | null; flow: Flow }) {
  const byId = new Map(p.flow.nodes.map((n) => [n.id, n]));
  const lines = [`## ${p.title}`];
  if (p.description) lines.push(`Para que serve: ${p.description}`);
  executionOrder(p.flow).forEach((n, i) => {
    const outs = p.flow.edges.filter((e) => e.from === n.id);
    const extra = [n.owner ? `responsável: ${n.owner}` : null, n.link ? `no app: ${n.link}` : null].filter(Boolean).join("; ");
    if (n.kind === "decision") {
      lines.push(`${i + 1}. Decisão: ${n.title}${extra ? ` (${extra})` : ""}`);
      for (const e of outs) lines.push(`   - ${e.label ?? "segue"}: ${byId.get(e.to)?.title ?? "?"}`);
    } else {
      lines.push(`${i + 1}. ${n.title}${extra ? ` (${extra})` : ""}`);
      if (outs.length > 1) for (const e of outs) lines.push(`   - ${e.label ? `${e.label}: ` : ""}vai para ${byId.get(e.to)?.title ?? "?"}`);
    }
    if (n.detail) lines.push(`   ${n.detail.replace(/\n/g, " ")}`);
  });
  for (const n of p.flow.nodes.filter((x) => x.kind === "note" && (x.title || x.detail))) lines.push(`Nota: ${[n.title, n.detail].filter(Boolean).join(" — ")}`);
  return lines.join("\n");
}

/** Páginas do app que uma etapa pode indicar ("onde fazer"). */
export const APP_PAGES: [path: string, label: string][] = [
  ["/app/crm", "CRM Passagens"], ["/app/crm-milhas", "CRM Milhas"], ["/app/buscador", "Buscador"], ["/app/chat-balcoes", "Chat Balcões"], ["/app/balcao-milhasx", "Balcão MilhasX"],
  ["/app/sales", "Vendas"], ["/app/acompanhamentos/voos", "Acompanhamentos › Voos"], ["/app/acompanhamentos/hospedagens", "Acompanhamentos › Hospedagens"],
  ["/app/acompanhamentos/mapa", "Mapa de viagens"], ["/app/financeiro", "Financeiro"], ["/app/calendario", "Calendário"], ["/app/equipe/tarefas", "Tarefas"],
  ["/app/contatos/passageiros", "Passageiros"], ["/app/milhas/sugerir", "Sugerir Conta"], ["/app/programs", "Programas e contas"],
];
export const pageLabel = (path: string | null) => (path ? APP_PAGES.find(([p]) => p === path)?.[1] ?? path : null);

/* ---------------- Modelos ---------------- */

type Draft = { key: string; kind: NodeKind; title: string; detail?: string; owner?: string; link?: string };
/** Monta um fluxograma organizado a partir de caixas com chave e ligações por chave. */
export function buildFlow(items: Draft[], links: [from: string, to: string, label?: string][]): Flow {
  const nodes: FlowNode[] = items.map((d, i) => ({ id: `n${i + 1}`, kind: d.kind, x: 0, y: 0, title: d.title, detail: d.detail ?? null, owner: d.owner ?? null, link: d.link ?? null }));
  const idOf = new Map(items.map((d, i) => [d.key, `n${i + 1}`]));
  const edges = links.flatMap(([a, b, label], i) => (idOf.has(a) && idOf.has(b) ? [{ id: `e${i + 1}`, from: idOf.get(a)!, to: idOf.get(b)!, label: label ?? null }] : []));
  return layoutFlow(cleanFlow({ nodes, edges }));
}

export const TEMPLATES: { title: string; description: string; flow: () => Flow }[] = [
  {
    title: "Emissão de passagem com milhas",
    description: "Do pedido do cliente até a reserva confirmada",
    flow: () => buildFlow([
      { key: "i", kind: "start", title: "Pedido do cliente" },
      { key: "a", kind: "step", title: "Confirmar trecho, datas e passageiros", owner: "Atendimento", link: "/app/crm" },
      { key: "b", kind: "step", title: "Buscar a melhor opção", owner: "Emissor", link: "/app/buscador" },
      { key: "c", kind: "step", title: "Enviar a cotação", owner: "Atendimento" },
      { key: "d", kind: "decision", title: "O cliente aprovou?" },
      { key: "e", kind: "step", title: "Ajustar a cotação", detail: "Outra data, outro programa ou outra classe" },
      { key: "f", kind: "step", title: "Receber o pagamento", owner: "Financeiro" },
      { key: "g", kind: "step", title: "Escolher a conta e emitir", owner: "Emissor", link: "/app/milhas/sugerir" },
      { key: "h", kind: "step", title: "Registrar a venda", owner: "Emissor", link: "/app/sales" },
      { key: "j", kind: "step", title: "Enviar o localizador ao cliente", owner: "Atendimento" },
      { key: "k", kind: "end", title: "Reserva confirmada" },
      { key: "x", kind: "end", title: "Cliente desistiu" },
    ], [["i", "a"], ["a", "b"], ["b", "c"], ["c", "d"], ["d", "f", "Sim"], ["d", "e", "Não"], ["e", "c"], ["e", "x", "Desistiu"], ["f", "g"], ["g", "h"], ["h", "j"], ["j", "k"]]),
  },
  {
    title: "Reembolso de venda",
    description: "Quando o cliente desiste em até 24 horas",
    flow: () => buildFlow([
      { key: "i", kind: "start", title: "Cliente pediu o cancelamento" },
      { key: "a", kind: "decision", title: "Está dentro das 24 horas?", link: "/app/sales" },
      { key: "b", kind: "step", title: "Cancelar a emissão no site da companhia", owner: "Emissor" },
      { key: "c", kind: "step", title: "Marcar a venda como reembolsada", detail: "Com a taxa de administração", link: "/app/sales" },
      { key: "d", kind: "step", title: "Acompanhar o estorno das milhas e da taxa", owner: "Financeiro" },
      { key: "e", kind: "step", title: "Devolver ao cliente o valor menos a taxa", owner: "Financeiro", link: "/app/financeiro" },
      { key: "f", kind: "step", title: "Explicar a regra de remarcação e multa", owner: "Atendimento" },
      { key: "k", kind: "end", title: "Reembolso concluído" },
      { key: "x", kind: "end", title: "Sem reembolso" },
    ], [["i", "a"], ["a", "b", "Sim"], ["a", "f", "Não"], ["b", "c"], ["c", "d"], ["d", "e"], ["e", "k"], ["f", "x"]]),
  },
  {
    title: "Check-in e embarque",
    description: "Do check-in aberto até o cliente embarcar",
    flow: () => buildFlow([
      { key: "i", kind: "start", title: "Check-in abriu (2 dias antes)" },
      { key: "a", kind: "step", title: "Ver os check-ins pendentes", link: "/app/acompanhamentos/voos", owner: "Atendimento" },
      { key: "b", kind: "step", title: "Fazer o check-in no site da companhia", owner: "Emissor" },
      { key: "c", kind: "decision", title: "Precisa de assento ou bagagem?" },
      { key: "d", kind: "step", title: "Vender o adicional", link: "/app/sales" },
      { key: "e", kind: "step", title: "Enviar o cartão de embarque ao cliente", owner: "Atendimento" },
      { key: "f", kind: "step", title: "Marcar \"Check-in feito\"", link: "/app/acompanhamentos/voos" },
      { key: "k", kind: "end", title: "Pronto para embarcar" },
    ], [["i", "a"], ["a", "b"], ["b", "c"], ["c", "d", "Sim"], ["c", "e", "Não"], ["d", "e"], ["e", "f"], ["f", "k"]]),
  },
];
