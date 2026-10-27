"use client";
// Toasts e diálogo de confirmação do próprio app (substituem alert/confirm do navegador).
import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";

type Toast = { id: number; text: string; kind: "ok" | "error" };
type Confirm = { title: string; body?: string; confirmLabel?: string; danger?: boolean; resolve: (v: boolean) => void };

let pushToast: (t: Omit<Toast, "id">) => void = () => {};
let openConfirm: (c: Confirm) => void = () => {};

export const toast = (text: string, kind: Toast["kind"] = "ok") => pushToast({ text, kind });
export const confirmDialog = (c: Omit<Confirm, "resolve">) => new Promise<boolean>((resolve) => openConfirm({ ...c, resolve }));

// Efeito sonoro curto (preferência "Efeitos sonoros"); gerado na hora, sem arquivo de áudio
let audio: AudioContext | null = null;
function chime(kind: Toast["kind"]) {
  try {
    audio ??= new AudioContext();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = kind === "ok" ? 880 : 220;
    gain.gain.setValueAtTime(0.06, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.18);
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.2);
  } catch {
    // navegador sem Web Audio: segue sem som
  }
}

export function FeedbackHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  // Marca que o React assumiu a página (os testes E2E esperam por ela antes de interagir)
  useEffect(() => {
    document.documentElement.dataset.hydrated = "1";
  }, []);

  useEffect(() => {
    let seq = 0;
    pushToast = (t) => {
      const id = ++seq;
      setToasts((list) => [...list, { ...t, id }]);
      if (document.documentElement.dataset.sound === "on") chime(t.kind);
      setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), 4000);
    };
    openConfirm = setConfirm;
  }, []);

  useEffect(() => {
    if (!confirm) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function close(v: boolean) {
    confirm?.resolve(v);
    setConfirm(null);
  }

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex flex-col items-center gap-2 px-4 sm:bottom-auto sm:left-auto sm:right-4 sm:top-4 sm:items-end" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} role="status" className="pointer-events-auto flex w-full max-w-sm animate-pop-in items-start gap-3 rounded-xl border border-line bg-panel2 px-4 py-3 text-sm shadow-xl shadow-black/40">
            {t.kind === "ok" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-bad" />}
            <span className="flex-1">{t.text}</span>
            <button onClick={() => setToasts((l) => l.filter((x) => x.id !== t.id))} aria-label="Fechar aviso" className="text-muted hover:text-white"><X className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
      {confirm && (
        <div className="fixed inset-0 z-[60] flex animate-fade-in items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={() => close(false)}>
          <div role="alertdialog" aria-modal="true" aria-label={confirm.title} className="card w-full max-w-md animate-pop-in p-6" onMouseDown={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">{confirm.title}</h2>
            {confirm.body && <p className="mt-2 text-sm text-muted">{confirm.body}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => close(false)} autoFocus>Cancelar</button>
              <button className={confirm.danger ? "btn-danger" : "btn-primary"} onClick={() => close(true)}>{confirm.confirmLabel ?? "Confirmar"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
