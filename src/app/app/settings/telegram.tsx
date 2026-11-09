"use client";
// Configurações › Telegram: conectar a própria conta do Telegram (número → código → senha de duas etapas) e
// escolher o grupo do balcão de onde o app lê os pedidos. O app só lê; a sessão fica criptografada no servidor.
import { useState } from "react";
import { Send, LogOut, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { Field, Alert } from "@/components/ui";
import { toast, confirmDialog } from "@/components/feedback";
import { Section } from "./client";

type TgStatus = {
  enabled: boolean;
  status: "NONE" | "CODE_SENT" | "PASSWORD_NEEDED" | "ACTIVE";
  phone: string | null;
  codeViaApp: boolean;
  accountName: string | null;
  group: { id: string; title: string } | null;
};
type TgGroup = { id: string; title: string; channel: boolean };

export function TelegramTab({ initial }: { initial: TgStatus }) {
  const [s, setS] = useState(initial);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [groups, setGroups] = useState<TgGroup[] | null>(null);
  const [groupId, setGroupId] = useState(initial.group?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  async function call(path: string, method: "POST" | "DELETE", body?: unknown) {
    setBusy(true);
    setErro("");
    const r = await api<{ item: TgStatus }>(path, method, body);
    setBusy(false);
    if (!r.ok) {
      setErro(r.erro);
      return null;
    }
    setS(r.data.item);
    return r.data.item;
  }
  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    if (await call("/api/telegram/login", "POST", { phone })) setCode("");
  }
  async function sendCodeStep(e: React.FormEvent) {
    e.preventDefault();
    const st = await call("/api/telegram/code", "POST", { code });
    if (st?.status === "ACTIVE") toast("Conta do Telegram conectada");
  }
  async function sendPassword(e: React.FormEvent) {
    e.preventDefault();
    const st = await call("/api/telegram/password", "POST", { password });
    setPassword(""); // a senha não fica na tela
    if (st?.status === "ACTIVE") toast("Conta do Telegram conectada");
  }
  async function cancel() {
    await call("/api/telegram", "DELETE");
    setGroups(null);
  }
  async function disconnect() {
    const ok = await confirmDialog({ title: "Desconectar o Telegram?", body: "A sessão do app é encerrada na sua conta do Telegram (sai de Dispositivos) e o app para de ler o grupo.", confirmLabel: "Desconectar", danger: true });
    if (!ok) return;
    if (await call("/api/telegram", "DELETE")) {
      setGroups(null);
      setGroupId("");
      toast("Telegram desconectado");
    }
  }
  async function loadGroups() {
    setBusy(true);
    setErro("");
    const r = await api<{ items: TgGroup[] }>("/api/telegram/groups");
    setBusy(false);
    if (!r.ok) {
      setErro(r.erro);
      // sessão encerrada pelo app do Telegram: volta para conectar
      if (/conecte de novo/.test(r.erro)) setS({ ...s, status: "NONE", group: null, accountName: null, phone: null });
      return;
    }
    setGroups(r.data.items);
    if (!groupId && r.data.items[0]) setGroupId(r.data.items[0].id);
  }
  async function saveGroup() {
    if (await call("/api/telegram/groups", "POST", { groupId })) {
      setGroups(null);
      toast("Grupo do balcão salvo");
    }
  }

  if (!s.enabled) {
    return (
      <Section title="Telegram">
        <Alert kind="info">O servidor ainda não está pronto para o Telegram: faltam TELEGRAM_API_ID e TELEGRAM_API_HASH (gerados em my.telegram.org) ou a CREDENTIALS_KEY nas variáveis de ambiente.</Alert>
      </Section>
    );
  }
  return (
    <>
      {erro && <div className="mb-4"><Alert>{erro}</Alert></div>}
      {s.status === "NONE" && (
        <Section title="Conectar sua conta do Telegram">
          <form onSubmit={sendCode} className="space-y-4">
            <p className="text-sm text-muted">Conecte a conta com que você participa do grupo do balcão. O app passa a ler as mensagens do grupo que você escolher, como você já vê no Telegram; ele nunca envia mensagens.</p>
            <Field label="Seu número do Telegram" required>
              <input className="input" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+55 11 99999-8888" required aria-label="Número do Telegram" />
            </Field>
            <button className="btn-primary" disabled={busy}><Send className="h-4 w-4" />{busy ? "Enviando…" : "Enviar código"}</button>
          </form>
        </Section>
      )}
      {s.status === "CODE_SENT" && (
        <Section title="Código de acesso">
          <form onSubmit={sendCodeStep} className="space-y-4">
            <p className="text-sm text-muted">O código foi enviado para <b className="text-zinc-200">{s.phone}</b> {s.codeViaApp ? "no app do Telegram, numa conversa do próprio Telegram" : "por SMS"}.</p>
            <Field label="Código" required>
              <input className="input max-w-[10rem] tracking-widest" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required maxLength={12} aria-label="Código do Telegram" autoFocus />
            </Field>
            <div className="flex gap-2">
              <button className="btn-primary" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
              <button type="button" className="btn-ghost" onClick={cancel} disabled={busy}>Cancelar</button>
            </div>
          </form>
        </Section>
      )}
      {s.status === "PASSWORD_NEEDED" && (
        <Section title="Senha de duas etapas">
          <form onSubmit={sendPassword} className="space-y-4">
            <p className="text-sm text-muted">Sua conta do Telegram tem verificação em duas etapas. A senha só é usada para entrar: não fica guardada.</p>
            <Field label="Senha" required>
              <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required aria-label="Senha de duas etapas" autoFocus />
            </Field>
            <div className="flex gap-2">
              <button className="btn-primary" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
              <button type="button" className="btn-ghost" onClick={cancel} disabled={busy}>Cancelar</button>
            </div>
          </form>
        </Section>
      )}
      {s.status === "ACTIVE" && (
        <>
          <Section title="Conta conectada">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{s.accountName}</p>
                <p className="text-sm text-muted">{s.phone}</p>
              </div>
              <button type="button" className="btn-ghost text-red-300" onClick={disconnect} disabled={busy}><LogOut className="h-4 w-4" />Desconectar</button>
            </div>
          </Section>
          <Section title="Grupo do balcão">
            <div className="space-y-4">
              <p className="text-sm">{s.group ? <>É deste grupo que o app lê os pedidos: <b>{s.group.title}</b></> : <span className="text-muted">Nenhum grupo escolhido.</span>}</p>
              {groups ? (
                groups.length ? (
                  <div className="flex flex-wrap gap-2">
                    <select className="input min-w-0 flex-1" value={groupId} onChange={(e) => setGroupId(e.target.value)} aria-label="Grupo do balcão">
                      {groups.map((g) => <option key={g.id} value={g.id}>{g.title}{g.channel ? " (canal)" : ""}</option>)}
                    </select>
                    <button type="button" className="btn-primary" onClick={saveGroup} disabled={busy || !groupId}>Salvar</button>
                    <button type="button" className="btn-ghost" onClick={() => setGroups(null)}>Cancelar</button>
                  </div>
                ) : <p className="text-sm text-muted">Sua conta não participa de nenhum grupo.</p>
              ) : (
                <button type="button" className="btn-ghost" onClick={loadGroups} disabled={busy}><RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />{s.group ? "Trocar o grupo" : "Escolher o grupo"}</button>
              )}
            </div>
          </Section>
        </>
      )}
      <p className="px-1 text-xs text-muted">O app só lê: não envia, não responde e não entra em grupos. A sessão fica guardada criptografada no servidor. Para encerrar, use Desconectar ou, no Telegram, Configurações › Dispositivos.</p>
    </>
  );
}
