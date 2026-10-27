// Conteúdo inicial próprio (guias, novidades e promoções de exemplo). Idempotente.
import type { PrismaClient } from "@prisma/client";

const GUIDES = [
  {
    slug: "primeiros-passos", kind: "VIDEO", order: 1, level: "BEGINNER", minutes: 4, tags: ["Início"],
    title: "Primeiros passos", summary: "Cadastre titulares, contas e o saldo inicial de cada programa.",
    body: `## 1. Cadastre os titulares
Em Programas, use “Titular” para cadastrar cada pessoa dona de contas (você, familiares, clientes).

## 2. Adicione as contas
Ainda em Programas, use “Conta” para ligar o titular a cada programa (Livelo, LATAM Pass, Smiles…).

## 3. Lance o saldo atual
Pelo botão “Novo lançamento” → Crédito, escolha a categoria “Saldo inicial”. Se você sabe quanto pagou por esses pontos, informe o valor: o custo do milheiro passa a refletir isso.`,
  },
  {
    slug: "painel-inicial", kind: "VIDEO", order: 2, level: "BEGINNER", minutes: 3, tags: ["Painel"],
    title: "Painel inicial", summary: "Entenda os três modos do painel: Visão Geral, Vendas e Gestão.",
    body: `O seletor ao lado do titular, no topo, troca o modo do painel.

- Visão Geral: saldo, evolução e últimas movimentações.
- Vendas: faturamento, lucro e milhas vendidas por mês.
- Gestão: titulares lado a lado, com contas, saldo e CPM de cada um.`,
  },
  {
    slug: "cadastro-de-movimentacoes", kind: "VIDEO", order: 3, level: "BEGINNER", minutes: 5, tags: ["Extrato"],
    title: "Cadastro de movimentações", summary: "Crédito, débito, transferência e lançamentos em lote.",
    body: `## Crédito
Entrada de pontos: compra, cartão, clube, voo, hotel, bônus. Informe o valor pago quando houver.

## Débito
Saída de pontos: emissão de passagem, reserva, produto ou expiração. O custo sai da conta na proporção do CPM médio.

## Transferência
Leva os pontos e o custo da origem para o destino. O bônus divide esse custo, por isso o CPM no destino cai.

## Lote
Vários lançamentos de uma vez. Se uma linha tiver erro, nenhuma é gravada.`,
  },
  {
    slug: "cartoes-de-credito", kind: "VIDEO", order: 4, level: "BEGINNER", minutes: 4, tags: ["Cartões"],
    title: "Cartões de crédito", summary: "Acompanhe faturas e a pontuação esperada de cada cartão.",
    body: `Cadastre o cartão com os pontos por dólar e a conta que recebe os pontos. Adicione cada fatura com o valor; o app estima os pontos pela cotação informada.

Ao fechar a fatura, os pontos entram no extrato como “a receber”. Quando caírem no programa, marque como recebidos.`,
  },
  {
    slug: "como-ganhar-pontos", kind: "ARTICLE", order: 1, level: "BEGINNER", minutes: 5, tags: ["Cartões", "Bônus", "Promoções"],
    title: "Como ganhar pontos", summary: "As formas mais comuns de acumular pontos sem gastar a mais.",
    body: `## Cartão de crédito
Concentre os gastos do dia a dia num cartão que pontua bem e transfira para o programa certo na hora certa.

## Compras em parceiros
Lojas parceiras dão pontos por real gasto. Compare com o cashback: às vezes o dinheiro de volta vale mais.

## Clubes
A assinatura mensal dá pontos todo mês e costuma liberar bônus maiores em transferências.

## Transferências bonificadas
Transferir com 80% ou 100% de bônus pode reduzir muito o custo do milheiro. Use o simulador antes.`,
  },
  {
    slug: "entendendo-o-cpm", kind: "ARTICLE", order: 2, level: "INTERMEDIATE", minutes: 7, tags: ["Cálculos", "Métricas"],
    title: "Entendendo o CPM", summary: "Como calcular o custo real dos seus pontos e por que ele importa.",
    body: `CPM é o custo por milheiro: quanto você pagou por cada 1.000 pontos.

## A conta
CPM = valor pago ÷ pontos × 1.000. Pagar R$ 558 por 18.000 pontos dá CPM de R$ 31,00.

## Média ponderada
Quando você compra várias vezes, o CPM da conta é a média ponderada pelo número de pontos. Pontos ganhos sem custo (cartão, bônus) diluem a média.

## Transferências
O custo vai junto com os pontos. Com 25% de bônus, 20.000 pontos a CPM R$ 30,40 viram 25.000 pontos a CPM R$ 24,32.

## Para que serve
Compare o CPM com o valor de mercado do milheiro ou com o preço de uma passagem paga. Se o CPM for menor, vale acumular; se for maior, talvez seja melhor vender ou não comprar.`,
  },
  {
    slug: "tipos-de-programas", kind: "ARTICLE", order: 3, level: "BEGINNER", minutes: 6, tags: ["Bancários", "Aéreos"],
    title: "Tipos de programas", summary: "Bancários, aéreos e de varejo: o que muda entre eles.",
    body: `## Programas de pontos (bancários e de varejo)
Acumulam pelo cartão e por compras, e transferem para companhias aéreas e hotéis. São flexíveis: os pontos podem ir para onde houver a melhor promoção.

## Programas aéreos
Emitem passagens. Normalmente recebem transferências com bônus e têm regras próprias de validade.

## Dica
Mantenha os pontos no programa flexível até ter um objetivo claro, e só transfira quando houver bônus ou uma emissão definida.`,
  },
] as const;

