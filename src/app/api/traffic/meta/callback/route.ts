import { readCookie, requireUser } from "@/server/http";
import { DomainError, log } from "@/server/db";
import { META_STATE_COOKIE, metaStateCookie, parseMetaState } from "@/server/meta";
import { finishMetaConnection } from "@/server/services/traffic";

/** Retorno do Meta: confere o state e a conta, troca o código pelo token, guarda e volta para o Tráfego. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const headers = new Headers({ "set-cookie": metaStateCookie(null) });
  const go = (q: string) => { headers.set("location", `/app/marketing/trafego?${q}`); return new Response(null, { status: 303, headers }); };
  const fail = (msg: string) => go(`erro=${encodeURIComponent(msg)}`);
  const saved = parseMetaState(readCookie(req, META_STATE_COOKIE));
  if (url.searchParams.get("error")) return fail("Conexão com o Facebook cancelada");
  const code = url.searchParams.get("code");
  if (!saved || !code || url.searchParams.get("state") !== saved.state) return fail("A conexão expirou. Tente de novo.");
  try {
    const u = await requireUser(req);
    if (u.id !== saved.userId) return fail("A conexão foi começada em outra conta. Tente de novo.");
    const r = await finishMetaConnection(req, u.id, code, u.actor.id);
    return go(`conectado=${r.accounts}`);
  } catch (e) {
    if (e instanceof DomainError) return fail(e.message);
    log("error", "traffic.meta_callback", { err: String(e) });
    return fail("Não foi possível conectar o Facebook. Tente de novo.");
  }
}
