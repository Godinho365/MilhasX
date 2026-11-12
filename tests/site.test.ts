// Site da agência: temas, conteúdo comum, publicação, fotos e isolamento.
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, Client } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as siteRoute from "@/app/api/site/route";
import * as salesProfile from "@/app/api/sales-profile/route";
import * as publicOrders from "@/app/api/public/orders/[slug]/route";
import * as publicLeads from "@/app/api/public/leads/[slug]/route";
import { publicSite, publicSiteImage, uploadSiteImage } from "@/server/services/site";
import { publicSalesProfile } from "@/server/services/settings";
import { ownerBranding } from "@/server/services/client-pages";
import { centralLook } from "@/domain/central-look";
import { resolveDesign } from "@/domain/page-design";
import { defaultContent, normalizeContent, imageIdsOf } from "@/domain/site";
import { SITE_THEMES, sampleContent, themeById } from "@/domain/site-themes";
import { prisma } from "@/server/db";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SiteView, type SiteCtx } from "@/components/site/site-view";
import type { SiteContent } from "@/domain/site";

let c: Client, o: Client;
let userId: string;
const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");

beforeEach(async () => {
  await resetDb();
  c = new Client();
  o = new Client();
  userId = (await c.call(register.POST, "POST", "/r", { name: "Ana Viagens", email: "ana@x.test", password: "senha-forte-1" })).data.user.id;
  await o.call(register.POST, "POST", "/r", { name: "Outro", email: "o@x.test", password: "senha-forte-2" });
});

describe("site: conteúdo e temas", () => {
  it("5 temas com as mesmas páginas; números e depoimentos de exemplo começam desligados", () => {
    expect(SITE_THEMES.map((t) => t.id)).toEqual(["atlantico", "prestige", "trilha", "caderno", "ciranda"]);
    const d = defaultContent({ name: "Ana" });
    expect(Object.keys(d.pages)).toEqual(["inicio", "destinos", "sobre", "contato"]);
    const home = d.pages.inicio.sections;
    expect(home.find((s) => s.type === "numeros")!.on).toBe(false);
    expect(home.find((s) => s.type === "depoimentos")!.on).toBe(false);
    expect(home.find((s) => s.type === "hero")!.on).toBe(true);
    // conversão: selos logo depois da capa e o formulário de cotação no início e no contato
    expect(home.map((s) => s.type).slice(0, 2)).toEqual(["hero", "selos"]);
    expect(home.some((s) => s.type === "cotacao" && s.on)).toBe(true);
    expect(d.pages.contato.sections.map((s) => s.type)).toEqual(["hero", "cotacao", "contato", "milhas", "faq"]);
    const hero = home[0]!;
    expect(hero.type === "hero" && [hero.button, hero.button2, hero.note]).toEqual(["Pedir minha cotação", "Chamar no WhatsApp", "Resposta rápida · sem compromisso"]);
    // a galeria mostra o tema com textos de exemplo (outra agência fictícia)
    for (const t of SITE_THEMES) expect(sampleContent(t).brand.name).toBe(t.sample.name);
  });

  it("normaliza o que vem do editor: tipo desconhecido sai, textos e listas têm limite, início sempre no menu", () => {
    const base = defaultContent({ name: "Ana" });
    const c2 = normalizeContent({
      brand: { name: "  Ana Viagens  ", instagram: "@ana.viagens", accent: "#FF0000", logoId: "../x" },
      pages: { inicio: { on: false, sections: [{ type: "hero", title: "x".repeat(500), imageId: "abc" }, { type: "script", html: "<b>" }, { type: "numeros", items: [{ value: "1" }, { value: "2" }, { value: "3" }, { value: "4" }, { value: "5" }] }] } },
    }, base);
    expect(c2.brand).toMatchObject({ name: "Ana Viagens", instagram: "ana.viagens", accent: "#ff0000", logoId: null });
    expect(c2.pages.inicio.on).toBe(true);
    expect(c2.pages.inicio.sections.map((s) => s.type)).toEqual(["hero", "numeros"]);
    const hero = c2.pages.inicio.sections[0]!;
    expect(hero.type === "hero" && hero.title.length).toBe(120);
    expect(hero.type === "hero" && hero.imageId).toBeNull();
    const nums = c2.pages.inicio.sections[1]!;
    expect(nums.type === "numeros" && nums.items.length).toBe(4);
    // página que não veio fica com o padrão
    expect(c2.pages.sobre).toEqual(base.pages.sobre);
    // redes: aceita @usuario ou o link inteiro e guarda só o usuário
    const social = normalizeContent({ brand: { instagram: "https://www.instagram.com/ana.viagens/?hl=pt", facebook: "facebook.com/AnaViagens", tiktok: "https://www.tiktok.com/@anaviagens", cnpj: "12.345.678/0001-90", cadastur: "21.123456.10.0001-1" } }, base).brand;
    expect(social).toMatchObject({ instagram: "ana.viagens", tiktok: "anaviagens", cnpj: "12.345.678/0001-90", cadastur: "21.123456.10.0001-1" });
    // nome e frase são opcionais: vazio continua vazio; a frase não vem preenchida
    expect(base.brand.tagline).toBe("");
    expect(normalizeContent({ brand: { name: "", tagline: "" } }, base).brand).toMatchObject({ name: "", tagline: "" });
  });
});

