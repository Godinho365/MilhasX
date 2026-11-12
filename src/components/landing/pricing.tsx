"use client";
import Link from "next/link";
import { useState } from "react";
import { Check } from "lucide-react";
import { ANNUAL_DISCOUNT_PCT, PLANS, TRIAL_DAYS, planPriceCents, type PlanCode, type PlanInterval } from "@/domain/plans";

const ORDER: PlanCode[] = ["PESSOAL", "PRO", "GESTOR"];
const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Planos com a troca mensal/anual (preços vêm de domain/plans). */
export function Pricing() {
  const [interval, setInterval] = useState<PlanInterval>("MENSAL");
  return (
    <div>
      <div className="mx-auto mb-8 flex w-fit rounded-full border border-line p-1 text-sm" role="group" aria-label="Período de cobrança">
        {(["MENSAL", "ANUAL"] as const).map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => setInterval(i)}
            aria-pressed={interval === i}
            className={`rounded-full px-4 py-1.5 font-medium transition-colors ${interval === i ? "bg-accent-light text-zinc-950" : "text-muted hover:text-zinc-100"}`}
          >
            {i === "MENSAL" ? "Mensal" : `Anual (−${ANNUAL_DISCOUNT_PCT}%)`}
          </button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {ORDER.map((code) => {
          const p = PLANS[code];
          const featured = code === "PRO";
          const price = planPriceCents(code, interval);
          return (
            <div key={code} className={`card relative flex flex-col p-6 ${featured ? "border-accent-light shadow-[0_0_0_1px_rgb(var(--accent-light))]" : ""}`}>
              {featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent-light px-3 py-0.5 text-xs font-semibold text-zinc-950">Mais popular</span>
              )}
              <h3 className="text-lg font-semibold">{p.name}</h3>
              <p className="mt-1 text-sm text-muted">{p.tagline}</p>
              <p className="mt-5">
                <span className="text-3xl font-bold">{price === 0 ? "Grátis" : brl(price)}</span>
                {price > 0 && <span className="text-sm text-muted"> /mês</span>}
              </p>
              {price > 0 && interval === "ANUAL" && <p className="text-xs text-muted">cobrado anualmente</p>}
              <ul className="mt-5 flex-1 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-accent-light" aria-hidden />{f}</li>
                ))}
              </ul>
              <Link href="/register" className={`${featured ? "btn-primary" : "btn-ghost"} mt-6 h-10 w-full`}>
                {price === 0 ? "Criar conta grátis" : "Começar teste grátis"}
              </Link>
            </div>
          );
        })}
      </div>
      <p className="mt-5 text-center text-xs text-muted">
        Toda conta nova começa com {TRIAL_DAYS} dias de teste com os recursos do plano Gestor. Não precisa de cartão de crédito.
      </p>
    </div>
  );
}
