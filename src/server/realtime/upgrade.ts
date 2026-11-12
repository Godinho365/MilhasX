// Chat Balcões em tempo real: quem pode abrir o WebSocket. Só com a sessão do app (o cookie, igual às rotas da API) e
// vindo do próprio site (Origin): outro site não consegue abrir a conexão em nome de quem está logado.
import type { IncomingMessage } from "node:http";
import { getUserByToken, SESSION_COOKIE } from "../auth";
import { gatewayUrl } from "../telegram-rpc";

/** Tempo real ligado: a chave e o gateway (sem o gateway não há eventos). */
export const realtimeEnabled = () => process.env.REALTIME_ENABLED === "true" && !!gatewayUrl();

function cookieValue(header: string | undefined, name: string) {
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/** Origens aceitas: a do APP_URL e a do próprio pedido (Host), como na checagem das rotas da API. */
function originOk(req: IncomingMessage) {
  const origin = req.headers.origin;
  if (!origin) return false; // navegador sempre manda Origin no WebSocket
  const allowed = new Set<string>();
  if (process.env.APP_URL) allowed.add(new URL(process.env.APP_URL).origin);
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  const proto = req.headers["x-forwarded-proto"] ?? "http";
  if (host) allowed.add(`${proto}://${host}`);
  return allowed.has(origin);
}

/** O usuário da conexão, ou o motivo da recusa (status HTTP). */
export async function authorizeUpgrade(req: IncomingMessage): Promise<{ userId: string } | { status: 401 | 403 | 404 }> {
  if (!realtimeEnabled()) return { status: 404 };
  if (!originOk(req)) return { status: 403 };
  const user = await getUserByToken(cookieValue(req.headers.cookie, SESSION_COOKIE));
  return user ? { userId: user.id } : { status: 401 };
}

/** O tratamento do pedido de WebSocket (/ws) no servidor HTTP: autentica e entrega a conexão ao hub; o resto vai para
 *  `other` (o HMR do Next em desenvolvimento). */
export function wsUpgradeHandler(wss: import("ws").WebSocketServer, hub: () => import("./hub").RealtimeHub | null, other?: (req: IncomingMessage, socket: import("node:stream").Duplex, head: Buffer) => void) {
  return (req: IncomingMessage, socket: import("node:stream").Duplex, head: Buffer) => {
    const path = (req.url ?? "").split("?")[0];
    if (path !== "/ws") return void other?.(req, socket, head);
    void authorizeUpgrade(req).then((r) => {
      const h = hub();
      if ("status" in r || !h) {
        const status = "status" in r ? r.status : 404;
        socket.write(`HTTP/1.1 ${status} ${status === 401 ? "Unauthorized" : status === 403 ? "Forbidden" : "Not Found"}\r\nConnection: close\r\n\r\n`);
        return void socket.destroy();
      }
      wss.handleUpgrade(req, socket, head, (ws) => void h.attach(ws, r.userId).catch(() => ws.terminate()));
    }, () => socket.destroy());
  };
}
