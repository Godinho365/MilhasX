"use client";
import { useRouter } from "next/navigation";
import { refreshSafe } from "@/lib/nav";
import { useState } from "react";
import { api } from "@/lib/api";
import { Field, Alert, Modal } from "@/components/ui";
import { toast } from "@/components/feedback";

type SourceState = {
  key: string; label: string; kind: "auto" | "page" | "file" | "csv"; url?: string;
  state: "SUCCESS" | "PARTIAL" | "WAITING_FILE" | "UNAVAILABLE" | "FAILED" | "NEVER";
  lastAttempt: string | null; lastSuccess: string | null; offers: number;
  last: { id: string; status: string; total: number; created: number; updated: number; unchanged: number; ignored: number; removed: number; message: string | null } | null;
};
type Report = { source: string; status: string; startedAt: string; total: number; created: number; updated: number; unchanged: number; ignored: number; removed: number; message: string | null; issues: { item: string; reason: string }[] };

const STATE: Record<SourceState["state"], { label: string; cls: string }> = {
  SUCCESS: { label: "Sucesso", cls: "bg-green-500/15 text-green-300" },
  PARTIAL: { label: "Sucesso parcial", cls: "bg-amber-500/15 text-amber-300" },
  WAITING_FILE: { label: "Aguardando arquivo", cls: "bg-blue-500/15 text-blue-300" },
  UNAVAILABLE: { label: "Fonte indisponível", cls: "bg-red-500/15 text-red-300" },
  FAILED: { label: "Falha de processamento", cls: "bg-red-500/15 text-red-300" },
  NEVER: { label: "Nunca importada", cls: "bg-panel2 text-muted" },
};
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
const HOW: Record<string, React.ReactNode> = {
  page: <>O site bloqueia leitura automática. Abra a página de parceiros no seu navegador, salve com Ctrl+S (“Página da Web, somente HTML”) e envie o arquivo .html.</>,
  file: <>Sem API ou feed público e com bloqueio de robôs. Envie uma planilha CSV com as colunas <code>loja;cashback;link;ate</code> (link e ate opcionais), por exemplo copiada da página de cashback do portal.</>,
};