describe("site: salvar, publicar e fotos", () => {
  it("cria o endereço junto, publica, troca de tema sem perder o conteúdo e isola as fotos", async () => {
    let g = (await c.call(siteRoute.GET, "GET", "/x")).data.item;
    expect(g).toMatchObject({ slug: null, exists: false, theme: null, published: false });
    expect(g.content.brand.name).toBe("Ana Viagens");
    expect((await c.call(siteRoute.PUT, "PUT", "/x", { theme: "atlantico", published: false, content: g.content })).status).toBe(400); // sem endereço
    expect((await c.call(siteRoute.PUT, "PUT", "/x", { slug: "ana", theme: "nao-existe", published: false, content: g.content })).status).toBe(400);

    const foto = await uploadSiteImage(userId, PNG);
    g.content.pages.inicio.sections[0].imageId = foto;
    g.content.pages.inicio.sections[0].title = "Praias do Nordeste";
    const r = await c.call(siteRoute.PUT, "PUT", "/x", { slug: "ana-viagens", theme: "atlantico", published: true, content: g.content });
    expect(r.status).toBe(200);
    expect(r.data.item).toMatchObject({ slug: "ana-viagens", theme: "atlantico", published: true });
    // a página da agência nasce sem publicar a Central
    expect(await prisma.salesProfile.findUniqueOrThrow({ where: { slug: "ana-viagens" } })).toMatchObject({ published: false });

    let pub = await publicSite("ana-viagens");
    expect(pub!.theme).toBe("atlantico");
    expect(pub!.content.pages.inicio.sections[0]).toMatchObject({ title: "Praias do Nordeste", imageId: foto });
    expect(await publicSiteImage("ana-viagens", foto)).toMatchObject({ mime: "image/png" });

    // trocar de tema mantém o conteúdo
    g = (await c.call(siteRoute.GET, "GET", "/x")).data.item;
    await c.call(siteRoute.PUT, "PUT", "/x", { theme: "prestige", published: true, content: g.content });
    pub = await publicSite("ana-viagens");
    expect(pub!.theme).toBe("prestige");
    expect(pub!.content.pages.inicio.sections[0]).toMatchObject({ title: "Praias do Nordeste" });

    // foto de outro usuário não entra; foto fora do conteúdo não é pública
    const alheia = await uploadSiteImage((await prisma.user.findFirstOrThrow({ where: { email: "o@x.test" } })).id, PNG);
    g.content.pages.inicio.sections[0].imageId = alheia;
    expect((await c.call(siteRoute.PUT, "PUT", "/x", { theme: "prestige", published: true, content: g.content })).status).toBe(404);
    const solta = await uploadSiteImage(userId, PNG);
    expect(await publicSiteImage("ana-viagens", solta)).toBeNull();
    expect(imageIdsOf(pub!.content).has(foto)).toBe(true);

    // fora do ar ou conta desativada: não aparece
    g = (await c.call(siteRoute.GET, "GET", "/x")).data.item;
    await c.call(siteRoute.PUT, "PUT", "/x", { theme: "prestige", published: false, content: g.content });
    expect(await publicSite("ana-viagens")).toBeNull();
    expect(await publicSiteImage("ana-viagens", foto)).toBeNull();
    await c.call(siteRoute.PUT, "PUT", "/x", { theme: "prestige", published: true, content: g.content });
    await prisma.user.update({ where: { id: userId }, data: { status: "DISABLED" } });
    expect(await publicSite("ana-viagens")).toBeNull();
  });

  it("cotação e gestão de milhas do site viram pedido e interessado, mesmo sem a Central publicada", async () => {
    const pub = (path: string, body: unknown, mod: typeof publicOrders | typeof publicLeads) =>
      mod.POST(new Request(`http://localhost:3100${path}`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "9.9.9.9" }, body: JSON.stringify(body) }), { params: Promise.resolve({ slug: "ana-viagens" }) });
    const order = { customerName: "Cliente Site", customerPhone: "11988887777", tripType: "ONE_WAY", cabin: "ECONOMY", segments: [{ origin: "GRU", destination: "LIS", date: null }], adults: 2, children: 0, infants: 0, notes: "Pelo site" };
    const lead = { name: "Interessado Site", phone: "11977776666", programs: ["LATAM Pass"] };
    const g = (await c.call(siteRoute.GET, "GET", "/x")).data.item;
    await c.call(siteRoute.PUT, "PUT", "/x", { slug: "ana-viagens", theme: "atlantico", published: false, content: g.content });
    // nem Central nem site no ar: não aceita
    expect((await pub("/x", order, publicOrders)).status).toBe(404);
    expect((await pub("/x", lead, publicLeads)).status).toBe(404);
    await c.call(siteRoute.PUT, "PUT", "/x", { theme: "atlantico", published: true, content: g.content });
    expect((await pub("/x", order, publicOrders)).status).toBe(201);
    expect((await pub("/x", lead, publicLeads)).status).toBe(201);
    expect(await prisma.travelOrder.findFirstOrThrow({ where: { userId } })).toMatchObject({ customerName: "Cliente Site", source: "PUBLIC" });
    expect(await prisma.milesLead.count({ where: { userId } })).toBe(1);
  });

  it("usa o endereço que já existe e não deixa pegar o de outra agência", async () => {
    await o.call(salesProfile.PATCH, "PATCH", "/api/sales-profile", { slug: "ocupado", published: true });
    const g = (await c.call(siteRoute.GET, "GET", "/x")).data.item;
    expect((await c.call(siteRoute.PUT, "PUT", "/x", { slug: "ocupado", theme: "trilha", published: true, content: g.content })).status).toBe(409);
    await c.call(salesProfile.PATCH, "PATCH", "/api/sales-profile", { slug: "ana-oficial", published: false });
    const r = await c.call(siteRoute.PUT, "PUT", "/x", { slug: "outro-qualquer", theme: "trilha", published: true, content: g.content });
    expect(r.data.item.slug).toBe("ana-oficial"); // o endereço já cadastrado vale
    expect(await publicSite("ocupado")).toBeNull(); // a outra agência não tem site publicado
  });
});

