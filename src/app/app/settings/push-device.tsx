"use client";
import { useEffect, useState } from "react";
import { Bell, BellOff, Smartphone } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "@/components/feedback";

type State = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

/** Chave pública VAPID (base64url) no formato que o navegador pede. */
function keyBytes(base64url: string) {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isInstalled = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

async function currentSubscription() {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

/**
 * Ativa o push neste aparelho: registra o service worker, pede a permissão e guarda o endereço no servidor.
 * `onFirstEnable` liga a coluna "Push no celular" quando ainda está tudo desligado.
 */
export function PushDevice({ vapidKey, onFirstEnable }: { vapidKey: string; onFirstEnable: () => void }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (!supported) return setState(isIos() && !isInstalled() ? "ios-install" : "unsupported");
      if (Notification.permission === "denied") return setState("denied");
      setState((await currentSubscription().catch(() => null)) ? "on" : "off");
    })();
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        return;
      }
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidKey) }));
      const r = await api("/api/push", "POST", sub.toJSON());
      if (!r.ok) {
        await sub.unsubscribe().catch(() => {});
        toast(r.erro, "error");
        return;
      }
      setState("on");
      onFirstEnable();
      toast("Notificações ativadas neste aparelho");
    } catch {
      toast("Não foi possível ativar as notificações neste navegador", "error");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    const sub = await currentSubscription().catch(() => null);
    if (sub) {
      await api("/api/push", "DELETE", { endpoint: sub.endpoint });
      await sub.unsubscribe().catch(() => {});
    }
    setBusy(false);
    setState("off");
    toast("Este aparelho não recebe mais notificações");
  }

  async function test() {
    setBusy(true);
    const r = await api("/api/push/test", "POST", {});
    setBusy(false);
    toast(r.ok ? "Enviamos uma notificação de teste" : r.erro, r.ok ? undefined : "error");
  }

  if (state === "loading") return null;
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-line bg-panel2/40 p-4 sm:flex-row sm:items-center">
      <Smartphone className="hidden h-5 w-5 shrink-0 text-accent-light sm:block" aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">Push neste aparelho</p>
        <p className="text-xs text-muted">
          {state === "on" && "Ativado: os avisos marcados em \"Push no celular\" chegam aqui."}
          {state === "off" && "Receba os avisos na tela do celular ou do computador, mesmo com o app fechado."}
          {state === "denied" && "As notificações estão bloqueadas para este site. Libere nas configurações do navegador e recarregue a página."}
          {state === "ios-install" && "No iPhone: toque em Compartilhar › Adicionar à Tela de Início, abra o MilhasX pelo ícone e ative aqui (iOS 16.4 ou mais novo)."}
          {state === "unsupported" && "Este navegador não recebe notificações push. No Android, use o Chrome."}
        </p>
      </div>
      {state === "off" && (
        <button type="button" className="btn-primary h-9 shrink-0" onClick={enable} disabled={busy}>
          <Bell className="h-4 w-4" aria-hidden /> {busy ? "Ativando…" : "Ativar neste aparelho"}
        </button>
      )}
      {state === "on" && (
        <div className="flex shrink-0 gap-2">
          <button type="button" className="btn-subtle h-9" onClick={test} disabled={busy}>Enviar teste</button>
          <button type="button" className="btn-subtle h-9" onClick={disable} disabled={busy} aria-label="Desativar neste aparelho">
            <BellOff className="h-4 w-4" aria-hidden /> Desativar
          </button>
        </div>
      )}
    </div>
  );
}
