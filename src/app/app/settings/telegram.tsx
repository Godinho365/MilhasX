"use client";
// Configurações › Telegram: conectar uma ou mais contas do Telegram (número → código → senha de duas etapas) e
// escolher, em cada uma, o grupo do balcão (Chat Balcões). O app só manda o que o usuário escreve e manda; as sessões ficam
// criptografadas no servidor.
import { useState } from "react";
import { Send, LogOut, RefreshCw, Plus, X } from "lucide-react";
import { api } from "@/lib/api";
import { Field, Alert } from "@/components/ui";
import { toast, confirmDialog } from "@/components/feedback";
import { Section } from "./client";

type TgAccount = {
  id: string;
  status: "CODE_SENT" | "PASSWORD_NEEDED" | "ACTIVE";
  phone: string;
  codeViaApp: boolean;
  accountName: string | null;
  groups: { id: string; groupId: string; title: string }[]; // grupos de balcão no Chat Balcões
};
type TgStatus = { enabled: boolean; max: number; maxGroups: number; accounts: TgAccount[] };
type TgGroup = { id: string; title: string; channel: boolean; chosen: boolean };
type Call = (path: string, method: "POST" | "DELETE", body?: unknown) => Promise<TgStatus | null>;

export function TelegramTab({ initial }: { initial: TgStatus }) {
  const [s, setS] = useState(initial);
  const [phone, setPhone] = useState("");
  const [adding, setAdding] = useState(initial.accounts.length === 0);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  // sessão encerrada pelo app do Telegram: o servidor já tirou a conta; recarrega a lista
  async function refresh() {
    const fresh = await api<{ item: TgStatus }>("/api/telegram/accounts");
    if (fresh.ok) setS(fresh.data.item);
  }
  const call: Call = async (path, method, body) => {
    setBusy(true);
    setErro("");
    const r = await api<{ item: TgStatus }>(path, method, body);
    setBusy(false);
    if (!r.ok) {
      setErro(r.erro);
      if (/conecte de novo/.test(r.erro)) await refresh();
      return null;
    }
    setS(r.data.item);
    return r.data.item;
  };
  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    if (await call("/api/telegram/accounts", "POST", { phone })) {
      setPhone("");
      setAdding(false);
    }
  }

  if (!s.enabled) {
    return (
      <Section title="Telegram">
        <Alert kind="info">O servidor ainda não está pronto para o Telegram: faltam TELEGRAM_API_ID e TELEGRAM_API_HASH (gerados em my.telegram.org) ou a CREDENTIALS_KEY nas variáveis de ambiente.</Alert>
      </Section>
    );
  }
  const full = s.accounts.length >= s.max;
  return (
    <>
      {erro && <div className="mb-4"><Alert>{erro}</Alert></div>}
      {s.accounts.length > 0 && (
        <Section title={`Contas do Telegram (${s.accounts.length})`}>
          <ul className="divide-y divide-line">
            {s.accounts.map((a) => <AccountRow key={a.id} account={a} call={call} busy={busy} setErro={setErro} onGone={refresh} maxGroups={s.maxGroups} />)}
          </ul>
        </Section>
      )}
      {adding ? (
        <Section title={s.accounts.length ? "Conectar outra conta" : "Conectar sua conta do Telegram"}>
          <form onSubmit={sendCode} className="space-y-4">
            <p className="text-sm text-muted">Conecte a conta com que você participa do grupo do balcão. O grupo que você escolher aparece no Chat Balcões, como você já vê no Telegram. O app só manda as mensagens que você escrever e enviar por lá; nunca manda nada sozinho.</p>
            <Field label="Número do Telegram" required>
              <input className="input" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+55 11 99999-8888" required aria-label="Número do Telegram" autoFocus={s.accounts.length > 0} />
            </Field>
            <div className="flex gap-2">
              <button className="btn-primary" disabled={busy}><Send className="h-4 w-4" />{busy ? "Enviando…" : "Enviar código"}</button>
              {s.accounts.length > 0 && <button type="button" className="btn-ghost" onClick={() => { setAdding(false); setPhone(""); }}>Cancelar</button>}
            </div>
          </form>
        </Section>
      ) : (
        <div className="mb-8">
          <button type="button" className="btn-ghost" onClick={() => setAdding(true)} disabled={full} title={full ? `Limite de ${s.max} contas` : undefined}><Plus className="h-4 w-4" />Conectar outra conta</button>
          {full && <p className="mt-1 text-xs text-muted">Limite de {s.max} contas: desconecte uma para conectar outra.</p>}
        </div>
      )}
      <p className="px-1 text-xs text-muted">O app só manda o que você escrever e enviar no Chat Balcões: nunca manda nada sozinho e não entra em grupos. As sessões ficam guardadas criptografadas no servidor. Para encerrar, use Desconectar ou, no Telegram da conta, Configurações › Dispositivos.</p>
    </>
  );
}

