import { requireUser } from "@/server/http";
import { DomainError } from "@/server/db";
import { credentialsEnabled } from "@/server/services/accounts";
import { metaAuthUrl, metaEnabled, metaStateCookie, newMetaState } from "@/server/meta";

const back = (msg: string) => new Response(null, { status: 303, headers: { location: `/app/marketing/trafego?erro=${encodeURIComponent(msg)}` } });

/** Início do "Conectar com o Facebook": guarda o state (amarrado à conta) num cookie e manda para o Meta. */
export async function GET(req: Request) {
  let userId: string;
  try {
    userId = (await requireUser(req)).id;
  } catch (e) {
    if (e instanceof DomainError && e.status === 401) return new Response(null, { status: 303, headers: { location: "/login" } });
    return back(e instanceof DomainError ? e.message : "Sem permissão");
  }
  if (!metaEnabled() || !credentialsEnabled()) return back("A conexão com o Meta não está configurada neste servidor");
  const state = newMetaState();
  return new Response(null, { status: 303, headers: { location: metaAuthUrl(req, state), "set-cookie": metaStateCookie({ state, userId }) } });
}
