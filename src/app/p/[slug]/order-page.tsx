import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { appName, publicBrand } from "@/server/session";
import { accessCookie, hasOrderAccess, ownerBranding, publicOrder } from "@/server/services/client-pages";
import { bannerUrl } from "@/domain/page-design";
import { PageShell } from "./central";
import { AccessGate } from "./pages";

/** Carrega o pedido do link e diz se o cliente já confirmou o acesso (4 dígitos do telefone). */
export async function loadOrderPage(slug: string, token: string) {
  const access = await hasOrderAccess(slug, token, (await cookies()).get(accessCookie(token))?.value);
  if (access === null) notFound();
  const r = await publicOrder(slug, token);
  if (!r) notFound();
  return { access, order: r.order, branding: await ownerBranding(r.userId) };
}

/** Moldura das páginas do pedido: mostra o portão de acesso até o cliente confirmar os dígitos. */
export function OrderShell({ slug, token, what, data, children }: { slug: string; token: string; what: string; data: Awaited<ReturnType<typeof loadOrderPage>>; children: React.ReactNode }) {
  const b = data.branding;
  return (
    <PageShell brand={publicBrand()} appName={appName()} bgColor={b.design.bgColor} banner={data.access ? bannerUrl(slug, b.bannerVersion) : null}>
      {data.access ? children : <AccessGate slug={slug} token={token} agency={b.agency} what={what} />}
    </PageShell>
  );
}
