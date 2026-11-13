// Equipe com acesso próprio: cada membro entra com o login dele e trabalha nos dados da agência (do dono da conta),
// só nas áreas que a função dele permite. Cada área tem dois níveis: ver (consultar) e editar (criar, mudar,
// apagar; editar inclui ver). A checagem é central: a rota da API pelo caminho e pelo método (GET = ver, o resto =
// editar) e a página pelo endereço. O que não está mapeado aqui é negado para membros (o dono pode tudo).

export type Level = "view" | "edit";
export type AreaKey =
  | "painel" | "milhas" | "senhas" | "vendas" | "financeiro" | "crm" | "crmMilhas" | "chat" | "buscador"
  | "marketing" | "contatos" | "tarefas" | "metas" | "calendario" | "equipe" | "configuracoes";

/** Uma área do sistema: o que ela cobre e se tem o nível "editar" (algumas são só de leitura). */
export const AREAS: { key: AreaKey; label: string; hint: string; edit: boolean }[] = [
  { key: "painel", label: "Painel e relatórios", hint: "Painel inicial, métricas e relatórios", edit: false },
  { key: "milhas", label: "Milhas", hint: "Programas, contas, lançamentos, titulares, transferências, clubes e ViajeFácil", edit: true },
  { key: "senhas", label: "Senhas das contas", hint: "Ver = revelar o login e a senha guardados das contas de milhas (com a senha de quem pede); editar = salvar e apagar", edit: true },
  { key: "vendas", label: "Vendas", hint: "Vendas, emissões, reembolsos e os acompanhamentos (voos, hospedagens, mapa de viagens); editar = marcar check-in e confirmações", edit: true },
  { key: "financeiro", label: "Financeiro", hint: "Contas a pagar e receber, fluxo de caixa, cartões e faturas, notas fiscais", edit: true },
  { key: "crm", label: "CRM Passagens", hint: "Pedidos, funil, cotações e leads", edit: true },
  { key: "crmMilhas", label: "CRM Milhas", hint: "Negociações de venda de milhas", edit: true },
  { key: "chat", label: "Chat Balcões", hint: "Grupos, privado, contrapropostas e alertas (com as contas do Telegram da agência) e o Balcão MilhasX", edit: true },
  { key: "buscador", label: "Buscador de passagens", hint: "Pesquisa de voos em milhas", edit: true },
  { key: "marketing", label: "Marketing", hint: "Vitrine, site, criativos e tráfego", edit: true },
  { key: "contatos", label: "Contatos", hint: "Clientes, passageiros, fornecedores e interesses de viagem", edit: true },
  { key: "tarefas", label: "Tarefas e processos", hint: "Quadros de tarefas e os fluxogramas dos processos; ver = consultar e perguntar à IA, editar = desenhar, gerar com IA e usar", edit: true },
  { key: "calendario", label: "Calendário", hint: "Eventos da agência (criar, importar). Embarques, tarefas, aniversários e vencimentos aparecem conforme as outras áreas que a função vê", edit: true },
  { key: "metas", label: "Metas e comissões", hint: "Metas da equipe, regras de comissão, extrato e pagamentos (mostra quanto cada um ganha)", edit: true },
  { key: "equipe", label: "Equipe", hint: "Ver a equipe; editar = convidar, mudar funções e tirar acessos", edit: true },
  { key: "configuracoes", label: "Configurações", hint: "Configurações da agência e as contas do Telegram", edit: true },
];

export type Permission = `${AreaKey}:${Level}`;
const ALL_EDIT = AREAS.flatMap((a) => (a.edit ? [`${a.key}:edit` as Permission] : [`${a.key}:view` as Permission]));

