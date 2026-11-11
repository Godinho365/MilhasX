// Gateway do Chat Balcões: o Redis. Três usos: publicar os eventos para os navegadores (canal por usuário), a trava
// de líder (só um gateway conecta no Telegram, mesmo se subirem dois) e o status de cada conta (para o indicador da
// tela). Nos testes, uma versão em memória.
import Redis from "ioredis";

export interface Bus {
  publish(channel: string, payload: unknown): Promise<void>;
  /** Pega ou renova a liderança por ttlMs. false = outro gateway é o líder. Lança se o Redis estiver fora. */
  leader(id: string, ttlMs: number): Promise<boolean>;
  release(id: string): Promise<void>;
  setStatus(linkId: string, status: unknown, ttlSec: number): Promise<void>;
  close(): Promise<void>;
}

/** Canal dos eventos de um usuário (o site assina o do usuário de cada navegador conectado). */
export const userChannel = (userId: string) => `tg:user:${userId}`;
export const statusKey = (linkId: string) => `tg:status:${linkId}`;
const LEADER_KEY = "tg:gateway:leader";

// pega a trava se estiver livre ou renova se já for nossa; de outro = não
const LEADER_LUA = `
local v = redis.call('GET', KEYS[1])
if v == ARGV[1] then redis.call('PEXPIRE', KEYS[1], ARGV[2]) return 1 end
if not v then redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2]) return 1 end
return 0`;
const RELEASE_LUA = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`;

export class RedisBus implements Bus {
  private constructor(private r: Redis) {}

  /** Conecta e espera o Redis ficar pronto (até 10 s; depois segue e as tentativas seguintes acertam). */
  static async connect(url: string) {
    // fila desligada: com o Redis fora, o comando falha na hora (o evento já está no banco; não acumula na memória)
    const r = new Redis(url, { lazyConnect: false, enableOfflineQueue: false, maxRetriesPerRequest: 1, connectTimeout: 5000 });
    r.on("error", () => {}); // a reconexão é do ioredis; as falhas aparecem em cada comando
    if (r.status !== "ready") {
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, 10_000);
        r.once("ready", () => { clearTimeout(t); resolve(); });
      });
    }
    return new RedisBus(r);
  }
  async publish(channel: string, payload: unknown) {
    await this.r.publish(channel, JSON.stringify(payload));
  }
  async leader(id: string, ttlMs: number) {
    return (await this.r.eval(LEADER_LUA, 1, LEADER_KEY, id, String(ttlMs))) === 1;
  }
  async release(id: string) {
    await this.r.eval(RELEASE_LUA, 1, LEADER_KEY, id).catch(() => {});
  }
  async setStatus(linkId: string, status: unknown, ttlSec: number) {
    await this.r.set(statusKey(linkId), JSON.stringify(status), "EX", ttlSec);
  }
  async close() {
    await this.r.quit().catch(() => this.r.disconnect());
  }
}

/** Para os testes: guarda o que foi publicado; a liderança é de quem pegar primeiro (ou forçada). */
export class MemoryBus implements Bus {
  published: { channel: string; payload: Record<string, unknown> }[] = [];
  status = new Map<string, unknown>();
  holder: string | null = null;
  down = false;
  async publish(channel: string, payload: unknown) {
    if (this.down) throw new Error("redis fora");
    this.published.push({ channel, payload: payload as Record<string, unknown> });
  }
  async leader(id: string) {
    if (this.down) throw new Error("redis fora");
    if (this.holder === null || this.holder === id) { this.holder = id; return true; }
    return false;
  }
  async release(id: string) {
    if (this.holder === id) this.holder = null;
  }
  async setStatus(linkId: string, status: unknown) {
    this.status.set(linkId, status);
  }
  async close() {}
}
