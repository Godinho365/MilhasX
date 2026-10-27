"use client";
import { useEffect, useRef, useState } from "react";
import { Sparkles, Send } from "lucide-react";
import { api } from "@/lib/api";
import { Modal } from "./ui";

type Msg = { role: "user" | "assistant"; content: string };

/** Botão "IA" do cabeçalho: conversa com o assistente sobre a carteira do usuário. */
export function AssistantButton() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ enabled: boolean; remaining: number } | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || state) return;
    api<{ enabled: boolean; remaining: number }>("/api/assistant").then((r) => r.ok && setState({ enabled: r.data.enabled, remaining: r.data.remaining }));
  }, [open, state]);
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [msgs]);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const question = q.trim();
    if (!question) return;
    setQ("");
    setErro("");
    setMsgs((m) => [...m, { role: "user", content: question }]);
    setBusy(true);
    const r = await api<{ answer: string; remaining: number }>("/api/assistant", "POST", { question, history: msgs });
    setBusy(false);
    if (!r.ok) return setErro(r.erro);
    setMsgs((m) => [...m, { role: "assistant", content: r.data.answer }]);
    setState((s) => s && { ...s, remaining: r.data.remaining });
  }

  return (
    <>
      <button className="btn-subtle h-9 gap-1.5 rounded-full px-3 text-xs font-semibold" onClick={() => setOpen(true)} aria-label="Assistente IA">
        <Sparkles className="h-4 w-4 text-accent-light" />IA
      </button>
      {open && (
        <Modal open onClose={() => setOpen(false)} title="Assistente IA" size="md">
          {!state ? (
            <p className="text-sm text-muted">Carregando…</p>
          ) : !state.enabled ? (
            <p className="text-sm text-muted">O assistente não está configurado neste servidor. A administração precisa definir a variável <code>ANTHROPIC_API_KEY</code> no ambiente para ativá-lo.</p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="max-h-[50vh] min-h-32 space-y-3 overflow-y-auto" aria-live="polite">
                {msgs.length === 0 && <p className="text-sm text-muted">Pergunte sobre seus saldos, CPM ou estratégias. Ex.: “Qual programa tem o menor CPM na minha carteira?”</p>}
                {msgs.map((m, i) => (
                  <p key={i} className={`whitespace-pre-line rounded-xl px-3 py-2 text-sm ${m.role === "user" ? "ml-8 bg-accent-soft" : "mr-8 bg-panel2"}`}>{m.content}</p>
                ))}
                {busy && <p className="mr-8 animate-pulse rounded-xl bg-panel2 px-3 py-2 text-sm text-muted">Pensando…</p>}
                <div ref={end} />
              </div>
              {erro && <p className="text-sm text-red-300" role="alert">{erro}</p>}
              <form onSubmit={ask} className="flex gap-2">
                <input className="input flex-1" value={q} onChange={(e) => setQ(e.target.value)} maxLength={1000} placeholder="Escreva sua pergunta" aria-label="Pergunta ao assistente" disabled={busy || state.remaining === 0} />
                <button className="btn-primary btn-icon" disabled={busy || !q.trim() || state.remaining === 0} aria-label="Enviar pergunta"><Send className="h-4 w-4" /></button>
              </form>
              <p className="text-xs text-muted">{state.remaining} {state.remaining === 1 ? "pergunta restante" : "perguntas restantes"} hoje. As respostas podem conter erros.</p>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
