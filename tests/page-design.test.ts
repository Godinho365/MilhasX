// "Sua MilhasX" › Personalizar: textos de cada página, botões, cor de fundo, banner e prévia do link
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, Client } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as salesProfile from "@/app/api/sales-profile/route";
import * as banner from "@/app/api/sales-profile/banner/route";
import * as publicBanner from "@/app/api/public/banner/[slug]/route";
import { publicSalesProfile } from "@/server/services/settings";
import { resolveDesign, themeForBg, DEFAULT_DESIGN } from "@/domain/page-design";
import { prisma } from "@/server/db";

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4b30000000049454e44ae426082", "hex");
const base = { slug: "ana-milhas", displayName: "Ana Milhas", programIds: [], published: true };

let c: Client;
let userId: string;
beforeEach(async () => {
  await resetDb();
  c = new Client();
  const r = await c.call(register.POST, "POST", "/r", { name: "Ana Souza", email: "ana@x.test", password: "senha-forte-1" });
  userId = r.data.user.id;
});

const setPlan = (plan: "PESSOAL" | "PRO") => prisma.user.update({ where: { id: userId }, data: { plan, trialEndsAt: new Date(0) } });
const putBanner = (cl: Client, body: Buffer) =>
  banner.PUT(new Request("http://localhost:3100/api/sales-profile/banner", { method: "PUT", headers: { cookie: cl.cookie, "content-type": "image/png" }, body: new Uint8Array(body) }), { params: Promise.resolve({}) });
const getBanner = (cl: Client | null, slug = "ana-milhas") =>
  publicBanner.GET(new Request(`http://localhost:3100/api/public/banner/${slug}`, { headers: cl?.cookie ? { cookie: cl.cookie } : {} }), { params: Promise.resolve({ slug }) });

describe("resolveDesign", () => {
  it("completa o que falta, mantém a ordem dos botões e descarta links perigosos", () => {
    expect(resolveDesign(null)).toEqual(DEFAULT_DESIGN);
    const d = resolveDesign({
      bgColor: "#FFFFFF",
      buttons: [
        { kind: "whatsapp", label: "Chama no zap", description: "" },
        { kind: "link", label: "Meu site", url: "https://exemplo.test/a" },
        { kind: "link", label: "Golpe", url: "javascript:alert(1)" },
        { kind: "link", label: "", url: "https://sem-nome.test" },
        { kind: "whatsapp", label: "Repetido" },
        { kind: "admin", label: "?" },
      ],
      captacao: { title: "", thanks: "Valeu!" },
    });
    expect(d.bgColor).toBe("#ffffff");
    expect(d.buttons.map((b) => [b.kind, b.label])).toEqual([["whatsapp", "Chama no zap"], ["link", "Meu site"], ["cotacao", "Pedir cotação de viagem"], ["gestao", "Interesse em gestão de milhas"]]);
    expect(d.captacao).toMatchObject({ title: DEFAULT_DESIGN.captacao.title, thanks: "Valeu!" });
    expect(resolveDesign({ bgColor: "red" }).bgColor).toBeNull();
    expect(resolveDesign({ buttons: Array.from({ length: 9 }, (_, i) => ({ kind: "link", label: `L${i}`, url: "https://x.test" })) }).buttons.filter((b) => b.kind === "link")).toHaveLength(6);
  });

  it("fundo claro usa texto escuro", () => {
    expect(themeForBg("#f8fafc")).toBe("light");
    expect(themeForBg("#0f172a")).toBe("dark");
    expect(themeForBg(null)).toBe("dark");
  });
});