/** Uma conta: no meio do login (código ou senha) ou conectada (os grupos de balcão dela e desconectar). */
function AccountRow({ account: a, call, busy, setErro, onGone, maxGroups }: { account: TgAccount; call: Call; busy: boolean; setErro: (e: string) => void; onGone: () => Promise<void>; maxGroups: number }) {
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [groups, setGroups] = useState<TgGroup[] | null>(null); // grupos da conta, para adicionar
  const [groupId, setGroupId] = useState("");
  const [loading, setLoading] = useState(false);
  const base = `/api/telegram/accounts/${a.id}`;

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    const st = await call(`${base}/code`, "POST", { code });
    if (st?.accounts.find((x) => x.id === a.id)?.status === "ACTIVE") toast("Conta do Telegram conectada");
  }
  async function sendPassword(e: React.FormEvent) {
    e.preventDefault();
    const st = await call(`${base}/password`, "POST", { password });
    setPassword(""); // a senha não fica na tela
    if (st?.accounts.find((x) => x.id === a.id)?.status === "ACTIVE") toast("Conta do Telegram conectada");
  }
  async function disconnect() {
    if (a.status === "ACTIVE") {
      const ok = await confirmDialog({ title: `Desconectar ${a.accountName ?? a.phone}?`, body: "A sessão do app é encerrada nesta conta do Telegram (sai de Dispositivos) e o app para de ler o grupo dela.", confirmLabel: "Desconectar", danger: true });
      if (!ok) return;
    }
    if (await call(base, "DELETE") && a.status === "ACTIVE") toast("Conta desconectada");
  }
  async function loadGroups() {
    setLoading(true);
    setErro("");
    const r = await api<{ items: TgGroup[] }>(`${base}/groups`);
    setLoading(false);
    if (!r.ok) {
      setErro(r.erro);
      if (/conecte de novo/.test(r.erro)) await onGone();
      return;
    }
    setGroups(r.data.items);
    setGroupId(r.data.items.find((g) => !g.chosen)?.id ?? "");
  }
  async function addGroup() {
    if (await call(`${base}/groups`, "POST", { groupId })) {
      setGroups(null);
      toast("Grupo adicionado ao Chat Balcões");
    }
  }
  async function removeGroup(g: { id: string; title: string }) {
    const ok = await confirmDialog({ title: `Tirar ${g.title} do Chat Balcões?`, body: "A aba dele some do Chat Balcões. No Telegram você continua no grupo.", confirmLabel: "Tirar" });
    if (!ok) return;
    if (await call(`/api/telegram/chats/${g.id}`, "DELETE")) toast("Grupo tirado do Chat Balcões");
  }
  const available = groups?.filter((g) => !g.chosen) ?? [];

  return (
    <li className="space-y-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{a.accountName ?? a.phone}</p>
          <p className="text-sm text-muted">
            {a.status === "ACTIVE" ? a.phone : a.status === "CODE_SENT" ? `${a.phone} · esperando o código` : `${a.phone} · esperando a senha de duas etapas`}
          </p>
        </div>
        <button type="button" className={`btn-ghost ${a.status === "ACTIVE" ? "text-red-300" : ""}`} onClick={disconnect} disabled={busy}>
          {a.status === "ACTIVE" ? <><LogOut className="h-4 w-4" />Desconectar</> : "Cancelar"}
        </button>
      </div>

      {a.status === "CODE_SENT" && (
        <form onSubmit={sendCode} className="space-y-3">
          <p className="text-sm text-muted">O código foi enviado {a.codeViaApp ? "para o app do Telegram desta conta, numa conversa do próprio Telegram" : "por SMS"}.</p>
          <div className="flex flex-wrap gap-2">
            <input className="input max-w-[10rem] tracking-widest" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required maxLength={12} placeholder="Código" aria-label={`Código do Telegram de ${a.phone}`} />
            <button className="btn-primary" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
          </div>
        </form>
      )}
      {a.status === "PASSWORD_NEEDED" && (
        <form onSubmit={sendPassword} className="space-y-3">
          <p className="text-sm text-muted">Esta conta tem verificação em duas etapas. A senha só é usada para entrar: não fica guardada.</p>
          <div className="flex flex-wrap gap-2">
            <input className="input max-w-xs" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Senha de duas etapas" aria-label={`Senha de duas etapas de ${a.phone}`} />
            <button className="btn-primary" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
          </div>
        </form>
      )}
      {a.status === "ACTIVE" && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Grupos de balcão {a.groups.length > 0 && <span className="text-muted">({a.groups.length})</span>}</p>
          {a.groups.length ? (
            <ul className="flex flex-wrap gap-1.5">
              {a.groups.map((g) => (
                <li key={g.id} className="flex items-center gap-1 rounded-full border border-line bg-panel2 py-0.5 pl-3 pr-1 text-sm">
                  {g.title}
                  <button type="button" onClick={() => removeGroup(g)} disabled={busy} className="rounded-full p-0.5 text-muted hover:text-red-300" aria-label={`Tirar ${g.title} do Chat Balcões`} title="Tirar do Chat Balcões"><X className="h-3.5 w-3.5" /></button>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">Nenhum grupo ainda: adicione os grupos de balcão desta conta.</p>}
          {groups ? (
            available.length ? (
              <div className="flex flex-wrap gap-2">
                <select className="input min-w-0 flex-1" value={groupId} onChange={(e) => setGroupId(e.target.value)} aria-label={`Grupo para adicionar de ${a.accountName ?? a.phone}`}>
                  {available.map((g) => <option key={g.id} value={g.id}>{g.title}{g.channel ? " (canal)" : ""}</option>)}
                </select>
                <button type="button" className="btn-primary" onClick={addGroup} disabled={busy || !groupId}><Plus className="h-4 w-4" />Adicionar</button>
                <button type="button" className="btn-ghost" onClick={() => setGroups(null)}>Cancelar</button>
              </div>
            ) : <p className="text-sm text-muted">{groups.length ? "Todos os grupos desta conta já estão no Chat Balcões." : "Esta conta não participa de nenhum grupo."} <button type="button" className="text-accent-light hover:underline" onClick={() => setGroups(null)}>Fechar</button></p>
          ) : (
            <button type="button" className="btn-ghost h-8 text-sm" onClick={loadGroups} disabled={busy || loading || a.groups.length >= maxGroups} title={a.groups.length >= maxGroups ? `Limite de ${maxGroups} grupos por conta` : undefined}>
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Adicionar grupo
            </button>
          )}
        </div>
      )}
    </li>
  );
}