const NEWS = [
  { title: "Novo painel com três modos", body: "Agora você escolhe entre Visão Geral, Vendas e Gestão no topo do painel.\n\nO modo escolhido fica salvo para a próxima visita.", daysAgo: 1 },
  { title: "Cartões de crédito e faturas", body: "Cadastre seus cartões, acompanhe as faturas e lance os pontos a receber ao fechar cada uma.", daysAgo: 3 },
  { title: "Lançamentos em lote", body: "Use “Novo lançamento” → Lote para registrar várias movimentações de uma vez.", daysAgo: 7 },
];

export async function seedContent(prisma: PrismaClient) {
  for (const g of GUIDES) {
    await prisma.guide.upsert({ where: { slug: g.slug }, update: {}, create: { ...g, tags: [...g.tags] } });
  }
  if ((await prisma.newsPost.count()) === 0) {
    for (const n of NEWS) {
      await prisma.newsPost.create({ data: { title: n.title, body: n.body, publishedAt: new Date(Date.now() - n.daysAgo * 86400_000) } });
    }
  }
  if ((await prisma.promotion.count()) === 0) {
    const byCode = async (code: string) => (await prisma.program.findUnique({ where: { code } }))?.id ?? null;
    const day = 86400_000;
    const now = Date.now();
    const promos = [
      { kind: "TRANSFER_BONUS", title: "Transferência Livelo → LATAM Pass com bônus (exemplo)", from: "LIVELO", to: "LATAM", bonus: 25, start: -2, end: 0 },
      { kind: "TRANSFER_BONUS", title: "Transferência Esfera → Smiles com bônus (exemplo)", from: "ESFERA", to: "SMILES", bonus: 80, start: -1, end: 8 },
      { kind: "CLUB", title: "Pontos extras ao assinar o clube (exemplo)", from: null, to: "AZUL", bonus: 0, start: -3, end: 12 },
      { kind: "PURCHASE_BONUS", title: "Compra de pontos com desconto (exemplo)", from: null, to: "LIVELO", bonus: 0, start: -20, end: -5 },
    ] as const;
    for (const p of promos) {
      await prisma.promotion.create({
        data: {
          kind: p.kind, title: p.title, bonusPercent: p.bonus,
          description: "Promoção fictícia para demonstração. Cadastre as promoções reais em Administração → Promoções.",
          fromProgramId: p.from ? await byCode(p.from) : null, toProgramId: p.to ? await byCode(p.to) : null,
          startsAt: new Date(now + p.start * day), endsAt: new Date(now + p.end * day),
        },
      });
    }
  }
  await prisma.appSetting.upsert({ where: { key: "supportEmail" }, update: {}, create: { key: "supportEmail", value: process.env.SUPPORT_EMAIL || "suporte@milheiro.local" } });
}
