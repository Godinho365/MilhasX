// Servidor do site: o Next.js e, na mesma porta, o WebSocket do Chat Balcões em tempo real (/ws). O Next sozinho não
// abre WebSocket nas rotas da API; por isso o site sobe por aqui (npm start). O Caddy repassa o /ws sem configuração.
import { createServer } from "node:http";
import next from "next";
import Redis from "ioredis";
import { WebSocketServer } from "ws";
import { log } from "@/server/db";
import { RealtimeHub } from "@/server/realtime/hub";
import { realtimeEnabled, wsUpgradeHandler } from "@/server/realtime/upgrade";
import { BalcaoWatcher } from "@/server/realtime/balcao-watch";

const port = Number(process.env.PORT) || 3100;
const dev = process.env.NODE_ENV !== "production";

async function main() {
  const app = next({ dev, hostname: "0.0.0.0", port });
  const handle = app.getRequestHandler();
  await app.prepare();
  const upgradeNext = app.getUpgradeHandler();

  let hub: RealtimeHub | null = null;
  let redis: Redis | null = null;
  let watcher: BalcaoWatcher | null = null;
  if (realtimeEnabled() && process.env.REDIS_URL) {
    const sub = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
    redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });
    sub.on("error", (e) => log("warn", "rt.redis", { error: e.message }));
    redis.on("error", () => {});
    const reader = redis;
    hub = new RealtimeHub(sub, async (ids) => {
      if (!ids.length) return {};
      const vals = await reader.mget(ids.map((id) => `tg:status:${id}`));
      return Object.fromEntries(ids.map((id, i) => [id, vals[i] ? JSON.parse(vals[i]!) : null]));
    });
    log("info", "rt.enabled", {});
    // Balcão MilhasX: o que muda no Balcão vai na hora para as telas abertas (BALCAO_WATCH=off desliga)
    if (process.env.BALCAO_WATCH !== "off") {
      const pub = redis;
      watcher = new BalcaoWatcher((userId, ev) => pub.publish(`tg:user:${userId}`, JSON.stringify(ev)));
      watcher.start();
    }
  }
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });

  const server = createServer((req, res) => void handle(req, res));
  server.on("upgrade", wsUpgradeHandler(wss, () => hub, (req, socket, head) => void upgradeNext(req, socket, head)));
  server.listen(port, "0.0.0.0", () => log("info", "web.up", { port, realtime: !!hub }));

  const shutdown = () => {
    watcher?.stop();
    hub?.close();
    redis?.disconnect();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 8000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
