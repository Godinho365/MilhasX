// Informa às páginas o endereço pedido (x-pathname), para a checagem de permissão do membro da equipe
// (server/session.ts). Sempre sobrescreve o cabeçalho: o que vier do navegador é ignorado.
import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set("x-pathname", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/app/:path*", "/app", "/preview/:path*"] };
