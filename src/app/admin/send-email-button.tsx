"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MailCheck, Send } from "lucide-react";
import { api } from "@/lib/api";
import { refreshSafe } from "@/lib/nav";
import { toast, confirmDialog } from "@/components/feedback";
import type { EmailSentState } from "@/domain/admin-contact";

/**
 * Botão "Enviar e-mail" do admin: o MilhasX manda a mensagem pelo servidor (no lugar do mailto). Depois do envio
 * mostra "Enviado em dd/mm" e fica travado por 24 h; passado o prazo, o botão volta com a data do último envio.
 */
export function SendEmailButton({ path, body, label, confirm, sent, compact = false, disabledReason = null }: {
  path: string;
  body: Record<string, string>;
  label: string;
  confirm: { title: string; body: string };
  sent: EmailSentState | null;
  compact?: boolean;
  /** Quando não dá para enviar (ex.: cadastro antigo): o botão aparece apagado com o motivo. */
  disabledReason?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const cls = compact ? "btn-ghost h-8 px-2.5 text-xs" : "btn-ghost";

  if (justSent || sent?.blocked) {
    const title = sent?.blocked ? `Já enviado. Dá para mandar de novo a partir de ${sent.again}.` : "Enviado agora. Dá para mandar de novo daqui a 24 h.";
    return (
      <span className={`${cls} cursor-default border-green-400/40 text-green-400`} title={title} role="status">
        <MailCheck className="h-4 w-4" />{sent?.blocked ? `Enviado em ${sent.sentOn}` : "Enviado agora"}
      </span>
    );
  }

  async function send() {
    if (!(await confirmDialog({ title: confirm.title, body: confirm.body, confirmLabel: "Enviar" }))) return;
    setBusy(true);
    const r = await api(path, "POST", body);
    setBusy(false);
    if (!r.ok) {
      toast(r.erro, "error");
      if (r.status === 429) refreshSafe(router); // outra pessoa mandou antes: mostra quando
      return;
    }
    setJustSent(true);
    toast("E-mail enviado");
    refreshSafe(router);
  }

  // Apagado como o WhatsApp sem telefone: um <span> (o botão desabilitado não mostra o motivo ao passar o mouse)
  if (disabledReason) return <span className={`${cls} cursor-not-allowed opacity-50`} title={disabledReason}><Send className="h-4 w-4" />{label}</span>;
  return (
    <button type="button" className={cls} disabled={busy} onClick={send} title={sent ? `Último envio em ${sent.sentOn}` : "O MilhasX envia pelo servidor, com o visual da marca"}>
      <Send className="h-4 w-4" />{busy ? "Enviando…" : label}
      {sent && !busy && <span className="font-normal text-muted">· último {sent.sentOn}</span>}
    </button>
  );
}
