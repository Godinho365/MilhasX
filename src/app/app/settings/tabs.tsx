"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { refreshSafe } from "@/lib/nav";
import { useEffect, useState } from "react";
import { Copy, Gift, ExternalLink } from "lucide-react";
import { api } from "@/lib/api";
import { fmtBRL } from "@/lib/format";
import { Field, Alert } from "@/components/ui";
import { toast, confirmDialog } from "@/components/feedback";
import { Switch } from "@/components/form-parts";
import { PLANS, REFERRAL_TRIAL_DAYS, TRIAL_DAYS, type PlanCode, type PlanInterval } from "@/domain/plans";
import { Section } from "./client";

type Billing = {
  plan: PlanCode;
  effective: PlanCode;
  trialDaysLeft: number;
  trialEndsAt: string | null;
  interval: PlanInterval;
  monthlyCents: number;
  request: { plan: PlanCode; interval: PlanInterval; at: string } | null;
  online: boolean;
  subscription: { plan: PlanCode; interval: PlanInterval; amountCents: number; status: string; since: string } | null;
};

const CHECKOUT_MSG = {
  ok: ["Pagamento confirmado! Sua assinatura está ativa.", "border-green-500/30 bg-green-500/10"],
  pendente: ["Recebemos sua assinatura. Assim que o Mercado Pago confirmar o pagamento, o plano é ativado.", "border-amber-500/30 bg-amber-500/10"],
  erro: ["Não foi possível confirmar a assinatura agora. Se o pagamento foi feito, ela é ativada em instantes.", "border-red-500/30 bg-red-500/10"],
} as const;

