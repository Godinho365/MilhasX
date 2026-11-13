import { UtmKeeper } from "@/components/utm-keeper";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight, ArrowRightLeft, Bell, Briefcase, CalendarClock, Check, CreditCard, Layers, LineChart, LockKeyhole, Receipt, ShoppingBag, TrendingDown, Users, Wallet,
} from "lucide-react";
import { appName, currentUser } from "@/server/session";
import { PublicFooter, PublicHeader } from "@/components/public-header";
import { Pricing } from "@/components/landing/pricing";
import { TRIAL_DAYS } from "@/domain/plans";
import smiles from "../../prisma/program-logos/smiles.png";
import latam from "../../prisma/program-logos/latam-pass.png";
import azul from "../../prisma/program-logos/azul-fidelidade.png";
import livelo from "../../prisma/program-logos/livelo.png";
import esfera from "../../prisma/program-logos/esfera.png";
import tap from "../../prisma/program-logos/tap-miles-go.png";
import flyingBlue from "../../prisma/program-logos/flying-blue.png";
import iberia from "../../prisma/program-logos/iberia.png";
import connectmiles from "../../prisma/program-logos/connectmiles.png";
import accor from "../../prisma/program-logos/all-accor.png";
import itau from "../../prisma/program-logos/itau.png";
import nubank from "../../prisma/program-logos/nubank.png";
import c6 from "../../prisma/program-logos/c6-bank.png";
import btg from "../../prisma/program-logos/btg-pactual.png";
import inter from "../../prisma/program-logos/inter-loop.png";

export const metadata: Metadata = {
  description: "Gestão de milhas e pontos para quem acumula, compra e vende milhas: carteiras por titular, custo do milheiro, simulador de transferências, extrato, vendas e financeiro.",
};

const LOGOS = [
  ["Smiles", smiles], ["LATAM Pass", latam], ["Azul Fidelidade", azul], ["Livelo", livelo], ["Esfera", esfera], ["TAP Miles&Go", tap],
  ["Flying Blue", flyingBlue], ["Iberia Plus", iberia], ["ConnectMiles", connectmiles], ["ALL Accor", accor], ["Itaú", itau],
  ["Nubank", nubank], ["C6 Bank", c6], ["BTG Pactual", btg], ["Inter Loop", inter],
] as const;

const NAV = [
  { href: "#recursos", label: "Recursos" },
  { href: "#simulador", label: "Simulador" },
  { href: "#planos", label: "Planos" },
  { href: "#duvidas", label: "Dúvidas" },
];

const PROBLEMS = [
  { icon: TrendingDown, title: "Custo que muda toda hora", text: "Cada compra e cada bônus mudam o seu custo do milheiro. Sem conta feita, você vende no prejuízo sem perceber." },
  { icon: CalendarClock, title: "Promoções a todo momento", text: "Transferências bonificadas e compras com desconto aparecem e somem rápido. Decidir sem simular custa caro." },
  { icon: Layers, title: "Planilhas e ferramentas soltas", text: "Saldo numa planilha, vendas noutra, cartões no app do banco. Nada conversa e o retrabalho é grande." },
  { icon: Users, title: "Muitas contas, pouca visão", text: "Vários titulares e CPFs em vários programas. Fica difícil saber quanto tem, onde está e quando vence." },
];

const FEATURES = [
  { icon: ArrowRightLeft, title: "Compras e transferências", text: "Lance compras de pontos, transferências bonificadas, emissões e vencimentos. O custo médio é recalculado a cada movimento." },
  { icon: CreditCard, title: "Central de cartões", text: "Faturas, limites, parcelamentos e quanto cada cartão gera de pontos, tudo junto do restante da sua operação." },
  { icon: Bell, title: "Alertas", text: "Avisos de saldo abaixo do limite, pontos a receber e lançamentos agendados para você não perder prazo." },
  { icon: Receipt, title: "Financeiro", text: "Contas a pagar e a receber, notas fiscais e relatórios por período para fechar o mês sem planilha." },
];

