"use client";
import { useState } from "react";
import { CheckCircle2, MessageCircle, Plus, Trash2 } from "lucide-react";
import { fmtBRL } from "@/lib/format";
import { Alert } from "@/components/ui";
import { waLink } from "../../central";
import type { PublicDeal } from "@/server/services/miles-deals";

// Nome e sobrenome separados, como a companhia aérea pede na emissão
type Pax = { firstName: string; lastName: string; cpf: string; birthDate: string; gender: "M" | "F" | ""; email: string; phone: string };
const empty = (): Pax => ({ firstName: "", lastName: "", cpf: "", birthDate: "", gender: "", email: "", phone: "" });
/** Passageiro já enviado: usa nome/sobrenome salvos ou separa o nome completo (envios antigos). */
const fromSaved = (p: PublicDeal["passengersData"][number]) => {
  const parts = p.name.trim().split(/\s+/);
  return { firstName: p.firstName ?? parts[0] ?? "", lastName: p.lastName ?? parts.slice(1).join(" ") };
};
const GENDER = { M: "Masculino", F: "Feminino" } as const;
const maskCpf = (v: string) => v.replace(/\D/g, "").slice(0, 11).replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/(\d{3})-?(\d{1,2})$/, "$1-$2");
const showCpf = (v: string) => (v.length === 11 ? `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6, 9)}-${v.slice(9)}` : v);
const showDate = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split("-").reverse().join("/") : v);

