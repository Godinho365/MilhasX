// Gateway do Chat Balcões: o servidor HTTP interno (só na rede do Docker, sem porta publicada).
// POST /rpc  → pedido do site ao Telegram (com o token derivado da CREDENTIALS_KEY)
// GET /health → líder e estado de cada conta (sem dados pessoais: ids internos e horários)
import { createServer, type IncomingMessage, type Server } from "node:http";
import { log } from "@/server/db";
import { decodeBytes, encodeBytes, errorToRpc, rpcTokenOk, type RpcMethod } from "@/server/telegram-rpc";
import type { Gateway } from "./manager";

/** Teto do corpo do pedido: arquivo de até 10 MB em base64 cabe com folga. */
const MAX_BODY = 20 * 1024 * 1024;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error("corpo grande demais")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function gatewayServer(gw: Gateway): Server {
  return createServer(async (req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    try {
      if (req.method === "GET" && req.url === "/health") return send(gw.leader ? 200 : 503, gw.health());
      if (req.method !== "POST" || req.url !== "/rpc") return send(404, { ok: false, error: { message: "não encontrado" } });
      if (!rpcTokenOk(req.headers["x-gateway-token"] as string | undefined)) return send(401, { ok: false, error: { domain: { status: 401, message: "Pedido ao gateway sem autorização" } } });
      const body = JSON.parse(await readBody(req)) as { linkId?: string; method?: RpcMethod; args?: unknown[] };
      if (!body.linkId || !body.method || !Array.isArray(body.args)) return send(400, { ok: false, error: { domain: { status: 400, message: "Pedido incompleto" } } });
      const started = Date.now();
      try {
        const result = await gw.rpc(body.linkId, body.method, decodeBytes(body.args) as unknown[]);
        send(200, { ok: true, result: encodeBytes(result ?? null) });
      } catch (e) {
        send(200, { ok: false, error: errorToRpc(e) });
      } finally {
        const ms = Date.now() - started;
        if (ms > 5000) log("warn", "tg.rpc_slow", { method: body.method, ms });
      }
    } catch (e) {
      send(500, { ok: false, error: { message: e instanceof Error ? e.message : "erro" } });
    }
  });
}