/** Funções prontas (o dono escolhe uma e pode ajustar área por área: vira "Personalizada"). */
export const ROLES = {
  ADMIN: { label: "Administrador", hint: "Tudo, menos plano e assinatura", perms: ALL_EDIT },
  EMISSOR: {
    label: "Emissor",
    hint: "Emite e vende: milhas, vendas, CRMs, Chat Balcões e buscador",
    perms: ["painel:view", "milhas:edit", "senhas:edit", "vendas:edit", "crm:edit", "crmMilhas:edit", "chat:edit", "buscador:edit", "contatos:edit", "tarefas:edit", "calendario:edit", "equipe:view"] as Permission[],
  },
  ATENDIMENTO: {
    label: "Atendimento",
    hint: "Atende e negocia: CRMs, Chat Balcões, buscador e contatos (vendas só para consulta)",
    perms: ["vendas:view", "crm:edit", "crmMilhas:edit", "chat:edit", "buscador:edit", "contatos:edit", "tarefas:edit", "calendario:edit", "equipe:view"] as Permission[],
  },
  FINANCEIRO: {
    label: "Financeiro",
    hint: "Financeiro completo; vendas, milhas e relatórios para consulta",
    perms: ["painel:view", "financeiro:edit", "vendas:view", "milhas:view", "contatos:view", "tarefas:edit", "metas:edit", "calendario:edit", "equipe:view"] as Permission[],
  },
  CONTADOR: {
    label: "Contador",
    hint: "Só consulta: financeiro, vendas e relatórios",
    perms: ["painel:view", "financeiro:view", "vendas:view"] as Permission[],
  },
  COMERCIAL: {
    label: "Comercial",
    hint: "Propostas, negociação e acompanhamento: CRMs, cotações, buscador e contatos (vendas para consulta)",
    perms: ["painel:view", "crm:edit", "crmMilhas:edit", "buscador:edit", "contatos:edit", "vendas:view", "chat:view", "tarefas:edit", "calendario:edit", "equipe:view"] as Permission[],
  },
  OPORTUNIDADES: {
    label: "Oportunidades",
    hint: "Compra e venda de milhas: Chat Balcões, CRM Milhas e buscador (saldos para consulta)",
    perms: ["painel:view", "chat:edit", "crmMilhas:edit", "buscador:edit", "milhas:view", "contatos:edit", "tarefas:edit", "calendario:edit", "equipe:view"] as Permission[],
  },
  CONTAS: {
    label: "Contas",
    hint: "Saldos, contas e movimentações: milhas, titulares, transferências e as senhas das contas",
    perms: ["painel:view", "milhas:edit", "senhas:edit", "vendas:view", "contatos:view", "tarefas:edit", "calendario:edit", "equipe:view"] as Permission[],
  },
  COMPLIANCE: {
    label: "Compliance",
    hint: "Regras e riscos: consulta milhas, vendas, financeiro, CRMs e contatos; cuida dos processos",
    perms: ["painel:view", "milhas:view", "vendas:view", "financeiro:view", "crm:view", "crmMilhas:view", "contatos:view", "tarefas:edit", "calendario:view", "equipe:view"] as Permission[],
  },
  INTELIGENCIA: {
    label: "Inteligência",
    hint: "Indicadores e análises: painel e relatórios, com milhas, vendas, financeiro, CRMs e metas para consulta",
    perms: ["painel:view", "milhas:view", "vendas:view", "financeiro:view", "crm:view", "crmMilhas:view", "metas:view", "tarefas:edit", "calendario:view", "equipe:view"] as Permission[],
  },
  MARKETING: {
    label: "Marketing",
    hint: "Vitrine, site, criativos e tráfego; leads do CRM e contatos",
    perms: ["painel:view", "marketing:edit", "crm:view", "contatos:edit", "tarefas:edit", "calendario:edit", "equipe:view"] as Permission[],
  },
} satisfies Record<string, { label: string; hint: string; perms: Permission[] }>;
export type RoleKey = keyof typeof ROLES | "CUSTOM";
/** Todas as funções, para validar o que chega pela API. */
export const ROLE_KEYS = ["CUSTOM", ...(Object.keys(ROLES) as (keyof typeof ROLES)[])] as [RoleKey, ...RoleKey[]];
export const ROLE_LABEL: Record<RoleKey, string> = { ...Object.fromEntries(Object.entries(ROLES).map(([k, r]) => [k, r.label])), CUSTOM: "Personalizada" } as Record<RoleKey, string>;

