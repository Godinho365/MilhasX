import { consumeHolderLink, HOLDER_COOKIE } from "@/server/services/holder-access";

// Link do e-mail: troca o token de uso único por uma sessão de leitura e abre a página do titular
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const r = await consumeHolderLink((await params).token);
  const to = new URL(r ? "/h" : "/h?link=invalido", req.url);
  const headers = new Headers({ location: to.pathname + to.search, "cache-control": "no-store", "referrer-policy": "no-referrer" });
  if (r) {
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    headers.set("set-cookie", `${HOLDER_COOKIE}=${r.session}; Path=/; HttpOnly; SameSite=Lax; Expires=${r.expiresAt.toUTCString()}${secure}`);
  }
  return new Response(null, { status: 303, headers });
}