export function BillingTab({ state, checkout }: { state: Billing; checkout: keyof typeof CHECKOUT_MSG | null }) {
  const router = useRouter();
  async function cancelSub() {
    if (!(await confirmDialog({ title: "Cancelar assinatura?", body: "A cobrança recorrente no Mercado Pago é encerrada e a conta volta ao plano Pessoal.", confirmLabel: "Cancelar assinatura", danger: true }))) return;
    const r = await api("/api/billing/subscription", "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    toast("Assinatura cancelada");
    refreshSafe(router);
  }
  async function cancelRequest() {
    const r = await api("/api/billing", "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    toast("Pedido cancelado");
    refreshSafe(router);
  }
  const p = PLANS[state.plan];
  return (
    <>
      {checkout && <div className={`mb-6 rounded-xl border px-4 py-3 text-sm ${CHECKOUT_MSG[checkout][1]}`} role="status">{CHECKOUT_MSG[checkout][0]}</div>}
      {state.trialDaysLeft > 0 && (
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm" role="status">
          Você está experimentando o <b>Gestor</b>. {state.trialDaysLeft} {state.trialDaysLeft === 1 ? "dia restante" : "dias restantes"}.
        </div>
      )}
      <Section title="Plano atual">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xl font-semibold">{PLANS[state.effective].name}{state.trialDaysLeft > 0 && <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 align-middle text-xs font-medium text-amber-300">Teste</span>}</p>
            <p className="text-sm text-muted">{PLANS[state.effective].tagline}</p>
          </div>
          <Link href="/app/upgrade" className="btn-primary">Alterar plano</Link>
        </div>
        <dl className="mt-5 divide-y divide-line text-sm">
          <div className="flex justify-between py-2"><dt className="text-muted">Assinatura base ({p.name}{state.plan !== "PESSOAL" ? `, ${state.interval === "ANUAL" ? "anual" : "mensal"}` : ""})</dt><dd className="tabular-nums">{fmtBRL(state.monthlyCents)}/mês</dd></div>
          <div className="flex justify-between py-2 font-semibold"><dt>Total mensal</dt><dd className="tabular-nums">{fmtBRL(state.monthlyCents)}</dd></div>
        </dl>
        <p className="mt-2 text-xs text-muted">Sem fidelidade: você pode trocar de plano quando quiser.</p>
      </Section>
      {state.request && (
        <Section title="Pedido em andamento">
          <div className="flex flex-wrap items-center gap-3">
            <p className="min-w-0 flex-1 text-sm">Você pediu o plano <b>{PLANS[state.request.plan].name}</b> ({state.request.interval === "ANUAL" ? "anual" : "mensal"}) em {new Date(state.request.at).toLocaleDateString("pt-BR")}. A administração ativa o plano e avisa por notificação.</p>
            <button className="btn-ghost" onClick={cancelRequest}>Cancelar pedido</button>
          </div>
        </Section>
      )}
      {state.subscription && (
        <Section title="Assinatura no Mercado Pago">
          <div className="flex flex-wrap items-center gap-3">
            <p className="min-w-0 flex-1 text-sm">
              {PLANS[state.subscription.plan].name} {state.subscription.interval === "ANUAL" ? "anual" : "mensal"} · {fmtBRL(state.subscription.amountCents)} {state.subscription.interval === "ANUAL" ? "por ano" : "por mês"}
              {state.subscription.status === "PAUSED" && <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300">Pausada</span>}
            </p>
            <button className="btn-ghost text-red-300" onClick={cancelSub}>Cancelar assinatura</button>
          </div>
        </Section>
      )}
      <Section title="Métodos de pagamento">
        <p className="text-sm text-muted">
          {state.online
            ? "O pagamento é feito no Mercado Pago (cartão de crédito). Os dados do cartão ficam só no Mercado Pago; este app não vê nem guarda o cartão."
            : "Esta instalação não faz cobranças online: a ativação dos planos é feita pela administração. Nenhum cartão é solicitado ou guardado."}
        </p>
      </Section>
    </>
  );
}

export function ReferralsTab({ state }: { state: { code: string; referred: { name: string; createdAt: string }[]; creditMonths: number } }) {
  const [link, setLink] = useState(`/register?ref=${state.code}`);
  useEffect(() => setLink(`${window.location.origin}/register?ref=${state.code}`), [state.code]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast("Link copiado");
    } catch {
      toast("Não foi possível copiar. Selecione o link e copie manualmente.", "error");
    }
  }
  return (
    <>
      <Section title="Seu link de indicação">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-light"><Gift className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1 space-y-3">
            <p className="text-sm">Quem se cadastrar pelo seu link ganha <b>{REFERRAL_TRIAL_DAYS} dias</b> de teste em vez de {TRIAL_DAYS}, e você ganha <b>1 mês de crédito</b> por indicação.</p>
            <div className="flex gap-2">
              <input className="input min-w-0 flex-1 font-mono text-xs" value={link} readOnly aria-label="Link de indicação" onFocus={(e) => e.currentTarget.select()} />
              <button className="btn-ghost" onClick={copy}><Copy className="h-4 w-4" />Copiar</button>
            </div>
            <p className="text-xs text-muted">O crédito entra quando o indicado inicia o teste.</p>
          </div>
        </div>
      </Section>
      <Section title="Suas indicações">
        <p className="mb-3 text-sm"><b className="tabular-nums">{state.creditMonths}</b> {state.creditMonths === 1 ? "mês de crédito" : "meses de crédito"}</p>
        {state.referred.length === 0 ? (
          <p className="text-sm text-muted">Ninguém se cadastrou pelo seu link ainda.</p>
        ) : (
          <ul className="divide-y divide-line text-sm" aria-label="Pessoas indicadas">
            {state.referred.map((r, i) => (
              <li key={i} className="flex justify-between py-2"><span>{r.name}</span><span className="text-muted">{new Date(r.createdAt).toLocaleDateString("pt-BR")}</span></li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

type Profile = { slug: string; displayName: string; bio: string | null; whatsapp: string | null; instagram: string | null; email: string | null; programIds: string[]; published: boolean; acceptsOrders: boolean; acceptsLeads: boolean; headline: string | null } | null;

const slugify = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

export function SalesProfileTab({ profile, defaultName, programs, brand }: { profile: Profile; defaultName: string; programs: { id: string; name: string }[]; brand: string }) {
  const router = useRouter();
  const [f, setF] = useState({
    slug: profile?.slug ?? slugify(defaultName),
    displayName: profile?.displayName ?? defaultName,
    bio: profile?.bio ?? "",
    whatsapp: profile?.whatsapp ?? "",
    instagram: profile?.instagram ?? "",
    email: profile?.email ?? "",
    programIds: profile?.programIds ?? [],
    published: profile?.published ?? false,
    acceptsOrders: profile?.acceptsOrders ?? true,
    acceptsLeads: profile?.acceptsLeads ?? true,
    headline: profile?.headline ?? "",
  });
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await api("/api/sales-profile", "PUT", f);
    setBusy(false);
    if (!r.ok) return setErro(r.erro);
    setErro("");
    toast("Perfil público salvo");
    refreshSafe(router);
  }
  return (
    <form onSubmit={save}>
      <p className="mb-6 text-sm text-muted">Sua página na {brand}: a Central de Atendimento onde clientes pedem cotação, mostram interesse em gestão de milhas e falam com você no WhatsApp.</p>
      {erro && <div className="mb-4"><Alert>{erro}</Alert></div>}
      <Section title="Apresentação">
        <div className="space-y-4">
          <Field label="Frase de abertura" hint="Aparece abaixo do seu nome. Padrão: “Sua viagem começa aqui”"><input className="input" value={f.headline} onChange={(e) => set("headline", e.target.value)} maxLength={120} placeholder="Sua viagem começa aqui" /></Field>
          <Field label="Sobre você" hint="Até 500 caracteres"><textarea className="input min-h-24" value={f.bio} onChange={(e) => set("bio", e.target.value)} maxLength={500} placeholder="Ex.: Emito passagens com milhas há 5 anos, atendimento pelo WhatsApp." /></Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nome de exibição" required><input className="input" value={f.displayName} onChange={(e) => set("displayName", e.target.value)} required minLength={2} maxLength={80} /></Field>
            <Field label="Endereço da página" required hint={`/p/${f.slug || "seu-nome"}`}><input className="input" value={f.slug} onChange={(e) => set("slug", slugify(e.target.value))} required minLength={3} maxLength={40} /></Field>
          </div>
          <Field label="Programas com que você trabalha">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Programas com que você trabalha">
              {programs.map((p) => {
                const on = f.programIds.includes(p.id);
                return (
                  <button key={p.id} type="button" aria-pressed={on} onClick={() => set("programIds", on ? f.programIds.filter((x) => x !== p.id) : [...f.programIds, p.id])} className={`rounded-full border px-3 py-1 text-xs font-medium ${on ? "border-accent-light bg-accent-soft text-white" : "border-line text-muted hover:text-zinc-100"}`}>
                    {p.name}
                  </button>
                );
              })}
            </div>
          </Field>
        </div>
      </Section>
      <Section title="Contato">
        <p className="mb-4 text-sm text-muted">Só os contatos preenchidos aparecem na página pública.</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="WhatsApp"><input className="input" value={f.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} inputMode="tel" placeholder="(11) 90000-0000" maxLength={20} /></Field>
          <Field label="Instagram"><input className="input" value={f.instagram} onChange={(e) => set("instagram", e.target.value)} placeholder="@seuperfil" maxLength={31} /></Field>
          <Field label="E-mail de contato" className="sm:col-span-2"><input className="input" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} maxLength={200} /></Field>
        </div>
      </Section>
      <Section title="Publicação">
        <Switch label="Página pública ativa" hint="Desligada, ninguém consegue abrir o endereço" checked={f.published} onChange={(v) => set("published", v)} />
        <div className="mt-4"><Switch label="Receber pedidos de cotação" hint="Mostra o formulário “Pedir cotação”; os pedidos caem em CRM › Novos pedidos" checked={f.acceptsOrders} onChange={(v) => set("acceptsOrders", v)} /></div>
        <div className="mt-4"><Switch label="Receber interessados em gestão de milhas" hint="Mostra “Interesse em gestão de milhas”; os contatos aparecem em CRM › Lista" checked={f.acceptsLeads} onChange={(v) => set("acceptsLeads", v)} /></div>
        {profile?.published && (
          <a href={`/p/${profile.slug}`} target="_blank" rel="noopener" className="mt-3 inline-flex items-center gap-1.5 text-sm text-accent-light hover:underline"><ExternalLink className="h-4 w-4" />Ver página pública</a>
        )}
      </Section>
      <button className="btn-primary" disabled={busy}>{busy ? "Salvando…" : "Salvar perfil público"}</button>
    </form>
  );
}