const AREA_KEYS = new Set(AREAS.map((a) => a.key));
/** Só permissões válidas, sem repetir; "editar" de área só de leitura vira "ver". */
export function cleanPermissions(list: string[]): Permission[] {
  const out = new Set<Permission>();
  for (const p of list) {
    const [area, level] = p.split(":") as [AreaKey, Level];
    const a = AREAS.find((x) => x.key === area);
    if (!AREA_KEYS.has(area) || !a || (level !== "view" && level !== "edit")) continue;
    out.add(`${area}:${level === "edit" && !a.edit ? "view" : level}`);
  }
  return [...out].sort();
}
/** Permissões da função (as prontas) ou as escolhidas (Personalizada). */
export function rolePermissions(role: RoleKey, custom: string[] = []): Permission[] {
  return role === "CUSTOM" ? cleanPermissions(custom) : cleanPermissions(ROLES[role].perms);
}

/** O membro pode isto? "editar" inclui "ver". */
export function can(perms: readonly string[] | "ALL", area: AreaKey, level: Level = "view") {
  if (perms === "ALL") return true;
  return perms.includes(`${area}:edit`) || (level === "view" && perms.includes(`${area}:view`));
}

/** O que uma rota ou página exige: uma área, nada (todo mundo logado), só o dono, ou negado. */
export type Requirement = { area: AreaKey; level: Level } | "any" | "owner" | "deny";

/** Rotas da API (/api/...): o primeiro prefixo que bater vale (os mais específicos vêm antes). O terceiro item força o
 *  nível (um POST que só consulta, como revelar a senha). */
const API_RULES: [prefix: string, area: AreaKey | "any" | "owner", force?: Level][] = [
  // de todo mundo logado: a própria sessão, perfil, preferências, avisos, novidades, guias, assistente
  ["/api/me/deletion", "owner"], // fechar a conta é só do dono
  ["/api/auth/", "any"], ["/api/me", "any"], ["/api/preferences", "any"], ["/api/notifications", "any"], ["/api/push", "any"],
  ["/api/news", "any"], ["/api/guides", "any"], ["/api/assistant", "any"],
  // só o dono da conta: plano, assinatura e indicações
  ["/api/billing", "owner"], ["/api/referrals", "owner"],
  // mais específicos primeiro
  ["/api/accounts/*/credential/reveal", "senhas", "view"], ["/api/accounts/*/credential", "senhas"],
  ["/api/telegram/accounts", "configuracoes"],
  ["/api/telegram/", "chat"],
  ["/api/balcao", "chat"], // Balcão MilhasX: mesma área do Chat Balcões (ver = ofertas; editar = vincular e propor)
  ["/api/team/", "equipe"], ["/api/partners", "equipe"],
  ["/api/summary", "painel"], ["/api/reports", "painel"],
  ["/api/accounts", "milhas"], ["/api/entries", "milhas"], ["/api/holders", "milhas"], ["/api/programs", "milhas"],
  ["/api/transfers", "milhas"], ["/api/recurrences", "milhas"], ["/api/alerts", "milhas"], ["/api/viaje-facil", "milhas"],
  ["/api/supplier-accounts", "milhas"], ["/api/suppliers", "contatos"],
  ["/api/sales", "vendas"], ["/api/tracking", "vendas"], // acompanhamentos = itens das vendas
  ["/api/finance", "financeiro"], ["/api/invoices", "financeiro"], ["/api/cards", "financeiro"],
  ["/api/orders", "crm"], ["/api/pipelines", "crm"], ["/api/pipeline-stages", "crm"], ["/api/quotes", "crm"], ["/api/leads", "crm"],
  ["/api/miles-deals", "crmMilhas"],
  ["/api/flight-searches", "buscador"],
  ["/api/showcase", "marketing"], ["/api/site", "marketing"], ["/api/sales-profile", "marketing"],
  ["/api/traffic/meta", "marketing", "edit"], // conectar e desconectar o Meta (o retorno é um GET)
  ["/api/traffic", "marketing"],
  ["/api/customers", "contatos"], ["/api/passengers", "contatos"], ["/api/interests", "contatos"],
  ["/api/processes/ask", "tarefas", "view"], // perguntar à IA só lê os processos
  ["/api/tasks", "tarefas"], ["/api/task-boards", "tarefas"], ["/api/processes", "tarefas"],
  ["/api/goals", "metas"], ["/api/key-results", "metas"], ["/api/commissions", "metas"],
  ["/api/calendar/feed", "owner"], // o link do Google Agenda mostra tudo: só o dono gera
  ["/api/calendar", "calendario"],
];

