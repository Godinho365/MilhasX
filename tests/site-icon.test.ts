// Ícone do site (favicon) e as sugestões de tamanho das fotos: o ícone fica salvo na marca, é servido só com o site
// publicado, entra nos metadados das páginas; o editor mostra o campo e as sugestões.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { resetDb, Client } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as siteRoute from "@/app/api/site/route";
import { publicSiteImage, uploadSiteImage, getSite } from "@/server/services/site";
import { defaultContent, normalizeContent, imageIdsOf } from "@/domain/site";
import { siteMetadata } from "@/app/s/[slug]/site-page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {}, replace() {} }), useSearchParams: () => new URLSearchParams(), notFound: () => { throw new Error("404"); } }));

const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");
let c: Client, userId: string;
beforeEach(async () => {
  await resetDb();
  c = new Client();
  userId = (await c.call(register.POST, "POST", "/r", { name: "Ana Viagens", email: "ana@x.test", password: "senha-forte-1" })).data.user.id;
});

describe("ícone do site", () => {
  it("guarda na marca, entra nas fotos públicas e nos metadados; sem ícone, fica o padrão", async () => {
    const base = defaultContent({ name: "Ana Viagens" });
    expect(base.brand.iconId).toBeNull();
    expect(normalizeContent({ ...base, brand: { ...base.brand, iconId: "../x" } }, base).brand.iconId).toBeNull(); // id inválido some
    const icon = await uploadSiteImage(userId, PNG);
    const content = { ...base, brand: { ...base.brand, iconId: icon } };
    expect(imageIdsOf(normalizeContent(content, base)).has(icon)).toBe(true);

    expect((await c.call(siteRoute.PUT, "PUT", "/x", { slug: "ana-viagens", theme: "atlantico", published: false, content })).status).toBe(200);
    expect((await getSite(userId)).content.brand.iconId).toBe(icon);
    expect(await publicSiteImage("ana-viagens", icon)).toBeNull(); // site não publicado
    await c.call(siteRoute.PUT, "PUT", "/x", { theme: "atlantico", published: true, content });
    expect(await publicSiteImage("ana-viagens", icon)).toMatchObject({ mime: "image/png" });
    const meta = await siteMetadata("ana-viagens", "inicio") as { icons?: { icon: { url: string }[]; apple: { url: string }[] } };
    expect(meta.icons).toEqual({ icon: [{ url: `/api/public/site/ana-viagens/image/${icon}` }], apple: [{ url: `/api/public/site/ana-viagens/image/${icon}` }] });

    await c.call(siteRoute.PUT, "PUT", "/x", { theme: "atlantico", published: true, content: base });
    expect((await siteMetadata("ana-viagens", "inicio") as { icons?: unknown }).icons).toBeUndefined();
  });
});

describe("editor do site", () => {
  it("sugestão de tamanho na foto da capa (seção aberta ao entrar)", async () => {
    const { SiteBuilder } = await import("@/app/app/marketing/site/client");
    const initial = { slug: "ana-viagens", exists: true, theme: "atlantico", published: true, content: defaultContent({ name: "Ana Viagens" }), canRequest: false };
    const h = renderToStaticMarkup(createElement(SiteBuilder, { initial, packages: [] })).replace(/\u00a0/g, " ");
    expect(h).toContain("Foto da capa");
    expect(h).toContain("Sugestão: foto horizontal de 1920 × 1080 px (16:9), JPG ou WebP, até 3 MB.");
  });
});