/** Importação do catálogo: uma linha por fonte, com estado, última tentativa, último sucesso e relatório. */
export function ImportPanel({ programs, sources }: { programs: { id: string; name: string }[]; sources: SourceState[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  async function run(body: Record<string, string>, key: string) {
    setBusy(key);
    const r = await api<{ result: { total: number; created: number; updated: number; ignored: number; removed: number; status: string } }>("/api/admin/store-import", "POST", body);
    setBusy(null);
    refreshSafe(router);
    if (!r.ok) return toast(r.erro, "error");
    const x = r.data.result;
    toast(`${x.status === "PARTIAL" ? "Importação parcial: " : ""}${x.total} lojas: ${x.created} novas, ${x.updated} alteradas, ${x.ignored} ignoradas, ${x.removed} removidas`);
  }
  async function upload(s: SourceState, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const isPage = s.kind === "page";
    if (file.size > (isPage ? 8_000_000 : 2_000_000)) return toast(`Arquivo maior que ${isPage ? 8 : 2} MB`, "error");
    if (isPage ? !/\.html?$/i.test(file.name) : !/\.(csv|txt)$/i.test(file.name)) return toast(isPage ? "Envie o arquivo .html da página salva" : "Envie um arquivo .csv", "error");
    const text = await file.text();
    await run(isPage ? { page: s.key, html: text } : { file: s.key, csv: text }, s.key);
  }
  async function csv(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const file = f.get("file");
    const text = file instanceof File && file.size ? await file.text() : String(f.get("text") || "");
    if (!text.trim()) return toast("Escolha um arquivo ou cole a planilha", "error");
    await run({ programId: String(f.get("programId")), csv: text }, "csv");
  }
  async function openReport(id: string) {
    const r = await api<{ item: Report }>(`/api/admin/store-import?run=${encodeURIComponent(id)}`);
    if (!r.ok) return toast(r.erro, "error");
    setReport(r.data.item);
  }
  const csvSource = sources.find((s) => s.key === "csv");
  return (
    <section className="card card-pad mb-4" aria-label="Importar catálogo">
      <h2 className="text-lg font-semibold">Importar catálogo de lojas</h2>
      <p className="mb-4 text-sm text-muted">Fontes automáticas leem só o que o site permite (robots.txt e sem bloqueio). As que bloqueiam robôs entram por arquivo enviado aqui. Importar de novo o mesmo arquivo não duplica nada.</p>
      <ul className="mb-4 divide-y divide-line rounded-xl border border-line" aria-label="Fontes de importação">
        {sources.filter((s) => s.kind !== "csv").map((s) => {
          const st = STATE[s.state];
          return (
            <li key={s.key} className="px-4 py-3" aria-label={`Fonte ${s.label}`}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {s.label}
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
                    {s.url && <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-xs font-normal text-accent-light hover:underline">ver fonte</a>}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    Última tentativa: {when(s.lastAttempt)} · Último sucesso: {when(s.lastSuccess)} · {s.offers.toLocaleString("pt-BR")} ofertas ativas
                    {s.last && (s.last.status === "SUCCESS" || s.last.status === "PARTIAL") && <> · {s.last.total} lidas ({s.last.created} novas, {s.last.updated} alteradas, {s.last.ignored} ignoradas, {s.last.removed} removidas)</>}
                  </p>
                  {s.last?.message && <p className={`mt-1 text-xs ${s.state === "PARTIAL" ? "text-amber-300" : "text-red-300"}`}>{s.last.message}</p>}
                  {HOW[s.kind] && <p className="mt-1 text-xs text-muted">{HOW[s.kind]}</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  {s.last && <button type="button" className="btn-ghost h-9" onClick={() => openReport(s.last!.id)}>Ver relatório</button>}
                  {s.kind === "auto" ? (
                    <button type="button" className="btn-primary h-9" disabled={busy !== null} onClick={() => run({ source: s.key }, s.key)}>{busy === s.key ? "Importando…" : s.lastAttempt ? "Importar novamente" : "Importar agora"}</button>
                  ) : (
                    <label className={`btn-primary h-9 cursor-pointer ${busy !== null ? "pointer-events-none opacity-60" : ""}`}>
                      {busy === s.key ? "Importando…" : s.kind === "page" ? "Enviar página" : "Enviar planilha"}
                      <input type="file" accept={s.kind === "page" ? ".html,.htm,text/html" : ".csv,.txt,text/csv,text/plain"} className="sr-only" onChange={(e) => upload(s, e)} aria-label={s.kind === "page" ? `Enviar página da ${s.label}` : `Enviar planilha da ${s.label}`} />
                    </label>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <form onSubmit={csv} className="space-y-3 rounded-xl border border-line p-3" aria-label="Importar planilha">
        <div className="flex flex-wrap items-center gap-2">
          <p className="flex-1 font-medium">Planilha de pontos (CSV) <span className="text-xs font-normal text-muted">para Smiles, Azul e outros programas sem fonte automática</span></p>
          {csvSource?.last && <button type="button" className="btn-ghost h-8 text-xs" onClick={() => openReport(csvSource.last!.id)}>Ver relatório</button>}
        </div>
        <p className="text-xs text-muted">Colunas: <code>loja;pontos_por_real;ate;por_dolar</code> (as duas últimas opcionais, sim/não). Cada envio substitui a lista anterior da planilha naquele programa. Última: {when(csvSource?.lastAttempt ?? null)}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Programa"><select className="input" name="programId" required>{programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Arquivo"><input className="input" type="file" name="file" accept=".csv,text/csv,text/plain" /></Field>
        </div>
        <Field label="ou cole aqui"><textarea className="input min-h-20 font-mono text-xs" name="text" placeholder={"loja;pontos_por_real;ate\nLoja Exemplo;3;sim"} /></Field>
        <button className="btn-ghost w-full" disabled={busy !== null}>{busy === "csv" ? "Importando…" : "Importar planilha"}</button>
      </form>
      {report && (
        <Modal open onClose={() => setReport(null)} title={`Relatório · ${sources.find((s) => s.key === report.source)?.label ?? report.source}`} size="lg">
          <p className="mb-2 text-sm"><span className={`mr-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATE[report.status as SourceState["state"]]?.cls ?? ""}`}>{STATE[report.status as SourceState["state"]]?.label ?? report.status}</span>{when(report.startedAt)}</p>
          <div className="mb-3 grid grid-cols-3 gap-2 text-center text-sm sm:grid-cols-6">
            {([["Lidas", report.total], ["Novas", report.created], ["Alteradas", report.updated], ["Iguais", report.unchanged], ["Ignoradas", report.ignored], ["Removidas", report.removed]] as const).map(([l, v]) => <div key={l} className="rounded-lg bg-panel2 p-2"><p className="text-[11px] text-muted">{l}</p><p className="font-semibold tabular-nums">{v}</p></div>)}
          </div>
          {report.message && <Alert>{report.message}</Alert>}
          {report.issues.length > 0 ? (
            <ul className="mt-3 max-h-80 divide-y divide-line overflow-y-auto rounded-xl border border-line text-sm" aria-label="Itens ignorados">
              {report.issues.map((i, n) => <li key={n} className="flex gap-3 px-3 py-2"><span className="w-40 shrink-0 truncate font-medium">{i.item}</span><span className="text-muted">{i.reason}</span></li>)}
            </ul>
          ) : <p className="mt-3 text-sm text-muted">Nenhum item ignorado.</p>}
        </Modal>
      )}
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
