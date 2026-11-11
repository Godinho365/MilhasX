"use client";
// Chat Balcões em tempo real, no navegador: um WebSocket por aba (/ws). Cada evento diz o que mudou (chat e número
// da mensagem); quem assina decide o que buscar. Reconecta sozinho (espera crescente, ao voltar a internet e ao voltar
// para a aba) e, ao reconectar, pede ao servidor os eventos que perdeu ("desde o id X"); se perdeu demais, avisa para
// recarregar tudo (resync). Também acerta a diferença de relógio com o servidor para medir a latência.
import { useEffect, useRef, useState } from "react";

export type RtEvent = {
  id?: string; type: string; chatKind?: "GROUP" | "DM"; chatId?: string; msgId?: number; maxId?: number;
  linkId?: string; state?: string; receivedAt?: number; relayAt?: number;
  /** Só aqui no navegador: quando o evento chegou (hora daqui). */
  arrivedAt?: number;
};
export type RtState = "off" | "connecting" | "live" | "reconnecting";
type Listener = (e: RtEvent) => void;

const BACKOFF_MS = [1000, 2000, 5000, 10_000, 20_000, 30_000];
/** Sem nada do servidor por este tempo (ele manda sinal de vida a cada 25 s): a conexão morreu, reconecta. */
const SILENCE_MS = 60_000;

class Connection {
  state: RtState = "off";
  links: Record<string, string> = {};
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private stateListeners = new Set<() => void>();
  private lastId: bigint | null = null;
  private attempt = 0;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private silence: ReturnType<typeof setTimeout> | null = null;
  private offset = 0; // hora do servidor - hora daqui
  private bestRtt = Infinity;
  private users = 0;

  /** Liga quando a primeira tela que usa o tempo real abre; desliga quando a última fecha. */
  retain() {
    if (++this.users === 1) {
      window.addEventListener("online", this.kick);
      document.addEventListener("visibilitychange", this.onVisible);
      this.open();
    }
  }
  release() {
    if (--this.users > 0) return;
    window.removeEventListener("online", this.kick);
    document.removeEventListener("visibilitychange", this.onVisible);
    if (this.retry) clearTimeout(this.retry);
    if (this.silence) clearTimeout(this.silence);
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    this.setState("off");
  }
  on(fn: Listener) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }
  onState(fn: () => void) {
    this.stateListeners.add(fn);
    return () => void this.stateListeners.delete(fn);
  }
  /** Amostra de latência de um evento ao vivo, já com a mensagem na tela: net = do gateway receber do Telegram até o
   *  evento chegar aqui; visible = até a mensagem aparecer. As duas na hora do servidor (relógio acertado). */
  report(e: RtEvent) {
    if (!e.receivedAt || !e.arrivedAt || !Number.isFinite(this.bestRtt)) return;
    const net = e.arrivedAt + this.offset - e.receivedAt;
    const visible = Date.now() + this.offset - e.receivedAt;
    this.send({ type: "lat", net: Math.round(net), visible: Math.round(visible) });
  }

  private setState(s: RtState) {
    if (this.state === s) return;
    this.state = s;
    for (const f of this.stateListeners) f();
  }
  private emit(e: RtEvent) {
    for (const f of this.listeners) {
      try { f(e); } catch { /* uma tela com erro não derruba as outras */ }
    }
  }
  private send(m: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }
  private kick = () => {
    if (this.users > 0 && (!this.ws || this.ws.readyState > WebSocket.OPEN)) {
      if (this.retry) clearTimeout(this.retry);
      this.attempt = 0;
      this.open();
    }
  };
  private onVisible = () => { if (document.visibilityState === "visible") this.kick(); };
  private alive() {
    if (this.silence) clearTimeout(this.silence);
    this.silence = setTimeout(() => this.ws?.close(), SILENCE_MS);
  }

  private open() {
    this.setState(this.lastId == null ? "connecting" : "reconnecting");
    const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      this.alive();
      for (let i = 0; i < 3; i++) setTimeout(() => this.send({ type: "ping", t: Date.now() }), i * 300); // acerto do relógio
    };
    ws.onmessage = (m) => {
      this.alive();
      let e: RtEvent & { lastEventId?: string; links?: Record<string, string>; t?: number; server?: number };
      try { e = JSON.parse(String(m.data)); } catch { return; }
      e.arrivedAt = Date.now();
      if (e.type === "hb") return;
      if (e.type === "pong" && e.t && e.server) {
        const rtt = Date.now() - e.t;
        if (rtt < this.bestRtt) { this.bestRtt = rtt; this.offset = e.server - (e.t + rtt / 2); }
        return;
      }
      if (e.type === "hello") {
        this.links = e.links ?? {};
        const resume = this.lastId;
        if (resume == null) this.lastId = BigInt(e.lastEventId ?? "0");
        this.setState("live");
        if (resume != null) void this.catchUp(resume);
        this.emit({ type: "status" });
        return;
      }
      if (e.type === "status" && e.linkId) {
        this.links = { ...this.links, [e.linkId]: e.state ?? "unknown" };
        this.emit(e);
        return;
      }
      this.deliver(e);
    };
    ws.onclose = () => {
      if (this.ws !== ws || this.users === 0) return;
      this.ws = null;
      this.setState("reconnecting");
      const wait = BACKOFF_MS[Math.min(this.attempt++, BACKOFF_MS.length - 1)]! * (0.8 + Math.random() * 0.4);
      this.retry = setTimeout(() => this.open(), wait);
    };
  }

  /** Entrega um evento uma vez só (o mesmo pode vir ao vivo e na recuperação), em ordem. */
  private deliver(e: RtEvent) {
    if (e.id) {
      const id = BigInt(e.id);
      if (this.lastId != null && id <= this.lastId) return;
      this.lastId = id;
    }
    this.emit(e);
  }

  /** Depois de reconectar: os eventos perdidos enquanto estava fora. */
  private async catchUp(after: bigint) {
    try {
      const r = await fetch(`/api/telegram/events?after=${after}`, { credentials: "same-origin" });
      const j = (await r.json()) as { ok: boolean; reset?: boolean; items?: RtEvent[] };
      if (!j.ok) return;
      if (j.reset) return void this.emit({ type: "resync" });
      for (const e of j.items ?? []) this.deliver(e);
    } catch {
      this.emit({ type: "resync" }); // não deu para saber o que perdeu: recarrega
    }
  }
}

let conn: Connection | null = null;
const connection = () => (conn ??= new Connection());

/** Conexão em tempo real desta aba (enabled = o servidor está com o tempo real ligado). Devolve o estado e as contas. */
export function useRealtimeConnection(enabled: boolean) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const c = connection();
    const off = c.onState(() => force((n) => n + 1));
    const offEv = c.on((e) => { if (e.type === "status") force((n) => n + 1); });
    c.retain();
    return () => { off(); offEv(); c.release(); };
  }, [enabled]);
  const c = enabled ? connection() : null;
  return { state: c?.state ?? ("off" as RtState), links: c?.links ?? {} };
}

/** Recebe os eventos (a função mais recente é a usada; não precisa memorizar). */
export function useRealtimeEvents(enabled: boolean, fn: Listener) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!enabled) return;
    return connection().on((e) => ref.current(e));
  }, [enabled]);
}

/** Chame com a mensagem do evento já na tela: manda a amostra de latência para o servidor. */
export function reportLatency(e: RtEvent) {
  conn?.report(e);
}
