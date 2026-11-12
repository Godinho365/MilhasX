// Aba "Sua MilhasX": os dois endereços públicos (site em /s/ e Central de Atendimento em /p/), o estado de cada um
// e o nome do endereço que vale para os dois.
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {}, replace() {} }) }));
const { SalesProfileTab } = await import("@/app/app/settings/tabs");
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el).replace(/ /g, " ");
const tab = (site: { exists: boolean; published: boolean }, profile: { slug: string; published: boolean } | null = { slug: "milhasx", published: true }) =>
  html(createElement(SalesProfileTab, { profile, site, defaultName: "Raphael", brand: "MilhasX" }));

describe("Sua MilhasX", () => {
  it("mostra o site e a Central, cada um com o link e o botão de abrir quando está no ar", () => {
    const h = tab({ exists: true, published: true });
    expect(h).toContain("Site da agência");
    expect(h).toContain("Central de Atendimento");
    expect(h).toContain('aria-label="Link do site" value="/s/milhasx"');
    expect(h).toContain('aria-label="Link da Central de Atendimento" value="/p/milhasx"');
    expect(h).toContain('href="/s/milhasx"');
    expect(h).toContain('href="/p/milhasx"');
    expect(h).toContain("Vale para os dois: /s/milhasx (site) e /p/milhasx (Central)");
    expect(h).toContain("Editar o site");
    expect(h).toContain("Publicado.");
  });

  it("site não publicado ou não montado: sem o botão de abrir e com o aviso; sem endereço salvo, sem links", () => {
    const off = tab({ exists: true, published: false });
    expect(off).not.toContain('href="/s/milhasx"');
    expect(off).toContain("O site ainda não está publicado");
    const none = tab({ exists: false, published: false });
    expect(none).toContain("O site ainda não foi montado.");
    expect(none).toContain("Montar o site");
    const novo = tab({ exists: false, published: false }, null);
    expect(novo).toContain("Salve o endereço para ver o link do site.");
    expect(novo).not.toContain("Link da Central de Atendimento");
    expect(novo).toContain('value="raphael"');
  });
});