describe("Central de atendimento com o tema do site", () => {
  it("o tema vira as cores, fontes e cantos da Central (claro ou escuro) e respeita a cor de destaque", () => {
    const light = centralLook(themeById("atlantico"));
    expect(light).toMatchObject({ base: "client", name: "Atlântico", cards: "shadow" });
    expect(light.vars).toMatchObject({ "--hero": "14 116 144", "--on-hero": "255 255 255" });
    expect(light.vars).toMatchObject({ "--bg": "251 247 240", "--accent": "14 116 144", "--look-radius": "20px", "--look-btn-radius": "999px" });
    const dark = centralLook(themeById("prestige"), "#ff0000");
    expect(dark.base).toBe("dark");
    expect(dark.vars["--accent"]).toBe("255 0 0");
    expect(dark.vars["--look-head"]).toContain("Georgia");
    expect(centralLook(themeById("prestige"), "javascript:x").vars["--accent"]).toBe("201 164 92"); // cor inválida: a do tema
    expect(resolveDesign(null).siteTheme).toBe(true);
    expect(resolveDesign({ siteTheme: false }).siteTheme).toBe(false);
  });

  it("páginas publicadas usam o tema salvo do site; desligar a opção volta à cor própria", async () => {
    const g = (await c.call(siteRoute.GET, "GET", "/x")).data.item;
    const content = { ...g.content, brand: { ...g.content.brand, accent: "#123456" } };
    await c.call(siteRoute.PUT, "PUT", "/x", { slug: "ana-viagens", theme: "prestige", published: false, content });
    const central = { slug: "ana-viagens", displayName: "Ana Viagens", published: true, programIds: [] };
    expect((await c.call(salesProfile.PUT, "PUT", "/api/sales-profile", central)).status).toBe(200);
    const p = await publicSalesProfile("ana-viagens");
    expect(p?.look).toMatchObject({ base: "dark", name: "Prestige" });
    expect(p?.look?.vars["--accent"]).toBe("18 52 86");
    expect((await ownerBranding(userId)).look?.name).toBe("Prestige"); // cotação, reserva e termo também
    await c.call(salesProfile.PUT, "PUT", "/api/sales-profile", { ...central, design: { siteTheme: false } });
    expect((await publicSalesProfile("ana-viagens"))?.look).toBeNull();
    expect((await ownerBranding(userId)).look).toBeNull();
  });

  it("sem site, a Central segue com o visual próprio", async () => {
    await c.call(salesProfile.PUT, "PUT", "/api/sales-profile", { slug: "ana-viagens", displayName: "Ana Viagens", published: true, programIds: [] });
    expect((await publicSalesProfile("ana-viagens"))?.look).toBeNull();
  });
});