const FAQ = [
  ["O que é o custo do milheiro?", "É quanto você pagou, em média, por cada mil milhas ou pontos de uma conta. O MilhasX calcula sozinho a partir das compras, transferências e bônus que você lança, e usa esse valor para mostrar o lucro de cada venda."],
  ["Preciso entender de milhas para usar?", "Não. Você cadastra os titulares e os programas, informa os saldos e vai lançando as movimentações. As contas (custo médio, saldo por programa, lucro) são feitas pelo sistema."],
  ["Serve para quem vende milhas ou emite passagens?", "Sim. O plano Gestor tem clientes, fornecedores, emissões, contas de terceiros e relatórios de lucro por venda, além de CRM de pedidos e acesso para a equipe."],
  ["Quantos titulares e programas posso cadastrar?", "Depende do plano: o Pessoal permite 1 titular e até 5 contas; o PRO, contas ilimitadas e até 2 titulares; o Gestor é para quem administra contas de terceiros."],
  ["Meus dados ficam seguros?", "Sim. A conexão é criptografada, senhas são guardadas com hash e credenciais de acesso aos programas ficam criptografadas. Não vendemos dados. Veja a Política de Privacidade."],
  ["O que acontece quando o teste grátis acaba?", `Depois dos ${TRIAL_DAYS} dias a conta continua funcionando no plano Pessoal, sem cobrança. Você só paga se escolher assinar o PRO ou o Gestor.`],
  ["Posso entrar com a minha Conta Google?", "Pode. No login e no cadastro há o botão do Google. Usamos apenas seu nome e e-mail para criar e acessar a conta."],
  ["Funciona no celular?", "Sim. O MilhasX roda no navegador e se adapta à tela do celular, do tablet e do computador. Não precisa instalar nada."],
];

