// Gateway do Chat Balcões em tempo real: o único processo que conecta no Telegram. Uso (contêiner tg-gateway):
//   npx tsx src/gateway/main.ts
// Precisa de DATABASE_URL, REDIS_URL, CREDENTIALS_KEY, TELEGRAM_API_ID e TELEGRAM_API_HASH; escuta em GATEWAY_PORT
// (padrão 3200) só na rede interna.
import { log } from "@/server/db";
import { telegramEnabled } from "@/server/services/telegram";
import { RedisBus } from "./bus";
import { gramLive } from "./live";
import { Gateway } from "./manager";
import { gatewayServer } from "./server";

async function main() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error("Defina REDIS_URL");
  if (!telegramEnabled()) log("warn", "tg.disabled", { reason: "faltam TELEGRAM_API_ID/TELEGRAM_API_HASH/CREDENTIALS_KEY" });
  const bus = await RedisBus.connect(redisUrl);
  const gw = new Gateway({ factory: gramLive, bus });
  const port = Number(process.env.GATEWAY_PORT) || 3200;
  const server = gatewayServer(gw).listen(port, "0.0.0.0", () => log("info", "tg.gateway_up", { port, nodeId: gw.nodeId }));
  if (telegramEnabled()) await gw.start();

  let closing = false;
  const shutdown = async (sig: string) => {
    if (closing) return;
    closing = true;
    log("info", "tg.gateway_down", { sig });
    server.close();
    await gw.stop().catch(() => {});
    await bus.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
  // um erro solto de uma conexão não pode derrubar as outras contas
  process.on("unhandledRejection", (e) => log("error", "tg.unhandled", { error: e instanceof Error ? e.message : String(e) }));
}

main().catch((e) => {
  log("error", "tg.gateway_crash", { error: e instanceof Error ? e.message : String(e) });
  process.exit(1);
});