describe("site: botões de pedir cotação", () => {
  // conteúdo sem nenhuma seção de formulário de cotação (como os sites salvos antes dela existir)
  const semFormulario = (whatsapp: string): SiteContent => {
    const base = defaultContent({ name: "Ana Viagens", whatsapp });
    const pages = Object.fromEntries(Object.entries(base.pages).map(([k, p]) => [k, { ...p, sections: p.sections.filter((x) => x.type !== "cotacao") }]));
    return { ...base, pages } as SiteContent;
  };
  const html = (content: SiteContent, requestHref: string | null) => renderToStaticMarkup(createElement(SiteView, { ctx: {
    theme: themeById("atlantico"), content, page: "inicio", packages: [], href: (p) => `/s/ana${p === "inicio" ? "" : `/${p}`}`,
    img: () => "", pkgImg: () => null, requestHref, slug: "ana",
  } satisfies SiteCtx }));
  const topo = (h: string) => h.slice(h.indexOf("<header"), h.indexOf("</header>"));

  it("com o formulário no site, o topo e a capa levam a ele", () => {
    const h = html(defaultContent({ name: "Ana Viagens", whatsapp: "11999990000" }), "/p/ana/solicitar");
    expect(topo(h)).toMatch(/href="#cotacao"[^>]*>Pedir cotação</);
    expect(h).not.toContain("/p/ana/solicitar");
  });

  it("sem formulário no site, levam à página Pedir cotação de viagem da Central", () => {
    const h = html(semFormulario("11999990000"), "/p/ana/solicitar");
    const link = (label: string) => new RegExp(`href="/p/ana/solicitar"[^>]*>${label}<`);
    expect(topo(h)).toMatch(link("Pedir cotação"));
    expect(h).toMatch(link("Pedir minha cotação")); // botão da capa
  });

  it("sem formulário e sem a Central recebendo pedidos, o topo volta ao WhatsApp", () => {
    const h = topo(html(semFormulario("11999990000"), null));
    expect(h).not.toContain("Pedir cotação");
    expect(h).toContain("Falar com a gente");
    expect(h).toContain("https://wa.me/5511999990000");
  });
});