describe("personalização da página", () => {
  it("textos e botões valem em qualquer plano; cor, banner e prévia do link só no PRO", async () => {
    await setPlan("PESSOAL");
    const texts = { captacao: { title: "Sua próxima viagem", thanks: "Já já te chamo!" }, buttons: [{ kind: "gestao", label: "Cuido das suas milhas", description: "" }] };
    const r = await c.call(salesProfile.PUT, "PUT", "/api/sales-profile", { ...base, design: texts });
    expect(r.status).toBe(200);
    const p = await publicSalesProfile("ana-milhas");
    expect(p?.design.captacao).toMatchObject({ title: "Sua próxima viagem", thanks: "Já já te chamo!" });
    expect(p?.design.buttons[0]).toMatchObject({ kind: "gestao", label: "Cuido das suas milhas" });

    const pro = await c.call(salesProfile.PUT, "PUT", "/api/sales-profile", { ...base, design: { ...texts, bgColor: "#1e1b4b" } });
    expect(pro.status).toBe(402);
    expect(pro.data.erro).toMatch(/plano PRO/);
    expect((await putBanner(c, PNG)).status).toBe(402);

    await setPlan("PRO");
    const ok = await c.call(salesProfile.PUT, "PUT", "/api/sales-profile", { ...base, design: { ...texts, bgColor: "#1e1b4b", share: { title: "Ana Milhas — cotações", description: "Passagens com milhas" } } });
    expect(ok.status).toBe(200);
    expect(ok.data.item.banner).toBeUndefined();
    expect((await putBanner(c, Buffer.from("não é imagem"))).status).toBe(415);
    expect((await putBanner(c, PNG)).status).toBe(200);
    const pub = await publicSalesProfile("ana-milhas");
    expect(pub).toMatchObject({ design: { bgColor: "#1e1b4b", share: { title: "Ana Milhas — cotações" } } });
    expect(pub?.bannerVersion).toMatch(/^\d+$/);
    const img = await getBanner(null);
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/png");

    // Salvar de novo sem mexer na parte PRO continua permitido depois de voltar ao Pessoal,
    // mas a página pública volta ao visual padrão
    await setPlan("PESSOAL");
    expect((await c.call(salesProfile.PUT, "PUT", "/api/sales-profile", { ...base, displayName: "Ana M." })).status).toBe(200);
    const back = await publicSalesProfile("ana-milhas");
    expect(back).toMatchObject({ displayName: "Ana M.", bannerVersion: null, design: { bgColor: null, share: { title: "" } } });
    expect((await getBanner(null)).status).toBe(404);
    expect((await getBanner(c)).status).toBe(200); // o dono continua vendo na prévia
  });

  it("banner só depois de salvar a página e só do próprio perfil; página despublicada esconde", async () => {
    expect((await putBanner(c, PNG)).status).toBe(400);
    await c.call(salesProfile.PUT, "PUT", "/api/sales-profile", { ...base, published: false });
    expect((await putBanner(c, PNG)).status).toBe(200);
    const other = new Client();
    await other.call(register.POST, "POST", "/r", { name: "Bia", email: "bia@x.test", password: "senha-forte-2" });
    expect((await getBanner(other)).status).toBe(404);
    expect((await getBanner(null)).status).toBe(404);
    expect((await getBanner(c)).status).toBe(200);
    expect((await banner.DELETE(new Request("http://localhost:3100/api/sales-profile/banner", { method: "DELETE", headers: { cookie: c.cookie } }), { params: Promise.resolve({}) })).status).toBe(200);
    expect((await getBanner(c)).status).toBe(404);
  });

  it("upload sem Content-Length (chunked) acima do limite é cortado com 413", async () => {
    await c.call(salesProfile.PUT, "PUT", "/api/sales-profile", { ...base });
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(ctl) {
        if (sent > 3 * 1024 * 1024) return ctl.close();
        sent += 64 * 1024;
        ctl.enqueue(new Uint8Array(64 * 1024));
      },
    });
    const res = await banner.PUT(new Request("http://localhost:3100/api/sales-profile/banner", { method: "PUT", headers: { cookie: c.cookie }, body, duplex: "half" } as RequestInit), { params: Promise.resolve({}) });
    expect(res.status).toBe(413);
    expect(sent).toBeLessThan(2 * 1024 * 1024); // parou de ler logo depois do limite
  });

  it("recusa personalização grande demais", async () => {
    const r = await c.call(salesProfile.PUT, "PUT", "/api/sales-profile", { ...base, design: { lixo: "x".repeat(25_000) } });
    expect(r.status).toBe(400);
  });
});