/** Tela ilustrativa do painel (números de exemplo). */
function DashboardMock() {
  const rows = [
    ["Smiles", smiles, "182.400", "R$ 17,90"],
    ["LATAM Pass", latam, "96.000", "R$ 24,30"],
    ["Azul Fidelidade", azul, "143.250", "R$ 15,60"],
    ["Livelo", livelo, "60.000", "R$ 35,00"],
  ] as const;
  return (
    <div className="card p-4 shadow-2xl shadow-black/20 sm:p-5" aria-hidden>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted">Saldo total</p>
          <p className="text-2xl font-bold">481.650 <span className="text-sm font-medium text-muted">milhas</span></p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted">Custo médio</p>
          <p className="text-lg font-semibold text-accent-light">R$ 21,07</p>
        </div>
      </div>
      <div className="divide-y divide-line rounded-xl border border-line">
        {rows.map(([n, img, saldo, cpm]) => (
          <div key={n} className="flex items-center gap-3 px-3 py-2.5 text-sm">
            <Image src={img} alt="" width={28} height={28} className="rounded-lg" />
            <span className="flex-1 truncate font-medium">{n}</span>
            <span className="tabular-nums">{saldo}</span>
            <span className="w-20 text-right tabular-nums text-muted">{cpm}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-[11px] text-muted">Exemplo ilustrativo</p>
    </div>
  );
}

/** Simulação ilustrativa: 100 mil Livelo a R$ 35/milheiro, 80% de bônus para a Smiles = 180 mil milhas a R$ 19,44. */
function SimulatorMock() {
  return (
    <div className="card p-5 sm:p-6" aria-hidden>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <div className="rounded-xl border border-line p-4">
          <div className="flex items-center gap-2"><Image src={livelo} alt="" width={28} height={28} className="rounded-lg" /><span className="font-medium">Livelo</span></div>
          <p className="mt-3 text-xs text-muted">Pontos transferidos</p>
          <p className="text-lg font-semibold tabular-nums">100.000</p>
          <p className="mt-2 text-xs text-muted">Custo do milheiro</p>
          <p className="font-semibold tabular-nums">R$ 35,00</p>
        </div>
        <div className="flex flex-col items-center gap-1 text-accent-light">
          <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold">+80% de bônus</span>
          <ArrowRight className="rotate-90 sm:rotate-0" aria-hidden />
        </div>
        <div className="rounded-xl border border-line p-4">
          <div className="flex items-center gap-2"><Image src={smiles} alt="" width={28} height={28} className="rounded-lg" /><span className="font-medium">Smiles</span></div>
          <p className="mt-3 text-xs text-muted">Milhas recebidas</p>
          <p className="text-lg font-semibold tabular-nums">180.000</p>
          <p className="mt-2 text-xs text-muted">Novo custo do milheiro</p>
          <p className="font-semibold tabular-nums text-accent-light">R$ 19,44</p>
        </div>
      </div>
      <p className="mt-4 rounded-xl bg-accent-soft px-4 py-3 text-center text-sm">
        O custo do milheiro cai de <strong>R$ 35,00</strong> para <strong>R$ 19,44</strong>: queda de 44%.
      </p>
    </div>
  );
}

function SalesMock() {
  const rows = [
    ["Venda 120 mil Smiles", "Cliente A", "R$ 642,00"],
    ["Emissão GRU → LIS", "Cliente B", "R$ 1.180,00"],
    ["Venda 80 mil LATAM", "Cliente C", "R$ 356,00"],
  ];
  return (
    <div className="card p-5" aria-hidden>
      <div className="mb-4 grid grid-cols-3 gap-3 text-center">
        {[["Vendas no mês", "R$ 18.420"], ["Lucro", "R$ 4.910"], ["Margem", "26,7%"]].map(([l, v]) => (
          <div key={l} className="rounded-xl border border-line p-3">
            <p className="text-[11px] text-muted">{l}</p>
            <p className="font-semibold tabular-nums">{v}</p>
          </div>
        ))}
      </div>
      <div className="divide-y divide-line rounded-xl border border-line text-sm">
        {rows.map(([d, c, l]) => (
          <div key={d} className="flex items-center gap-3 px-3 py-2.5">
            <span className="min-w-0 flex-1"><span className="block truncate font-medium">{d}</span><span className="text-xs text-muted">{c}</span></span>
            <span className="tabular-nums text-green-400">+{l}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-[11px] text-muted">Exemplo ilustrativo</p>
    </div>
  );
}

function SectionTitle({ id, kicker, title, text }: { id: string; kicker: string; title: string; text?: string }) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center">
      <p className="text-sm font-semibold text-accent-light">{kicker}</p>
      <h2 id={id} className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
      {text && <p className="mt-3 text-muted">{text}</p>}
    </div>
  );
}

export default async function Home() {
  if (await currentUser()) redirect("/app");
  const name = appName();
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader name={name} links={NAV} />
      <main className="flex-1">
        {/* Hero */}
        <section className="bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.14),transparent_65%)]">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-2 lg:pt-20">
            <div className="text-center lg:text-left">
              <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs text-muted">
                <LineChart size={14} aria-hidden /> Gestão de milhas e pontos
              </p>
              <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">A plataforma completa para quem compra, vende e viaja com milhas</h1>
              <p className="mt-5 text-base text-muted sm:text-lg">
                Controle os saldos de cada titular em todos os programas, saiba o custo real do seu milheiro, simule transferências bonificadas e acompanhe
                o lucro de cada venda, num só lugar.
              </p>
              <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row lg:justify-start sm:justify-center">
                <Link href="/register" className="btn-primary h-11 px-6 text-base">Criar conta grátis</Link>
                <Link href="/login" className="btn-ghost h-11 px-6 text-base">Usar no navegador</Link>
              </div>
              <p className="mt-3 text-xs text-muted">{TRIAL_DAYS} dias de teste grátis. Sem cartão de crédito.</p>
            </div>
            <DashboardMock />
          </div>
        </section>

        {/* Programas */}
        <section className="border-y border-line py-8" aria-labelledby="programas">
          <h2 id="programas" className="mb-5 text-center text-sm text-muted">Funciona com os principais programas de fidelidade e bancos</h2>
          <div className="logo-marquee overflow-hidden">
            <div className="logo-track flex w-max gap-8">
              {[...LOGOS, ...LOGOS].map(([n, img], i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-muted" aria-hidden={i >= LOGOS.length}>
                  <Image src={img} alt="" width={32} height={32} className="rounded-lg" />
                  <span className="whitespace-nowrap">{n}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Simulador */}
        <section id="simulador" className="mx-auto max-w-5xl scroll-mt-20 px-4 py-16 sm:px-6" aria-labelledby="simulador-titulo">
          <SectionTitle id="simulador-titulo" kicker="Simulador de transferências" title="Veja quanto vale a promoção antes de transferir" text="Informe os pontos, o custo e o bônus: o MilhasX mostra quantas milhas você recebe e o novo custo do milheiro." />
          <SimulatorMock />
        </section>

        {/* Decisões com dados */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-accent-light">Decisões com números</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Saiba o custo real de cada milha</h2>
            <p className="mt-4 text-muted">
              O custo do milheiro é o número que separa uma boa venda de um prejuízo. O MilhasX recalcula esse valor a cada compra, transferência e
              bônus, por conta e por titular, para você saber exatamente por quanto vale a pena vender ou emitir.
            </p>
            <ul className="mt-5 space-y-2 text-sm">
              {["Saldo e custo médio por programa e por titular", "Extrato com a origem de cada milha", "Relatórios e métricas por período"].map((t) => (
                <li key={t} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-accent-light" aria-hidden />{t}</li>
              ))}
            </ul>
          </div>
          <DashboardMock />
        </section>

        {/* Problemas */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-labelledby="problemas">
          <SectionTitle id="problemas" kicker="Por que usar" title="Acompanhar o mercado de milhas sozinho é difícil" />
          <div className="grid gap-4 sm:grid-cols-2">
            {PROBLEMS.map((p) => (
              <div key={p.title} className="card flex gap-4 p-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-light"><p.icon size={20} aria-hidden /></div>
                <div>
                  <h3 className="font-semibold">{p.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{p.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Recursos */}
        <section id="recursos" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6" aria-labelledby="recursos-titulo">
          <SectionTitle id="recursos-titulo" kicker="Recursos" title="Tudo no seu radar" text="As ferramentas do dia a dia de quem trabalha com milhas, conectadas entre si." />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="card p-5">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent-light"><f.icon size={20} aria-hidden /></div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Gestor */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2">
          <SalesMock />
          <div>
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-accent-light"><Briefcase size={16} aria-hidden /> Para quem vende milhas</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Sua operação de vendas organizada</h2>
            <p className="mt-4 text-muted">
              Registre vendas de milhas e emissões de passagens, acompanhe o lucro de cada operação e mantenha clientes, passageiros e fornecedores
              num só lugar.
            </p>
            <ul className="mt-5 space-y-2 text-sm">
              {[
                "Lucro por venda calculado com o custo real das milhas",
                "CRM de pedidos, clientes e passageiros",
                "Contas de clientes e fornecedores",
                "Equipe com login próprio e permissões por função",
              ].map((t) => (
                <li key={t} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-accent-light" aria-hidden />{t}</li>
              ))}
            </ul>
            <Link href="/register" className="btn-ghost mt-6 h-10 px-5">Testar o plano Gestor <ArrowRight size={16} aria-hidden /></Link>
          </div>
        </section>

        {/* Planos */}
        <section id="planos" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6" aria-labelledby="planos-titulo">
          <SectionTitle id="planos-titulo" kicker="Planos" title="Comece grátis e evolua quando precisar" />
          <Pricing />
        </section>

        {/* Segurança */}
        <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6" aria-labelledby="seguranca">
          <div className="card flex flex-col gap-4 p-6 sm:flex-row sm:items-start">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-light"><LockKeyhole size={20} aria-hidden /></div>
            <div>
              <h2 id="seguranca" className="text-lg font-semibold">Seus dados protegidos</h2>
              <p className="mt-1 text-sm text-muted">
                Conexão criptografada, senhas guardadas com hash e credenciais dos programas criptografadas. Ao entrar com Google, usamos apenas seu nome e
                e-mail. Não vendemos seus dados. Leia a <Link href="/privacidade" className="underline">Política de Privacidade</Link> e os{" "}
                <Link href="/termos" className="underline">Termos de Serviço</Link>.
              </p>
            </div>
          </div>
        </section>

        {/* Dúvidas */}
        <section id="duvidas" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-16 sm:px-6" aria-labelledby="duvidas-titulo">
          <SectionTitle id="duvidas-titulo" kicker="Dúvidas" title="Perguntas frequentes" />
          <div className="space-y-3">
            {FAQ.map(([q, a]) => (
              <details key={q} className="card group p-0">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-medium">
                  {q}
                  <span className="text-xl leading-none text-muted transition-transform group-open:rotate-45" aria-hidden>+</span>
                </summary>
                <p className="px-5 pb-4 text-sm leading-relaxed text-muted">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Chamada final */}
        <section className="px-4 pb-20 pt-6 sm:px-6">
          <div className="mx-auto max-w-4xl rounded-card border border-line bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.16),transparent_70%)] px-6 py-12 text-center">
            <Wallet className="mx-auto mb-4 text-accent-light" size={28} aria-hidden />
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Comece a organizar suas milhas hoje</h2>
            <p className="mx-auto mt-3 max-w-xl text-muted">Crie sua conta em menos de um minuto, com e-mail ou com a sua Conta Google.</p>
            <Link href="/register" className="btn-primary mt-7 h-11 px-6 text-base"><ShoppingBag size={18} aria-hidden /> Criar conta grátis</Link>
            <p className="mt-3 text-xs text-muted">Sem cartão de crédito.</p>
          </div>
        </section>
      </main>
      <PublicFooter name={name} />
      <UtmKeeper />
    </div>
  );
}
