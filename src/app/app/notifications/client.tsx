"use client";
import { useRouter } from "next/navigation";
import { refreshSafe } from "@/lib/nav";
import { useState } from "react";
import { Bell, BellRing, CheckCheck, Trash2 } from "lucide-react";
import { Field, Alert } from "@/components/ui";
import { api } from "@/lib/api";
import { toast, confirmDialog } from "@/components/feedback";

export function MarkRead() {
  const router = useRouter();
  return (
    <button className="btn-ghost" onClick={async () => { await api("/api/notifications/read", "POST"); toast("Notificações marcadas como lidas"); refreshSafe(router); }}>
      <CheckCheck className="h-4 w-4" />Marcar todas como lidas
    </button>
  );
}

export function ClearAll() {
  const router = useRouter();
  async function clear() {
    if (!(await confirmDialog({ title: "Limpar notificações?", body: "Todas as notificações saem da lista.", confirmLabel: "Limpar", danger: true }))) return;
    await api("/api/notifications/clear", "POST");
    toast("Notificações limpas");
    refreshSafe(router);
  }
  return (
    <button className="btn-ghost" onClick={clear}>
      <Trash2 className="h-4 w-4" />Limpar
    </button>
  );
}

/** Alerta de saldo mínimo: avisa quando o saldo de uma conta fica abaixo do limite. */
export function BalanceAlerts({ alerts, accounts }: { alerts: { id: string; title: string; text: string; triggered: boolean }[]; accounts: { id: string; name: string }[] }) {
  const router = useRouter();
  const [erro, setErro] = useState("");
  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const r = await api("/api/alerts", "POST", { type: "MIN_BALANCE", accountId: f.get("accountId"), threshold: Number(String(f.get("threshold")).replace(/\D/g, "")) });
    if (!r.ok) return setErro(r.erro);
    setErro("");
    form.reset();
    toast("Alerta criado");
    refreshSafe(router);
  }
  async function remove(id: string, title: string) {
    if (!(await confirmDialog({ title: "Excluir alerta?", body: title, confirmLabel: "Excluir", danger: true }))) return;
    const r = await api(`/api/alerts/${id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    toast("Alerta excluído");
    refreshSafe(router);
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <form onSubmit={create} className="card card-pad space-y-4">
        <h2 className="text-lg font-semibold">Alerta de saldo</h2>
        <p className="text-sm text-muted">Receba um aviso quando o saldo de uma conta ficar abaixo do limite.</p>
        {erro && <Alert>{erro}</Alert>}
        <Field label="Conta" required><select className="input" name="accountId" required defaultValue=""><option value="" disabled>Selecione</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        <Field label="Avisar quando o saldo ficar abaixo de (pontos)" required><input className="input" name="threshold" inputMode="numeric" required placeholder="5.000" /></Field>
        <button className="btn-primary w-full"><Bell className="h-4 w-4" />Criar alerta</button>
      </form>
      <section className="card overflow-hidden" aria-label="Seus alertas de saldo">
        <h2 className="border-b border-line px-5 py-4 text-lg font-semibold">Seus alertas <span className="text-muted">{alerts.length}</span></h2>
        {alerts.length === 0 ? <p className="px-5 py-10 text-center text-sm text-muted">Nenhum alerta criado.</p> : (
          <ul className="max-h-[420px] divide-y divide-line overflow-y-auto">
            {alerts.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-5 py-3.5">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${a.triggered ? "bg-green-500/15 text-green-300" : "bg-panel2 text-muted"}`} title={a.triggered ? "Disparado" : "Aguardando"}>
                  {a.triggered ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{a.title}</p>
                  <p className="truncate text-xs text-muted">{a.text}{a.triggered && " · disparado"}</p>
                </div>
                <button className="btn-subtle h-8 w-8 px-0" onClick={() => remove(a.id, `${a.title}: ${a.text}`)} aria-label={`Excluir alerta ${a.title}`}><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
