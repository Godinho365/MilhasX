"use client";
import { useRouter } from "next/navigation";
import { refreshSafe } from "@/lib/nav";
import { useState } from "react";
import { api } from "@/lib/api";
import { Field, Alert } from "@/components/ui";
import { toast } from "@/components/feedback";

type Run = { at: string; created?: number; updated?: number; removed?: number; total?: number } | null;
const runText = (r: Run) => (r ? `Última: ${new Date(r.at).toLocaleString("pt-BR")} · ${r.total ?? 0} lojas (${r.created ?? 0} novas, ${r.updated ?? 0} alteradas, ${r.removed ?? 0} removidas)` : "Nunca importada");

/** Importação do catálogo: fontes automáticas dos programas e planilha para as que bloqueiam robôs. */
export function ImportPanel({ programs, sources, lastCsv, pageSources }: { programs: { id: string; name: string }[]; sources: { key: string; label: string; url: string; last: Run }[]; lastCsv: Run; pageSources: { key: string; label: string; url: string; last: Run }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  async function run(body: Record<string, string>, key: string) {
    setBusy(key);
    const r = await api<{ result: { total: number; created: number; updated: number; removed: number } }>("/api/admin/store-import", "POST", body);
    setBusy(null);
    if (!r.ok) return toast(r.erro, "error");
    toast(`${r.data.result.total} lojas: ${r.data.result.created} novas, ${r.data.result.updated} alteradas, ${r.data.result.removed} removidas`);
    refreshSafe(router);
  }
  async function page(key: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 8_000_000) return toast("Arquivo maior que 8 MB", "error");
    await run({ page: key, html: await file.text() }, key);
  }
  async function csv(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const file = f.get("file");
    const text = file instanceof File && file.size ? await file.text() : String(f.get("text") || "");
    if (!text.trim()) return toast("Escolha um arquivo ou cole a planilha", "error");
    await run({ programId: String(f.get("programId")), csv: text }, "csv");
  }
  return (
    <section className="card card-pad mb-4" aria-label="Importar catálogo">
      <h2 className="text-lg font-semibold">Importar catálogo de lojas</h2>
      <p className="mb-4 text-sm text-muted">As fontes automáticas leem a lista pública de parceiros do próprio programa. Livelo, Smiles e Azul bloqueiam consultas automáticas: para elas, use a planilha.</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <ul className="space-y-2">
          {sources.map((s) => (
            <li key={s.key} className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{s.label} <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent-light hover:underline">ver fonte</a></p>
                <p className="text-xs text-muted">{runText(s.last)}</p>
              </div>
              <button className="btn-primary h-9" disabled={busy !== null} onClick={() => run({ source: s.key }, s.key)}>{busy === s.key ? "Importando…" : "Importar agora"}</button>
            </li>
          ))}
          {pageSources.map((s) => (
            <li key={s.key} className="rounded-xl border border-line px-3 py-2.5" aria-label={`Página salva da ${s.label}`}>
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{s.label} <span className="text-xs font-normal text-muted">(página salva)</span></p>
                  <p className="text-xs text-muted">{runText(s.last)}</p>
                </div>
                <label className={`btn-primary h-9 cursor-pointer ${busy !== null ? "pointer-events-none opacity-60" : ""}`}>
                  {busy === s.key ? "Importando…" : "Enviar página"}
                  <input type="file" accept=".html,.htm,text/html" className="sr-only" onChange={(e) => page(s.key, e)} aria-label={`Enviar página da ${s.label}`} />
                </label>
              </div>
              <p className="mt-2 text-xs text-muted">O site bloqueia leitura automática. Abra <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-accent-light hover:underline">a página de parceiros</a> no seu navegador, salve com Ctrl+S (“Página da Web, somente HTML”) e envie o arquivo.</p>
            </li>
          ))}
        </ul>
        <form onSubmit={csv} className="space-y-3 rounded-xl border border-line p-3" aria-label="Importar planilha">
          <p className="font-medium">Planilha (CSV)</p>
          <p className="text-xs text-muted">Colunas: <code>loja;pontos_por_real;ate;por_dolar</code> (as duas últimas opcionais, sim/não). Cada envio substitui a lista anterior da planilha naquele programa. {runText(lastCsv)}</p>
          <Field label="Programa"><select className="input" name="programId" required>{programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Arquivo"><input className="input" type="file" name="file" accept=".csv,text/csv,text/plain" /></Field>
          <Field label="ou cole aqui"><textarea className="input min-h-20 font-mono text-xs" name="text" placeholder={"loja;pontos_por_real;ate\nLoja Exemplo;3;sim"} /></Field>
          <button className="btn-ghost w-full" disabled={busy !== null}>{busy === "csv" ? "Importando…" : "Importar planilha"}</button>
        </form>
      </div>
    </section>
  );
}

export function OfferForm({ programs }: { programs: { id: string; name: string }[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const num = (k: string) => Math.round((Number(String(f.get(k) || "0").replace(",", ".")) || 0) * 100);
    const r = await api("/api/admin/offers", "POST", {
      storeName: f.get("store"), programId: f.get("programId") || null, portal: f.get("portal") || null,
      pointsPerReal: num("ppr"), cashbackBps: num("cash"),
    });
    if (!r.ok) return setMsg({ kind: "error", text: r.erro });
    setMsg({ kind: "ok", text: "Oferta salva. Alertas correspondentes foram avaliados." });
    form.reset();
    refreshSafe(router);
  }
  return (
    <form onSubmit={save} className="card space-y-3 p-4">
      <h2 className="font-medium">Cadastrar / atualizar oferta</h2>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <Field label="Loja"><input className="input" name="store" required maxLength={100} /></Field>
      <Field label="Programa (pontos)"><select className="input" name="programId"><option value="">— (oferta de cashback)</option>{programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      <Field label="Pontos por real"><input className="input" name="ppr" inputMode="decimal" placeholder="0" /></Field>
      <Field label="Portal de cashback"><input className="input" name="portal" maxLength={60} /></Field>
      <Field label="Cashback (%)"><input className="input" name="cash" inputMode="decimal" placeholder="0" /></Field>
      <button className="btn-primary w-full">Salvar oferta</button>
    </form>
  );
}