/** Páginas do app (/app/...). */
const PAGE_RULES: [prefix: string, area: AreaKey | "any" | "owner"][] = [
  ["/app/upgrade", "owner"],
  ["/app/visao-geral", "any"], // cada bloco segue a função
  ["/app/notifications", "any"], ["/app/news", "any"], ["/app/guides", "any"], ["/app/calculadoras", "any"], ["/app/tradutor", "any"], ["/app/sem-acesso", "any"],
  ["/app/metricas", "painel"], ["/app/reports", "painel"],
  ["/app/programs", "milhas"], ["/app/entries", "milhas"], ["/app/milhas", "milhas"], ["/app/management", "contatos"], // management = Fornecedores
  ["/app/sales", "vendas"], ["/app/acompanhamentos", "vendas"],
  ["/app/financeiro", "financeiro"], ["/app/credit-cards", "financeiro"],
  ["/app/crm-milhas", "crmMilhas"], ["/app/crm", "crm"],
  ["/app/chat-balcoes", "chat"], ["/app/balcao-milhasx", "chat"],
  ["/app/buscador", "buscador"],
  ["/app/marketing", "marketing"],
  ["/app/contatos", "contatos"],
  ["/app/equipe/metas", "metas"], ["/app/equipe/", "tarefas"], ["/app/equipe", "equipe"],
  ["/app/calendario", "calendario"],
  ["/app/settings", "any"], // as abas da página seguem a função (perfil e preferências pessoais são de todos)
  ["/preview/central", "marketing"],
];

function matches(path: string, prefix: string) {
  if (prefix.includes("*")) {
    const re = new RegExp(`^${prefix.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]+")}(/|$)`);
    return re.test(path);
  }
  return prefix.endsWith("/") ? path.startsWith(prefix) : path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`);
}
function rule(rules: [string, AreaKey | "any" | "owner", Level?][], path: string, level: Level): Requirement {
  const hit = rules.find(([p]) => matches(path, p));
  if (!hit) return "deny";
  const [, area, force] = hit;
  if (area === "any" || area === "owner") return area;
  const a = AREAS.find((x) => x.key === area)!;
  return { area, level: force ?? (a.edit ? level : "view") };
}

/** O que a rota da API exige do membro (GET/HEAD = ver; o resto = editar). */
export function apiRequirement(path: string, method: string): Requirement {
  return rule(API_RULES, path, ["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase()) ? "view" : "edit");
}
/** O que a página exige do membro. A página inicial (/app) é de todo mundo: quem não vê o painel vai para a
 *  primeira área que pode. */
export function pageRequirement(path: string): Requirement {
  if (path === "/app" || path === "/app/") return "any";
  return rule(PAGE_RULES, path, "view");
}
/** O membro passa? (o dono passa sempre) */
export function allowed(req: Requirement, perms: readonly string[] | "ALL", isOwner: boolean) {
  if (isOwner) return true;
  if (req === "any") return true;
  if (req === "owner" || req === "deny") return false;
  return can(perms, req.area, req.level);
}

/** A primeira página que o membro pode abrir (para onde ele vai ao entrar ou quando cai numa que não pode). */
export function homeFor(perms: readonly string[] | "ALL") {
  const order: [AreaKey, string][] = [
    ["painel", "/app"], ["crm", "/app/crm"], ["crmMilhas", "/app/crm-milhas"], ["chat", "/app/chat-balcoes"], ["vendas", "/app/sales"],
    ["milhas", "/app/programs"], ["financeiro", "/app/financeiro"], ["contatos", "/app/contatos/passageiros"], ["buscador", "/app/buscador"],
    ["marketing", "/app/marketing/vitrine"], ["tarefas", "/app/equipe/tarefas"], ["metas", "/app/equipe/metas"], ["calendario", "/app/calendario"], ["equipe", "/app/equipe"], ["configuracoes", "/app/settings"],
  ];
  return order.find(([a]) => can(perms, a))?.[1] ?? "/app/sem-acesso";
}