/** Página do comprador (CRM Milhas): resumo, dados dos passageiros e, depois da emissão, o localizador. */
export function EmissaoView({ slug, token, agency, whatsapp, deal }: { slug: string; token: string; agency: string; whatsapp: string | null; deal: PublicDeal }) {
  const fixed = deal.passengers ?? null; // quantidade combinada: o comprador não muda
  const start = deal.passengersData.length
    ? deal.passengersData.map((p) => ({ ...fromSaved(p), cpf: maskCpf(p.cpf), birthDate: p.birthDate, gender: p.gender ?? "", email: p.email ?? "", phone: p.phone ?? "" }))
    : Array.from({ length: fixed ?? 1 }, empty);
  const [pax, setPax] = useState<Pax[]>(start);
  const [editing, setEditing] = useState(!deal.passengersAt);
  const [website, setWebsite] = useState("");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const issued = !!deal.locator;
  const wa = waLink(whatsapp, `Olá! Sobre a emissão #${deal.number}.`);
  const set = (i: number, p: Partial<Pax>) => setPax((l) => l.map((x, j) => (j === i ? { ...x, ...p } : x)));

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await fetch(`/api/public/miles-deal/${encodeURIComponent(slug)}/${encodeURIComponent(token)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ passengers: pax.map((p) => ({ ...p, name: `${p.firstName.trim()} ${p.lastName.trim()}` })), website }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErro(j.erro ?? "Não foi possível enviar. Tente de novo.");
    window.location.reload();
  }
  const field = "h-11 w-full rounded-xl border border-line bg-panel2 px-3 text-sm focus:outline-none";
  const lab = "mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted";
  const rows: [string, string][] = [
    ["Agência", agency],
    ["Comprador", deal.customerName],
    ...(deal.points ? [["Milhas", deal.points.toLocaleString("pt-BR")] as [string, string]] : []),
    ...(fixed ? [["Passageiros (CPFs)", String(fixed)] as [string, string]] : []),
    ...(deal.taxesCents ? [["Taxas", fmtBRL(deal.taxesCents)] as [string, string]] : []),
    ...(deal.chargeCents != null ? [["Valor total", fmtBRL(deal.chargeCents)] as [string, string]] : []),
  ];
  return (
    <div className="space-y-4">
      <section className="card p-5" aria-label="Resumo da emissão">
        <h1 className="text-xl font-bold">Dados para a emissão</h1>
        <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${issued ? "bg-accent-soft text-accent" : deal.passengersAt ? "bg-blue-500/15 text-blue-300" : "bg-amber-500/15 text-amber-400"}`}>
          {issued ? "Emitido" : deal.passengersAt ? "Dados recebidos · aguardando emissão" : "Aguardando os dados dos passageiros"}
        </span>
        <dl className="mt-4 space-y-2 text-sm">
          {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-4"><dt className="text-muted">{k}</dt><dd className="text-right font-semibold tabular-nums">{v}</dd></div>)}
        </dl>
      </section>

      {issued && (
        <section className="card p-5 text-center" aria-label="Localizador">
          <CheckCircle2 className="mx-auto h-10 w-10 text-green-400" />
          <p className="mt-2 text-sm text-muted">Localizador</p>
          <p className="text-2xl font-bold tracking-widest">{deal.locator}</p>
        </section>
      )}

      {!editing || issued ? (
        <section className="card p-5" aria-label="Passageiros enviados">
          <h2 className="font-semibold">Passageiros</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {deal.passengersData.map((p, i) => (
              <li key={i} className="rounded-xl bg-panel2 px-3 py-2">
                <p className="font-semibold">{p.name}</p>
                <p className="text-xs text-muted">CPF {showCpf(p.cpf)} · nascimento {showDate(p.birthDate)}{p.gender ? ` · ${GENDER[p.gender]}` : ""}{p.email ? ` · ${p.email}` : ""}{p.phone ? ` · ${p.phone}` : ""}</p>
              </li>
            ))}
          </ul>
          {!issued && <button type="button" className="btn-ghost mt-3 h-10 w-full" onClick={() => setEditing(true)}>Corrigir dados</button>}
        </section>
      ) : (
        <form onSubmit={send} className="card space-y-4 p-5" aria-label="Dados dos passageiros">
          <div>
            <h2 className="font-semibold">Passageiros</h2>
            <p className="mt-0.5 text-xs text-muted">Use os dados exatamente como no documento de cada passageiro.</p>
          </div>
          {erro && <Alert>{erro}</Alert>}
          {pax.map((p, i) => (
            <fieldset key={i} className="space-y-3 rounded-xl border border-line p-3">
              <legend className="flex w-full items-center justify-between px-1 text-sm font-semibold">
                <span>Passageiro {i + 1}</span>
                {!fixed && pax.length > 1 && <button type="button" className="text-muted hover:text-zinc-100" onClick={() => setPax((l) => l.filter((_, j) => j !== i))} aria-label={`Remover passageiro ${i + 1}`}><Trash2 className="h-4 w-4" /></button>}
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block"><span className={lab}>Nome *</span><input className={field} value={p.firstName} onChange={(e) => set(i, { firstName: e.target.value })} required minLength={2} maxLength={60} autoComplete="given-name" placeholder="Como no documento" /></label>
                <label className="block"><span className={lab}>Sobrenome *</span><input className={field} value={p.lastName} onChange={(e) => set(i, { lastName: e.target.value })} required minLength={2} maxLength={60} autoComplete="family-name" placeholder="Como no documento" /></label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block"><span className={lab}>CPF *</span><input className={field} value={p.cpf} onChange={(e) => set(i, { cpf: maskCpf(e.target.value) })} required inputMode="numeric" placeholder="000.000.000-00" /></label>
                <label className="block"><span className={lab}>Data de nascimento *</span><input type="date" className={field} value={p.birthDate} onChange={(e) => set(i, { birthDate: e.target.value })} required /></label>
                <label className="block"><span className={lab}>Sexo *</span><select className={field} value={p.gender} onChange={(e) => set(i, { gender: e.target.value as Pax["gender"] })} required><option value="" disabled>Selecione</option><option value="M">Masculino</option><option value="F">Feminino</option></select></label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block"><span className={lab}>E-mail</span><input type="email" className={field} value={p.email} onChange={(e) => set(i, { email: e.target.value })} maxLength={200} /></label>
                <label className="block"><span className={lab}>Telefone</span><input className={field} value={p.phone} onChange={(e) => set(i, { phone: e.target.value })} inputMode="tel" maxLength={30} placeholder="(11) 90000-0000" /></label>
              </div>
            </fieldset>
          ))}
          {!fixed && pax.length < 9 && <button type="button" className="btn-ghost h-10 w-full" onClick={() => setPax((l) => [...l, empty()])}><Plus className="h-4 w-4" />Adicionar passageiro</button>}
          <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} className="absolute -left-[9999px] h-0 w-0 opacity-0" aria-hidden />
          <button className="btn-primary h-11 w-full" disabled={busy}>{busy ? "Enviando…" : "Enviar dados"}</button>
        </form>
      )}

      {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="btn-ghost h-11 w-full"><MessageCircle className="h-4 w-4" />Falar no WhatsApp</a>}
    </div>
  );
}
