"use client";
import { useRouter } from "next/navigation";
import { refreshSafe } from "@/lib/nav";
import { useState } from "react";
import { api } from "@/lib/api";
import { Field, Alert } from "@/components/ui";
import { toast, confirmDialog } from "@/components/feedback";
import { ThemeSwitch } from "@/components/theme-switch";
import { Switch } from "@/components/form-parts";
import { NOTIFY_CATEGORIES, VALUES_MODES, VALUES_LABELS, type NotifyPrefs, type ValuesMode } from "@/domain/plans";
import { AvatarUpload } from "./avatar";

type Prefs = {
  showValues: boolean;
  checklistHidden: boolean;
  soundEffects: boolean;
  usageAnalytics: boolean;
  hideVideoTutorials: boolean;
  valuesMode: ValuesMode;
  notifications: NotifyPrefs;
};

export function Section({ title, children, danger }: { title: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <section className="mb-8 space-y-2" aria-label={title}>
      <h2 className={`px-1 text-xs font-semibold uppercase tracking-wider ${danger ? "text-red-300" : "text-muted"}`}>{title}</h2>
      <div className="card card-pad">{children}</div>
    </section>
  );
}

const VALUES_HINT: Record<ValuesMode, string> = {
  VISIBLE: "Mostra todos os valores",
  PARTIAL: "Esconde os valores em reais",
  HIDDEN: "Esconde reais e saldos de pontos",
};

