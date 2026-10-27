"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { refreshSafe } from "@/lib/nav";
import { useState } from "react";
import { Check } from "lucide-react";
import { api } from "@/lib/api";
import { fmtBRL } from "@/lib/format";
import { toast } from "@/components/feedback";
import { Field } from "@/components/ui";
import { PLANS, ANNUAL_DISCOUNT_PCT, planPriceCents, type PlanCode, type PlanInterval } from "@/domain/plans";

const STEPS = ["Plano", "Pagamento", "Confirmação"] as const;

export function UpgradeClient({ current, currentInterval, pending, online, hasSubscription, email }: { current: PlanCode; currentInterval: PlanInterval; pending: { plan: PlanCode; interval: PlanInterval } | null; online: boolean; hasSubscription: boolean; email: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [interval, setInterval] = useState<PlanInterval>(currentInterval);
  const [plan, setPlan] = useState<PlanCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [payer, setPayer] = useState(email);
  const paid = online && plan !== null && plan !== "PESSOAL";

  async function confirm() {
    if (!plan) return;
    setBusy(true);
    if (paid) {
      // Vai para o checkout do Mercado Pago; o plano muda quando o pagamento for confirmado
      const r = await api<{ checkoutUrl: string }>("/api/billing/checkout", "POST", { plan, interval, payerEmail: payer });
      if (!r.ok) {
        setBusy(false);
        return toast(r.erro, "error");
      }
      window.location.assign(r.data.checkoutUrl);
      return;
    }
    if (online && plan === "PESSOAL" && hasSubscription) {
      const r = await api("/api/billing/subscription", "DELETE");
      setBusy(false);
      if (!r.ok) return toast(r.erro, "error");
      toast("Assinatura cancelada");
      router.push("/app/settings?tab=billing");
      return;
    }
    const r = await api("/api/billing", "POST", { plan, interval });
    setBusy(false);
    if (!r.ok) return toast(r.erro, "error");
    setStep(2);
    refreshSafe(router);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <ol className="mb-6 flex flex-wrap items-center justify-center gap-2 text-sm" aria-label="Etapas">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2" aria-current={i === step ? "step" : undefined}>
            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${i <= step ? "bg-accent-light text-zinc-950" : "bg-panel2 text-muted"}`}>{i + 1}</span>
            <span className={i === step ? "font-semibold" : "hidden text-muted sm:inline"}>{s}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-4 bg-line sm:w-8" aria-hidden />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <>
          <div className="mb-5 flex justify-center">
            <div role="radiogroup" aria-label="Periodicidade" className="inline-flex gap-1 rounded-xl border border-line bg-panel p-1">
              {(["MENSAL", "ANUAL"] as const).map((k) => (
                <button key={k} role="radio" aria-checked={interval === k} onClick={() => setInterval(k)} className={`rounded-lg px-4 py-1.5 text-sm font-medium ${interval === k ? "bg-panel2 text-white shadow-sm" : "text-muted hover:text-zinc-100"}`}>
                  {k === "MENSAL" ? "Mensal" : <>Anual <span className="text-green-300">-{ANNUAL_DISCOUNT_PCT}%</span></>}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {(Object.keys(PLANS) as PlanCode[]).map((k) => {
              const p = PLANS[k];
              const isCurrent = k === current && (k === "PESSOAL" || interval === currentInterval);
              return (
                <section key={k} className={`card card-pad flex flex-col ${k === "GESTOR" ? "border-accent-light" : ""}`} aria-label={`Plano ${p.name}`}>
                  <h2 className="text-lg font-semibold">{p.name}</h2>
                  <p className="text-sm text-muted">{p.tagline}</p>
                  <p className="my-4 text-3xl font-semibold tabular-nums">{p.monthlyCents ? fmtBRL(planPriceCents(k, interval)) : "Grátis"}{p.monthlyCents > 0 && <span className="text-sm font-normal text-muted">/mês</span>}</p>
                  <ul className="mb-5 flex-1 space-y-2 text-sm">
                    {p.features.map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-green-300" />{f}</li>)}
                  </ul>
                  <button className={k === "GESTOR" ? "btn-primary" : "btn-ghost"} disabled={isCurrent} onClick={() => { setPlan(k); setStep(1); }}>
                    {isCurrent ? "Plano atual" : `Escolher ${p.name}`}
                  </button>
                </section>
              );
            })}
          </div>
          {pending && <p className="mt-4 text-center text-sm text-muted">Você já tem um pedido do plano {PLANS[pending.plan].name} aguardando ativação. Um novo pedido substitui o anterior.</p>}
        </>
      )}

      {step === 1 && plan && (
        <section className="card card-pad mx-auto max-w-lg space-y-4" aria-label="Pagamento">
          <h2 className="text-lg font-semibold">Resumo</h2>
          <dl className="divide-y divide-line text-sm">
            <div className="flex justify-between py-2"><dt className="text-muted">Plano</dt><dd>{PLANS[plan].name}</dd></div>
            <div className="flex justify-between py-2"><dt className="text-muted">Periodicidade</dt><dd>{plan === "PESSOAL" ? "-" : interval === "ANUAL" ? "Anual" : "Mensal"}</dd></div>
            <div className="flex justify-between py-2 font-semibold"><dt>Total mensal</dt><dd className="tabular-nums">{fmtBRL(planPriceCents(plan, interval))}</dd></div>
          </dl>
          {paid ? (
            <>
              <Field label="E-mail da sua conta Mercado Pago" hint="O pagamento é feito no site do Mercado Pago, com cartão de crédito.">
                <input className="input" type="email" value={payer} onChange={(e) => setPayer(e.target.value)} required maxLength={200} />
              </Field>
              <p className="rounded-lg bg-panel2 px-3 py-2 text-sm text-muted">Cobrança {interval === "ANUAL" ? "anual" : "mensal"} de {fmtBRL(planPriceCents(plan, interval) * (interval === "ANUAL" ? 12 : 1))}. Você pode cancelar quando quiser em Configurações › Assinatura.</p>
            </>
          ) : online && plan === "PESSOAL" ? (
            <p className="rounded-lg bg-panel2 px-3 py-2 text-sm text-muted">{hasSubscription ? "Ao confirmar, a assinatura no Mercado Pago é cancelada e a conta volta ao plano Pessoal." : "O plano Pessoal é gratuito."}</p>
          ) : (
            <p className="rounded-lg bg-panel2 px-3 py-2 text-sm text-muted">Não há cobrança automática nesta instalação. Ao confirmar, a administração recebe o seu pedido e ativa o plano.</p>
          )}
          <div className="flex justify-between gap-2">
            <button className="btn-ghost" onClick={() => setStep(0)}>Voltar</button>
            <button className="btn-primary" onClick={confirm} disabled={busy || (paid && !payer.trim())}>{busy ? "Enviando…" : paid ? "Pagar com Mercado Pago" : "Confirmar pedido"}</button>
          </div>
        </section>
      )}

      {step === 2 && plan && (
        <section className="card card-pad mx-auto max-w-lg space-y-3 text-center" aria-label="Confirmação">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-500/15 text-green-300"><Check className="h-6 w-6" /></span>
          <h2 className="text-lg font-semibold">Pedido enviado</h2>
          <p className="text-sm text-muted">Você vai receber uma notificação quando o plano {PLANS[plan].name} for ativado.</p>
          <Link href="/app/settings?tab=billing" className="btn-primary inline-flex">Ver assinatura</Link>
        </section>
      )}
    </div>
  );
}