export function GeneralTab({ prefs: initial }: { prefs: Prefs }) {
  const router = useRouter();
  const [prefs, setPrefs] = useState(initial);
  const [erro, setErro] = useState("");

  async function save(patch: Record<string, unknown>, next: Prefs) {
    const prev = prefs;
    setPrefs(next);
    const r = await api("/api/preferences", "PATCH", patch);
    if (!r.ok) {
      setPrefs(prev);
      return toast(r.erro, "error");
    }
    toast("Preferência salva");
    refreshSafe(router);
  }
  const set = <K extends keyof Prefs>(k: K, v: Prefs[K]) => save({ [k]: v }, { ...prefs, [k]: v });
  const setChannel = (cat: keyof NotifyPrefs, ch: "email" | "push", v: boolean) =>
    save({ notifications: { [cat]: { [ch]: v } } }, { ...prefs, notifications: { ...prefs.notifications, [cat]: { ...prefs.notifications[cat], [ch]: v } } });

  async function changePw(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    if (f.get("next") !== f.get("confirm")) return setErro("As senhas não conferem");
    const r = await api("/api/auth/password", "POST", { current: f.get("current"), next: f.get("next") });
    if (!r.ok) return setErro(r.erro);
    form.reset();
    setErro("");
    toast("Senha alterada");
  }

  return (
    <>
      <Section title="Preferências">
        <div className="space-y-5">
          <Switch label="Efeitos sonoros" hint="Toca um som curto ao concluir ações" checked={prefs.soundEffects} onChange={(v) => set("soundEffects", v)} />
          <Switch label="Análise de uso" hint="Métricas anônimas de uso para melhorar o app (ficam só no seu servidor)" checked={prefs.usageAnalytics} onChange={(v) => set("usageAnalytics", v)} />
          <Switch label="Ocultar tutoriais em vídeo" hint="Esconde os botões de tutorial das páginas" checked={prefs.hideVideoTutorials} onChange={(v) => set("hideVideoTutorials", v)} />
          <Switch label="Mostrar “Primeiros passos”" hint="Lista de tarefas iniciais no painel" checked={!prefs.checklistHidden} onChange={(v) => set("checklistHidden", !v)} />
          <div>
            <p className="text-sm font-semibold">Visibilidade dos valores</p>
            <p className="mb-2 text-xs text-muted">{VALUES_HINT[prefs.valuesMode]}</p>
            <div role="radiogroup" aria-label="Visibilidade dos valores" className="inline-flex gap-1 rounded-xl border border-line bg-panel p-1">
              {VALUES_MODES.map((m) => (
                <button key={m} type="button" role="radio" aria-checked={prefs.valuesMode === m} onClick={() => save({ valuesMode: m }, { ...prefs, valuesMode: m, showValues: m === "VISIBLE" })} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${prefs.valuesMode === m ? "bg-panel2 text-white shadow-sm" : "text-muted hover:text-zinc-100"}`}>
                  {VALUES_LABELS[m]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">Aparência</p>
            <ThemeSwitch />
          </div>
        </div>
      </Section>

      <Section title="Notificações">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="Canais de notificação">
            <thead>
              <tr className="text-left text-xs text-muted"><th className="pb-2 font-medium">Tipo</th><th className="w-20 pb-2 text-center font-medium">E-mail</th><th className="w-28 pb-2 text-center font-medium">Push no celular</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {NOTIFY_CATEGORIES.map(([k, label, hint]) => (
                <tr key={k}>
                  <td className="py-3 pr-3"><span className="block font-medium">{label}</span><span className="block text-xs text-muted">{hint}</span></td>
                  <td className="text-center"><input type="checkbox" className="h-4 w-4 accent-[rgb(var(--accent))]" checked={prefs.notifications[k].email} onChange={(e) => setChannel(k, "email", e.target.checked)} aria-label={`${label} por e-mail`} /></td>
                  <td className="text-center"><input type="checkbox" className="h-4 w-4 accent-[rgb(var(--accent))]" checked={prefs.notifications[k].push} onChange={(e) => setChannel(k, "push", e.target.checked)} aria-label={`${label} por push`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">O push só é entregue quando o app estiver instalado no celular com notificações permitidas.</p>
      </Section>

      <Section title="Segurança">
        <form onSubmit={changePw} className="space-y-4" aria-label="Alterar senha">
          <h3 className="font-semibold">Alterar senha</h3>
          {erro && <Alert>{erro}</Alert>}
          <Field label="Senha atual" required><input className="input" type="password" name="current" required autoComplete="current-password" /></Field>
          <Field label="Nova senha" required hint="Mínimo de 8 caracteres"><input className="input" type="password" name="next" required minLength={8} autoComplete="new-password" /></Field>
          <Field label="Confirmar nova senha" required><input className="input" type="password" name="confirm" required minLength={8} autoComplete="new-password" /></Field>
          <button className="btn-primary">Salvar senha</button>
        </form>
      </Section>
    </>
  );
}

export function ProfileTab({ name, email, avatarVersion, deletionRequestedAt }: { name: string; email: string; avatarVersion: string | null; deletionRequestedAt: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await api("/api/me", "PATCH", { name: value });
    setBusy(false);
    if (!r.ok) return toast(r.erro, "error");
    toast("Perfil atualizado");
    refreshSafe(router);
  }
  async function requestDeletion() {
    const ok = await confirmDialog({
      title: "Solicitar exclusão da conta?",
      body: "Seus dados (contas, lançamentos, titulares e anexos) serão apagados quando a administração concluir o pedido. Até lá você pode cancelar.",
      confirmLabel: "Solicitar exclusão",
      danger: true,
    });
    if (!ok) return;
    const r = await api("/api/me/deletion", "POST");
    if (!r.ok) return toast(r.erro, "error");
    toast("Pedido de exclusão registrado");
    refreshSafe(router);
  }
  async function cancelDeletion() {
    const r = await api("/api/me/deletion", "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    toast("Pedido de exclusão cancelado");
    refreshSafe(router);
  }

  return (
    <>
      <Section title="Dados do perfil">
        <form onSubmit={save} className="space-y-4">
          <Field label="E-mail"><input className="input" value={email} readOnly disabled /></Field>
          <Field label="Nome" required><input className="input" value={value} onChange={(e) => setValue(e.target.value)} required minLength={2} maxLength={100} autoComplete="name" /></Field>
          <div>
            <p className="mb-2 text-sm font-medium">Imagem de perfil</p>
            <AvatarUpload name={name} version={avatarVersion} />
          </div>
          <button className="btn-primary" disabled={busy || value.trim() === name}>Salvar alterações</button>
        </form>
      </Section>
      <Section title="Excluir conta" danger>
        {deletionRequestedAt ? (
          <div className="space-y-3">
            <p className="text-sm">Exclusão solicitada em {new Date(deletionRequestedAt).toLocaleDateString("pt-BR")}. A administração vai concluir o pedido e apagar os seus dados.</p>
            <button className="btn-ghost" onClick={cancelDeletion}>Cancelar pedido</button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted">Pela LGPD, você pode pedir a exclusão definitiva da sua conta e de todos os dados guardados nela. A ação não pode ser desfeita depois de concluída.</p>
            <button className="btn-ghost text-red-300" onClick={requestDeletion}>Solicitar exclusão</button>
          </div>
        )}
      </Section>
    </>
  );
}
