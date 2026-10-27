import { test, expect, type Page, type Locator } from "@playwright/test";

// Um usuário novo por execução: o fluxo inteiro roda pela interface, do cadastro à exclusão.
const stamp = Date.now();
const user = { name: "Teste E2E", email: `e2e-${stamp}@exemplo.test`, password: "senha-e2e-123" };
const SHOTS = "e2e/screenshots";

test.describe.configure({ mode: "serial" });

let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  // Depois de cada navegação, espera a página ficar ociosa (JS carregado e hidratado) antes de interagir
  const goto = page.goto.bind(page);
  page.goto = async (url, opts) => {
    const r = await goto(url, opts);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForSelector("html[data-hydrated]", { state: "attached", timeout: 15_000 }).catch(() => {});
    return r;
  };
});
test.afterAll(async () => page.close());

async function toastSays(text: RegExp | string) {
  await expect(page.getByRole("status").filter({ hasText: text }).first()).toBeVisible();
}

/** Seleciona a conta pelo titular e programa (lista agrupada por titular ou lista "Programa Titular"). */
async function pickAccount(select: Locator, holder: string, program: string) {
  const value = await select.evaluate(
    (el, [h, p]) => {
      const og = [...(el as HTMLSelectElement).querySelectorAll("optgroup")].find((g) => g.label === h);
      if (og) return [...og.querySelectorAll("option")].find((o) => o.textContent!.startsWith(p!))?.value ?? "";
      return [...(el as HTMLSelectElement).options].find((o) => o.textContent === `${p} ${h}`)?.value ?? "";
    },
    [holder, program],
  );
  expect(value, `conta ${program} de ${holder}`).not.toBe("");
  await select.selectOption(value);
}

async function openNewEntry(kind: "Crédito" | "Débito" | "Transferência" | "Lote") {
  await page.getByRole("button", { name: "Abrir menu de novo lançamento" }).click();
  await page.getByRole("menuitem", { name: new RegExp(`^${kind}`) }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

async function noHorizontalScroll() {
  const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(sw, `largura do conteúdo (${sw}) maior que a tela (${cw}) em ${page.url()}`).toBeLessThanOrEqual(cw);
}

test("cadastro, saída e login", async () => {
  await page.goto("/register");
  await page.getByLabel("Nome").fill(user.name);
  await page.getByLabel("E-mail").fill(user.email);
  await page.getByLabel(/^Senha/).fill(user.password);
  await page.getByLabel("Confirmar senha").fill(user.password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { level: 1, name: "Gestão" })).toBeVisible();

  await page.getByRole("button", { name: new RegExp(user.name) }).click();
  await page.getByRole("menuitem", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel("E-mail").fill(user.email);
  await page.getByLabel("Senha").fill("senha-errada");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "inválidos" })).toBeVisible();

  await page.getByLabel("Senha").fill(user.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/app$/);
});

test("recuperação de senha responde sem revelar a conta", async ({ browser }) => {
  const p = await browser.newPage();
  await p.goto("/forgot-password");
  await p.getByLabel("E-mail").fill("ninguem@exemplo.test");
  await p.getByRole("button", { name: "Enviar link" }).click();
  await expect(p.getByRole("status")).toContainText("Se o e-mail estiver cadastrado");
  await p.close();
});

test("titulares e contas", async () => {
  await page.goto("/app/programs?view=titulares");
  for (const name of ["Ana E2E", "Bruno E2E"]) {
    // botão flutuante "Novo titular" (como na referência)
    await page.getByRole("button", { name: "Novo titular" }).click();
    const nd = page.getByRole("dialog");
    await expect(nd).toContainText("Novo titular");
    for (const sec of ["Acesso à página do titular", "Documentos", "Endereço", "Atributos personalizados", "Anexos"]) await expect(nd.getByRole("button", { name: new RegExp(sec) })).toBeVisible();
    await nd.getByLabel("Nome do titular").fill(name);
    await nd.getByRole("button", { name: "Criar titular" }).click();
    await toastSays("Titular cadastrado");
  }
  await page.goto("/app/programs");
  for (const [holder, program] of [["Ana E2E", "Livelo"], ["Ana E2E", "LATAM Pass"], ["Bruno E2E", "LATAM Pass"]]) {
    await page.getByRole("button", { name: "Conta", exact: true }).first().click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Titular").selectOption({ label: holder! });
    await d.getByLabel("Programa").selectOption({ label: program! });
    await d.getByRole("button", { name: "Adicionar" }).click();
    await toastSays("Conta adicionada");
  }
  // conta duplicada é recusada
  await page.getByRole("button", { name: "Conta", exact: true }).first().click();
  await page.getByRole("dialog").getByLabel("Titular").selectOption({ label: "Ana E2E" });
  await page.getByRole("dialog").getByLabel("Programa").selectOption({ label: "Livelo" });
  await page.getByRole("dialog").getByRole("button", { name: "Adicionar" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("já tem conta");
  await page.keyboard.press("Escape");
});

test("crédito com custo usando atalhos +10k e chips", async () => {
  await page.goto("/app/entries");
  await openNewEntry("Crédito");
  const d = page.getByRole("dialog");
  await pickAccount(d.getByLabel(/Programa/), "Ana E2E", "Livelo");
  await d.getByLabel(/Categoria/).selectOption({ label: "Compra de pontos" });
  await d.getByRole("button", { name: "+10k" }).click();
  await d.getByRole("button", { name: "+10k" }).click();
  await expect(d.getByLabel("Pontos", { exact: true })).toHaveValue("20.000");
  await d.getByRole("button", { name: /Custos/ }).click();
  await expect(d.getByLabel("Tipo do custo 1")).toHaveValue("PONTOS");
  await d.getByLabel("Valor do custo 1").fill("600,00");
  await d.getByRole("button", { name: "Adicionar custo" }).click();
  await d.getByLabel("Tipo do custo 2").selectOption({ label: "IOF" });
  await d.getByLabel("Valor do custo 2").fill("20,00");
  await expect(d).toContainText("Total: R$ 620,00");
  await expect(d).toContainText("CPM deste lançamento: R$ 31,00");
  await d.getByRole("button", { name: "Criar lançamento" }).click();
  await toastSays("Crédito registrado");
  await expect(page.getByRole("cell", { name: /Compra de pontos \(20\.000 pontos\)/ }).first()).toBeVisible();

  // clube, reaproveitando o chip de recentes não deve duplicar: lança outro crédito diferente
  await openNewEntry("Crédito");
  await pickAccount(d.getByLabel(/Programa/), "Ana E2E", "Livelo");
  await d.getByLabel(/Categoria/).selectOption({ label: "Pontos de clube" });
  await d.getByLabel("Pontos", { exact: true }).fill("2000");
  await d.getByRole("button", { name: /Custos/ }).click();
  await d.getByLabel("Tipo do custo 1").selectOption({ label: "Mensalidade" });
  await d.getByLabel("Valor do custo 1").fill("49,90");
  // repetir automaticamente: mostra frequência e opções avançadas
  await d.getByRole("switch", { name: "Repetir automaticamente" }).click();
  await expect(d.getByRole("tab", { name: "Mensal" })).toHaveAttribute("aria-selected", "true");
  await d.getByRole("button", { name: "Opções avançadas" }).click();
  await expect(d.getByLabel("Data de término")).toBeVisible();
  await d.getByRole("switch", { name: "Repetir automaticamente" }).click();
  await d.getByRole("button", { name: "Criar lançamento" }).click();
  await toastSays("Crédito registrado");

  await openNewEntry("Crédito");
  await expect(d.getByLabel("Lançamentos recentes")).toContainText("Pontos de clube");
  // fechar com dados preenchidos pede confirmação
  await d.getByLabel("Pontos", { exact: true }).fill("10");
  await page.keyboard.press("Escape");
  const discard = page.getByRole("alertdialog");
  await expect(discard).toContainText("Descartar alterações?");
  await discard.getByRole("button", { name: "Descartar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("débito: recusa saldo insuficiente e aceita válido", async () => {
  await openNewEntry("Débito");
  const d = page.getByRole("dialog");
  await pickAccount(d.getByLabel(/Programa/), "Ana E2E", "Livelo");
  await d.getByLabel(/Categoria/).selectOption({ label: "Expiração de pontos" });
  await d.getByLabel("Pontos", { exact: true }).fill("999999");
  await expect(d).toContainText("Saldo insuficiente");
  await d.getByRole("button", { name: "Criar lançamento" }).click();
  await expect(d.getByRole("alert")).toContainText("Saldo insuficiente");
  await d.getByLabel("Pontos", { exact: true }).fill("500");
  await expect(d.getByRole("button", { name: /Custos/ })).toHaveCount(0); // expiração não tem custos
  await d.getByRole("button", { name: "Criar lançamento" }).click();
  await toastSays("Débito registrado");
});

test("transferência bonificada leva o custo e calcula o CPM", async () => {
  await openNewEntry("Transferência");
  const d = page.getByRole("dialog");
  await pickAccount(d.getByLabel("De", { exact: true }), "Ana E2E", "Livelo");
  await pickAccount(d.getByLabel("Para", { exact: true }), "Ana E2E", "LATAM Pass");
  await d.getByLabel("Pontos transferidos").fill("20000");
  await d.getByLabel("Bônus (%)").fill("25");
  await expect(d).toContainText("25.000 pts");
  await d.getByRole("button", { name: /Configurações avançadas/ }).click();
  await expect(d.getByLabel("Pontos de origem")).toHaveValue("1");
  await d.getByRole("switch", { name: "Compra de pontos no carrinho" }).click();
  await expect(d.getByRole("switch", { name: "Aplicar todos os pontos comprados na transferência" })).toBeVisible();
  await d.getByRole("switch", { name: "Compra de pontos no carrinho" }).click();
  await d.getByRole("button", { name: "Criar transferência" }).click();
  await toastSays("Transferência registrada");

  await page.goto("/app/programs");
  const row = page.locator("section", { hasText: "Ana E2E" }).getByRole("row", { name: /LATAM Pass/ });
  await expect(row).toContainText("25.000");
  // Livelo: 22.000 pts por R$ 669,90; débito de 500 tira R$ 15,23 → 21.500 pts / R$ 654,67.
  // Saem 20.000 pts levando R$ 609,00, que viram 25.000 pts no destino → CPM R$ 24,36
  await expect(row).toContainText("R$ 24,36");
});

test("lote grava várias linhas de uma vez", async () => {
  await page.goto("/app/entries");
  await openNewEntry("Lote");
  const d = page.getByRole("dialog");
  await expect(d).toContainText("Selecione o programa para adicionar registros em lote");
  await d.getByRole("option", { name: /LATAM Pass Bruno E2E/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Registros em lote para LATAM Pass Bruno E2E");
  await d.getByLabel("Tipo do registro 1").selectOption({ label: "Saldo inicial" });
  await d.getByLabel("Pontos do registro 1").fill("7000");
  await d.getByRole("button", { name: "Adicionar registro" }).click();
  await d.getByLabel("Tipo do registro 2").selectOption({ label: "Pontos de voo" });
  await d.getByLabel("Pontos do registro 2").fill("1500");
  await d.getByRole("button", { name: "Criar registros" }).click();
  await toastSays("2 registros criados");
  await expect(page.getByRole("cell", { name: /Pontos de voo/ }).first()).toBeVisible();
});

test("extrato: filtros, busca, edição, seleção e exclusão em lote, CSV", async () => {
  await page.goto("/app/entries");
  await page.getByLabel("Tipo de operação").selectOption({ label: "Somente débitos" });
  await expect(page).toHaveURL(/direction=debit/);
  await expect(page.getByRole("cell", { name: /Compra de pontos/ })).toHaveCount(0);

  await page.goto("/app/entries");
  await page.getByLabel("Buscar na descrição").fill("clube");
  await page.getByLabel("Buscar na descrição").press("Enter");
  await expect(page).toHaveURL(/q=clube/);
  await expect(page.locator("tbody tr")).toHaveCount(1);

  // editar
  await page.getByRole("button", { name: /Ações de Pontos de clube/ }).click();
  await page.getByRole("menuitem", { name: "Editar" }).click();
  await page.getByRole("dialog").getByLabel(/Descrição/).fill("Clube mensal");
  await page.getByRole("dialog").getByRole("button", { name: "Salvar" }).click();
  await toastSays("Lançamento atualizado");
  await page.goto("/app/entries?q=Clube%20mensal");
  await expect(page.getByRole("cell", { name: /Clube mensal/ }).first()).toBeVisible();

  // CSV
  const csv = await page.request.get("/api/entries/export");
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain("data;programa;titular;tipo");

  // seleção e exclusão em lote dos 2 do Bruno (saldo inicial + voo)
  await page.goto("/app/entries");
  await page.getByLabel(/Selecionar Pontos de voo/).first().check();
  await page.getByLabel(/Selecionar Saldo inicial/).first().check();
  await expect(page.getByText("2 selecionados")).toBeVisible();
  await page.getByRole("button", { name: "Excluir", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("alertdialog").getByRole("button", { name: "Excluir" }).click();
  await toastSays("2 lançamentos excluídos");
  await expect(page.getByRole("cell", { name: /Pontos de voo/ })).toHaveCount(0);
});

test("pontos a receber e confirmação (transferência com entrega futura)", async () => {
  await openNewEntry("Crédito");
  const d = page.getByRole("dialog");
  await pickAccount(d.getByLabel(/Programa/), "Bruno E2E", "LATAM Pass");
  await d.getByLabel(/Categoria/).selectOption({ label: "Pontos de hotel" });
  await d.getByLabel("Pontos", { exact: true }).fill("3000");
  await d.getByRole("button", { name: "Criar lançamento" }).click();
  await toastSays("Crédito registrado");

  await openNewEntry("Transferência");
  await pickAccount(d.getByLabel("De", { exact: true }), "Bruno E2E", "LATAM Pass");
  await pickAccount(d.getByLabel("Para", { exact: true }), "Ana E2E", "Livelo");
  await d.getByLabel("Pontos transferidos").fill("3000");
  await d.getByRole("button", { name: /Configurações avançadas/ }).click();
  await d.getByRole("switch", { name: "Previsão de entrega diferente" }).click();
  const future = new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10);
  await d.getByLabel(/Data de entrega no destino/).fill(future);
  await expect(d).toContainText("a receber");
  await d.getByRole("button", { name: "Criar transferência" }).click();
  await toastSays("Transferência registrada");
  await page.goto("/app");
  await expect(page.getByText("Pontos a receber", { exact: true }).locator("..").locator("..")).toContainText("3.000");
  await page.goto("/app/entries?status=PENDING");
  await page.getByRole("button", { name: /Ações de Transferência de LATAM Pass/ }).first().click();
  await page.getByRole("menuitem", { name: "Marcar recebido" }).click();
  await toastSays("recebidos");
});

test("vendas e clientes", async () => {
  // cliente: nome, tipo e identificador (dados sintéticos)
  await page.goto("/app/sales?tab=clientes");
  await page.getByRole("button", { name: "Criar cliente" }).first().click();
  const cd = page.getByRole("dialog");
  await cd.getByLabel("Nome", { exact: true }).fill("Cliente E2E");
  await cd.getByLabel("Número do identificador").fill("00000000000");
  await expect(cd.getByLabel("Número do identificador")).toHaveValue("000.000.000-00");
  await cd.getByRole("button", { name: "Criar cliente" }).click();
  await toastSays("Cliente cadastrado");
  await expect(page.getByRole("row", { name: /Cliente E2E/ })).toContainText("Cliente final");

  // venda de emissão: passagem com taxa repassada e cliente
  await page.goto("/app/sales");
  await page.getByRole("button", { name: "Registrar venda" }).first().click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Programa").selectOption({ label: "LATAM Pass Ana E2E (25.000)" });
  await d.getByLabel("Pontos da emissão do item 1").fill("10000");
  await d.getByLabel("Valor dos pontos do item 1").fill("280,00");
  await d.getByRole("button", { name: /Taxas e custos repassados/ }).click();
  await d.getByLabel("Valor do custo 1 do item 1").fill("100,00");
  await d.getByLabel("Clientes do item 1").click();
  await d.getByRole("listbox", { name: "Clientes do item 1" }).getByText("Cliente E2E").click();
  await d.getByLabel("Origem", { exact: true }).fill("GRU");
  await expect(page.getByLabel("Total da venda")).toHaveText("R$ 380,00");
  await d.getByRole("button", { name: "Criar venda" }).click();
  await toastSays("Venda registrada");
  const row = page.getByRole("row", { name: /Passagem aérea GRU/ });
  await expect(row).toContainText("Cliente E2E");
  await expect(row).toContainText("R$ 380,00");
  // resultado: R$ 280,00 − custo médio de 10.000 pts (R$ 243,60); a taxa repassada se anula
  await expect(row).toContainText("R$ 36,40");
  await row.getByRole("button", { name: /^Passagem aérea GRU/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Repassado: Taxa de embarque");
  await page.keyboard.press("Escape");
});

test("lojas, favoritos e alertas", async () => {
  await page.goto("/app/purchases");
  const first = page.locator("article").first();
  const storeName = (await first.locator("h3").textContent())!;
  await first.getByRole("button", { name: `Favoritar ${storeName}` }).click();
  await toastSays("nos favoritos");
  // filtro "Mostrar somente favoritas" no painel de filtros
  await page.getByRole("button", { name: "Mais filtros" }).click();
  await expect(page.getByRole("dialog")).toContainText("Filtros de lojas");
  await page.getByRole("switch", { name: "Mostrar somente favoritas" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Aplicar" }).click();
  await expect(page).toHaveURL(/fav=1/);
  await expect(page.locator("article")).toHaveCount(1);

  // alertas: sugestão "Ative em um clique" da loja favorita
  await page.goto("/app/purchases?tab=alertas");
  await expect(page.getByText("Monitore as melhores promoções")).toBeVisible();
  await page.getByRole("button", { name: `Ativar alerta de ${storeName}` }).click();
  await toastSays("Alerta ativado");
  await expect(page.getByRole("button", { name: `Ativar alerta de ${storeName}` })).toHaveCount(0);

  await page.getByLabel(/Tipo/).selectOption({ label: "Saldo mínimo de conta" });
  await page.getByLabel(/Conta/).selectOption({ label: "LATAM Pass · Ana E2E" });
  await page.getByLabel(/saldo ficar abaixo/).fill("20000");
  await page.getByRole("button", { name: "Criar alerta" }).click();
  await toastSays("Alerta criado");
  await expect(page.getByText("Saldo abaixo de 20.000 pts")).toBeVisible();
});

test("alerta dispara notificação quando o saldo cai", async () => {
  await openNewEntry("Débito");
  const d = page.getByRole("dialog");
  await pickAccount(d.getByLabel(/Programa/), "Ana E2E", "LATAM Pass");
  await d.getByLabel(/Categoria/).selectOption({ label: "Emissão de passagem" });
  await d.getByLabel("Pontos", { exact: true }).fill("1000");
  await d.getByRole("button", { name: "Criar lançamento" }).click();
  await toastSays("Débito registrado");
  await page.goto("/app/notifications");
  await expect(page.getByText("Saldo abaixo do mínimo")).toBeVisible();
  await page.getByRole("button", { name: "Marcar todas como lidas" }).click();
  await toastSays("lidas");
});

test("simuladores e relatórios", async () => {
  await page.goto("/app/simulators");
  await expect(page).toHaveURL(/\/app\/simulators\/purchase\/bonificada/);
  const sim = page.getByRole("form", { name: "Compra Bonificada" });
  await sim.getByLabel("Programa").selectOption({ label: "Livelo Ana E2E" });
  await sim.getByLabel("Pontos por Real").fill("10");
  await sim.getByLabel("Valor da Compra").fill("1000");
  await expect(sim).toContainText("Pontos esperados: 10.000 pontos");
  await sim.getByRole("button", { name: /Custo extra/ }).click();
  await sim.getByLabel("Custo extra (R$)").fill("50");
  await sim.getByRole("button", { name: "Simular" }).click();
  const result = page.getByRole("region", { name: "Resultado da simulação" });
  await expect(result).toContainText("10.000 pts");
  await expect(result).toContainText("R$ 5,00"); // CPM do custo extra: R$ 50 / 10 milheiros
  await expect(page.getByRole("list", { name: "Simulações recentes" })).toContainText("Compra Bonificada · Livelo · 10 mil pts");

  // transferência com bônus pelo menu lateral
  await page.getByRole("navigation", { name: "Simuladores" }).getByRole("link", { name: "Transferência" }).click();
  const tf = page.getByRole("form", { name: "Transferência" });
  await tf.getByLabel("Programa de origem").selectOption({ label: "Livelo Ana E2E" });
  await tf.getByLabel("Programa de destino").selectOption({ label: "LATAM Pass Ana E2E" });
  await tf.getByLabel("Pontos a transferir").fill("1000");
  await tf.getByLabel("Percentual de Bônus").fill("25");
  await tf.getByRole("button", { name: "Simular" }).click();
  await expect(result).toContainText("1.250 pts");
  await expect(page.getByRole("list", { name: "Simulações recentes" })).toContainText("Livelo → LATAM Pass · 1 mil pts");
  // reabrir pela lista de recentes traz os valores de volta
  await page.getByRole("link", { name: "Compra Bonificada · Livelo · 10 mil pts" }).click();
  await expect(page.getByRole("form", { name: "Compra Bonificada" }).getByLabel("Pontos por Real")).toHaveValue("10");

  // todos os simuladores do menu abrem
  for (const label of ["Pontos vs Cashback", "Compra de Pontos", "Passagem Aérea", "Hospedagem", "Venda", "Melhor fornecedor"]) {
    await page.getByRole("navigation", { name: "Simuladores" }).getByRole("link", { name: label }).click();
    await expect(page.getByRole("form", { name: label })).toBeVisible();
  }
  // passagem: custo pelo CPM da conta + taxas, avisa saldo insuficiente
  await page.getByRole("navigation", { name: "Simuladores" }).getByRole("link", { name: "Passagem Aérea" }).click();
  const fl = page.getByRole("form", { name: "Passagem Aérea" });
  await fl.getByLabel("Programa").selectOption({ label: "LATAM Pass Ana E2E" });
  await fl.getByLabel("Pontos (Ida)").fill("999999");
  await expect(fl.getByLabel("Programa")).not.toHaveValue("");
  await expect(fl.getByLabel("Pontos (Ida)")).toHaveValue("999.999");
  await fl.getByRole("button", { name: "Simular" }).click();
  await expect(fl.getByRole("alert")).toHaveCount(0);
  await expect(result).toContainText("Saldo insuficiente");

  await page.goto("/app/reports");
  await expect(page).toHaveURL(/\/app\/reports\/overview/);
  await page.getByRole("tab", { name: "Tudo" }).click();
  await expect(page).toHaveURL(/periodo=all/);
  await expect(page.getByRole("heading", { name: "Acúmulo por categoria" })).toBeVisible();
  // todas as abas do submenu abrem
  for (const [label, heading] of [["Compras", "Pontos por parceiro"], ["Cartões", "Faturas por status"], ["Economia", "Detalhamento por resgate"], ["Evolução", "Evolução do CPM"], ["Vendas", "Top beneficiários"], ["Bens e Direitos", "Posição patrimonial em 31/12 de cada ano"]] as const) {
    await page.getByRole("navigation", { name: "Relatórios" }).getByRole("link", { name: label }).click();
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/relatorio_${label.normalize("NFD").replace(/[^A-Za-z]+/g, "_")}.png`, fullPage: true });
  }
  const csv = await page.request.get("/api/reports/export?tab=assets");
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain("titular;programa");
});

test("preferências e troca de senha", async () => {
  await page.goto("/app/settings");
  const values = page.getByRole("radiogroup", { name: "Visibilidade dos valores" });
  await values.getByRole("radio", { name: "Parcial" }).click();
  await toastSays("Preferência salva");
  await page.goto("/app");
  await expect(page.getByText("R$ •••").first()).toBeVisible();
  // atalho no menu do usuário: Parcial → Oculto → Visível
  const userBtn = page.locator('aside button[aria-haspopup="menu"]').last();
  await expect(userBtn).toContainText("Gestor"); // selo do plano (teste do Gestor)
  await userBtn.click();
  await page.getByRole("menuitem", { name: "Valores: Parcial" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-values", "hidden");
  await page.goto("/app/settings");
  await values.getByRole("radio", { name: "Visível" }).click();
  await toastSays("Preferência salva");
  await expect(page.locator("html")).toHaveAttribute("data-values", "visible");
  // canais de notificação por tipo
  await page.getByLabel("Alertas de ofertas por push").check();
  await toastSays("Preferência salva");

  await page.getByLabel("Senha atual").fill(user.password);
  await page.getByLabel(/^Nova senha/).fill("nova-senha-e2e-1");
  await page.getByLabel("Confirmar nova senha").fill("nova-senha-e2e-1");
  await page.getByRole("button", { name: "Salvar senha" }).click();
  await toastSays("Senha alterada");
  user.password = "nova-senha-e2e-1";
});

test("cliente comum não acessa o admin", async () => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/app$/);
  const r = await page.request.get("/api/admin/users");
  expect(r.status()).toBe(403);
});

async function pickHolder(name: string) {
  await page.getByRole("button", { name: /Trocar titular/ }).click();
  // a troca recarrega a página inteira: espera o novo carregamento terminar
  await Promise.all([page.waitForEvent("load"), page.getByRole("listbox", { name: "Trocar titular" }).getByRole("option", { name }).click()]);
  await page.waitForLoadState("networkidle").catch(() => {});
}

test("seletor de titular: titulares, todos e minhas contas", async () => {
  await page.goto("/app");
  await page.getByRole("button", { name: /Trocar titular/ }).click();
  const list = page.getByRole("listbox", { name: "Trocar titular" });
  await expect(list.getByText("Visualizar")).toBeVisible();
  await expect(list.getByRole("option", { name: "Minhas contas" })).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Escape");

  await pickHolder("Bruno E2E");
  await expect(page.getByText("Titular: Bruno E2E")).toBeVisible();
  await expect(page.getByRole("button", { name: /Trocar titular: Bruno E2E/ })).toBeVisible();
  // atalhos da barra lateral: só as contas do Bruno, levando à página da conta
  await expect(page.getByRole("link", { name: /^Bruno E2E - LATAM Pass/ }).first()).toHaveAttribute("href", /^\/app\/programs\/.+/);
  await expect(page.getByRole("link", { name: /^Ana E2E - / })).toHaveCount(0);
  // extrato e relatórios também ficam no titular escolhido
  await page.goto("/app/entries");
  await expect(page.locator("main").getByText(/Titular: Bruno E2E/)).toBeVisible();
  await page.goto("/app/reports");
  await expect(page.locator("main").getByText(/Titular: Bruno E2E/)).toBeVisible();
  await pickHolder("Todos os titulares");
  await expect(page.getByRole("link", { name: /^Ana E2E - / }).first()).toBeVisible();
  await expect(page.locator("main").getByText(/Todos os titulares/)).toBeVisible();

  // marca Ana como "sou eu" e usa "Minhas contas"
  // "Gerenciar titulares" no fim do seletor leva à aba Titulares
  await page.getByRole("button", { name: /Trocar titular/ }).click();
  await page.getByRole("link", { name: "Gerenciar titulares" }).click();
  await expect(page).toHaveURL(/view=titulares/);
  await expect(page.getByRole("columnheader", { name: "Nascimento" })).toBeVisible();
  await page.getByRole("button", { name: "Ações de Ana E2E" }).click();
  await page.getByRole("menuitem", { name: "Marcar como você" }).click();
  await toastSays("marcado como você");

  // editar: nascimento e documento (dados sintéticos)
  await page.getByRole("button", { name: "Ações de Ana E2E" }).click();
  await page.getByRole("menuitem", { name: "Editar" }).click();
  const hd = page.getByRole("dialog");
  await expect(hd).toContainText("Não armazene dados sensíveis");
  await hd.getByLabel("Data de nascimento").fill("1990-05-20");
  await hd.getByRole("button", { name: /Documentos/ }).click();
  await hd.getByLabel("Número do documento 1").fill("000.000.000-00");
  // endereço em campos e anexo (PDF sintético)
  await hd.getByRole("button", { name: /Endereço/ }).click();
  await hd.getByLabel("CEP").fill("01001000");
  await expect(hd.getByLabel("CEP")).toHaveValue("01001-000");
  await hd.getByLabel("Cidade").fill("São Paulo");
  await hd.getByLabel("UF").selectOption("SP");
  await hd.getByRole("button", { name: /Anexos/ }).click();
  await hd.getByLabel("Selecionar anexos").setInputFiles({ name: "contrato.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% teste e2e\n") });
  await expect(hd.getByRole("list", { name: "Anexos do titular" })).toContainText("contrato.pdf");
  await hd.getByRole("button", { name: "Salvar alterações" }).click();
  await toastSays("Titular atualizado");
  await expect(page.getByRole("row", { name: /Ana E2E/ })).toContainText("20/05/1990");
  await page.getByRole("row", { name: /Ana E2E/ }).getByRole("button").first().click();
  await expect(page.getByRole("dialog")).toContainText("000.000.000-00");
  await expect(page.getByRole("dialog")).toContainText("São Paulo/SP");
  await expect(page.getByRole("dialog")).toContainText("contrato.pdf");
  await page.keyboard.press("Escape");
  await pickHolder("Minhas contas");
  await expect(page.getByRole("button", { name: /Trocar titular: Minhas contas/ })).toBeVisible();
  await page.goto("/app");
  await expect(page.getByText("Titular: Ana E2E")).toBeVisible();
  await pickHolder("Todos os titulares");
});

test("painel: três modos pelo seletor (desktop)", async () => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/app");
  for (const [label, heading] of [["Visão Geral", "Créditos vs Débitos"], ["Vendas", "Faturamento"], ["Gestão", "Evolução por titular"]] as const) {
    await page.getByRole("button", { name: /Modo do painel/ }).click();
    await page.getByRole("option", { name: new RegExp(label) }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: label })).toBeVisible();
    await expect(page.getByText(heading).first()).toBeVisible();
    if (label === "Visão Geral") {
      await expect(page.getByRole("heading", { name: "Lançamentos Recentes" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Compras Pendentes" })).toBeVisible();
      // ⇕ do card abre o detalhamento por programa
      await page.getByRole("button", { name: "Saldo total" }).click();
      const pop = page.getByRole("dialog", { name: "Saldo por programa" });
      await expect(pop).toContainText("Total");
      await page.keyboard.press("Escape");
      await expect(pop).toHaveCount(0);
    }
  }
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Gestão" })).toBeVisible();
});

test("promoções: lista, encerradas, filtros e alerta", async () => {
  await page.goto("/app/offers");
  await expect(page.locator("main article").first()).toBeVisible();
  await expect(page.getByText(/Termina (hoje|em \d+ dias?)/).first()).toBeVisible();
  // encerradas ficam numa seção abaixo das ativas, como na referência
  await expect(page.getByRole("region", { name: "Encerradas" }).getByText(/Encerrou em/).first()).toBeVisible();
  await page.getByLabel("Ordenar promoções").selectOption("bonus");
  await expect(page).toHaveURL(/ordem=bonus/);
  await page.getByRole("group", { name: "Categoria" }).getByRole("button", { name: "Transferência" }).click();
  await expect(page).toHaveURL(/categoria=TRANSFER_BONUS/);
  await page.getByRole("tab", { name: "Alertas" }).click();
  await expect(page).toHaveURL(/tab=alertas/);
  await expect(page.getByLabel(/Bônus mínimo/)).toBeVisible();
  await page.getByLabel("Programa").selectOption({ label: "LATAM Pass" });
  await page.getByLabel(/Bônus mínimo/).fill("30");
  await page.getByRole("button", { name: "Criar alerta" }).click();
  await toastSays("Alerta de promoção criado");
  await expect(page.getByText("Bônus a partir de 30%")).toBeVisible();
});

test("cartões: cadastro, fatura e fechamento gera pontos a receber", async () => {
  await page.goto("/app/credit-cards");
  // abas como na referência: Resumo, Faturas e Cartões
  await expect(page.getByRole("tab", { name: "Resumo" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Cartões" }).click();
  await page.getByRole("button", { name: "Novo cartão" }).first().click();
  const d = page.getByRole("dialog");
  await d.getByLabel(/Nome do cartão/).fill("Cartão E2E");
  await d.getByLabel(/Conta que recebe/).selectOption({ label: "Livelo · Ana E2E" });
  await d.getByLabel(/Pontos por dólar/).fill("2,2");
  await d.getByLabel(/Dia do fechamento/).fill("3");
  await d.getByLabel(/Dia do vencimento/).fill("10");
  await d.getByRole("button", { name: "Salvar" }).click();
  await toastSays("Cartão cadastrado");

  await page.getByRole("button", { name: "Adicionar fatura de Cartão E2E" }).click();
  const f = page.getByRole("dialog");
  await f.getByLabel(/Valor da fatura/).fill("4.500,00");
  await f.getByLabel(/^Fechamento/).fill("2026-10-03");
  await f.getByLabel(/^Vencimento/).fill("2026-10-10");
  await f.getByRole("button", { name: "Adicionar" }).click();
  await toastSays("Fatura adicionada");
  // indicador clicável leva às faturas em aberto
  await page.getByRole("tab", { name: "Resumo" }).click();
  await expect(page.getByRole("region", { name: "Próximo passo" })).toContainText("Cartão E2E");
  await page.getByRole("button", { name: /^Pontos esperados/ }).click();
  await expect(page.getByRole("tab", { name: "Faturas" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("1.800 pts").first()).toBeVisible();

  await page.getByRole("button", { name: "Fechar fatura" }).first().click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Fechar fatura" }).click();
  await toastSays("Fatura fechada");
  // fechada, sai do filtro "Em aberto" e aparece em "Fechadas"
  await page.getByLabel("Situação da fatura").selectOption("CLOSED");
  await expect(page.getByText("Pontos a receber").first()).toBeVisible();
  await page.goto("/app/entries?status=PENDING");
  await expect(page.getByRole("cell", { name: /Fatura Cartão E2E/ }).first()).toBeVisible();
});

test("fornecedores: cadastro e conta", async () => {
  await page.goto("/app/management?tab=fornecedores");
  await page.getByRole("button", { name: "Novo fornecedor" }).click();
  await page.getByRole("dialog").getByLabel("Nome").fill("Fornecedor E2E");
  await page.getByRole("dialog").getByRole("button", { name: "Salvar" }).click();
  await toastSays("Fornecedor cadastrado");

  await page.goto("/app/management");
  await page.getByRole("button", { name: "Nova conta" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel(/^Fornecedor/).selectOption({ label: "Fornecedor E2E" });
  await d.getByLabel(/^Programa/).selectOption({ label: "Smiles" });
  await d.getByLabel(/^Saldo/).fill("30000");
  await d.getByLabel(/Preço combinado/).fill("17,50");
  await d.getByRole("button", { name: "Salvar" }).click();
  await toastSays("Conta cadastrada");
  await expect(page.getByRole("row", { name: /Fornecedor E2E/ })).toContainText("30.000");
});

test("guias e novidades", async () => {
  await page.goto("/app/guides");
  await page.getByRole("article").filter({ hasText: "Entendendo o CPM" }).getByRole("link", { name: "Começar" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Entendendo o CPM" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "A conta", exact: true })).toBeVisible();

  await page.goto("/app");
  const news = page.locator("aside").getByRole("link", { name: /Novidades/ });
  await expect(news).toContainText(/\d/);
  await news.click();
  await expect(page.getByRole("heading", { level: 1, name: "Novidades" })).toBeVisible();
  await expect(page.getByText("novo", { exact: true }).first()).toBeVisible();
  await page.waitForTimeout(1000);
  await page.goto("/app");
  await expect(page.locator("aside").getByRole("link", { name: /Novidades/ })).not.toContainText(/\d/);
});

test("foto de perfil", async () => {
  await page.goto("/app/settings?tab=profile");
  // Gera uma imagem PNG válida no próprio navegador
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d")!;
    x.fillStyle = "#60a5fa";
    x.fillRect(0, 0, 64, 64);
    return c.toDataURL("image/png");
  });
  const png = Buffer.from(dataUrl.split(",")[1]!, "base64");
  // arquivo que não é imagem de verdade: mensagem em português
  await page.getByLabel("Escolher foto de perfil").setInputFiles({ name: "falsa.png", mimeType: "image/png", buffer: Buffer.from("isto não é uma imagem") });
  await toastSays("Não foi possível ler essa imagem");
  await page.getByLabel("Escolher foto de perfil").setInputFiles({ name: "foto.png", mimeType: "image/png", buffer: png });
  await toastSays("Foto atualizada");
  await expect(page.locator("aside img[src*='/api/me/avatar']").first()).toBeAttached();
  await page.getByRole("button", { name: "Remover" }).click();
  await toastSays("Foto removida");
});

test("celular: barra inferior e painel inferior do seletor", async () => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/app");
  const bar = page.getByRole("navigation", { name: "Navegação rápida" });
  await expect(bar).toBeVisible();
  await bar.getByRole("link", { name: "Extrato" }).click();
  await expect(page).toHaveURL(/\/app\/entries/);
  await bar.getByRole("link", { name: "Compras" }).click();
  await expect(page).toHaveURL(/\/app\/purchases/);
  await bar.getByRole("button", { name: "Mais opções do menu" }).click();
  await page.getByRole("navigation", { name: "Menu principal" }).getByRole("link", { name: "Cartões de Crédito" }).click();
  await expect(page).toHaveURL(/credit-cards/);
  await bar.getByRole("link", { name: "Painel" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.getByRole("button", { name: /Modo do painel/ }).click();
  await expect(page.getByRole("heading", { name: "Painel", level: 2 })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/mobile_seletor_painel.png` });
  await page.getByRole("option", { name: /Visão Geral/ }).last().click();
  await expect(page.getByRole("heading", { level: 1, name: "Visão Geral" })).toBeVisible();
  // no celular a Visão Geral fica em abas
  const sections = page.getByRole("tablist", { name: "Seções do painel" });
  await expect(page.getByText("Evolução do Saldo")).toBeHidden();
  await sections.getByRole("tab", { name: "Evolução" }).click();
  await expect(page.getByText("Evolução do Saldo")).toBeVisible();
  await sections.getByRole("tab", { name: "Recentes" }).click();
  await expect(page.getByText("Lançamentos Recentes")).toBeVisible();
  const fab = (await page.getByRole("button", { name: "Abrir menu de novo lançamento" }).boundingBox())!;
  const barBox = (await bar.boundingBox())!;
  expect(fab.y + fab.height).toBeLessThanOrEqual(barBox.y);
  await bar.getByRole("button", { name: "Mais opções do menu" }).click();
  await page.screenshot({ path: `${SHOTS}/mobile_menu_mais.png` });
  await page.getByRole("button", { name: "Fechar menu", exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 800 });
});

test("página da conta: recorrência e credenciais", async () => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/app/programs");
  await page.locator("section", { hasText: "Ana E2E" }).getByRole("link", { name: "Livelo" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Livelo" })).toBeVisible();
  for (const t of ["Saldo atual", "Custo do milheiro", "Pontos a receber", "Valor em reais", "Lançamentos Recentes", "Compras Pendentes", "Lançamentos Recorrentes", "Credenciais de acesso"]) {
    await expect(page.getByText(t, { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByText("Orgânico").first()).toBeVisible();

  await page.getByRole("button", { name: "Adicionar recorrência" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel(/Pontos por ciclo/).fill("2000");
  await d.getByLabel(/Valor por ciclo/).fill("49,90");
  const next = new Date(Date.now() + 20 * 86400_000).toISOString().slice(0, 10);
  await d.getByLabel(/Próximo lançamento/).fill(next);
  await d.getByRole("button", { name: "Salvar" }).click();
  await toastSays("Recorrência criada");
  await expect(page.getByText("Mensal", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Desligar avisos" }).click();
  await toastSays("Avisos desligados");

  await page.getByRole("button", { name: "Adicionar credenciais" }).click();
  const c = page.getByRole("dialog");
  await c.getByLabel(/^Login/).fill("123.456.789-00");
  await c.getByLabel(/Senha do programa/).fill("segredo-e2e");
  await c.getByRole("button", { name: "Salvar" }).click();
  await toastSays("Credenciais salvas");
  await expect(page.getByText("segredo-e2e")).toHaveCount(0);
  await page.getByRole("button", { name: "Mostrar" }).click();
  await page.getByRole("dialog").getByLabel(/Sua senha/).fill("senha-errada");
  await page.getByRole("dialog").getByRole("button", { name: "Mostrar" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Senha incorreta");
  await page.getByRole("dialog").getByLabel(/Sua senha/).fill(user.password);
  await page.getByRole("dialog").getByRole("button", { name: "Mostrar" }).click();
  await expect(page.getByText("segredo-e2e")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/desktop_conta.png`, fullPage: true });
});

test("compras bonificadas: registrar e receber os pontos", async () => {
  await page.goto("/app/purchases?tab=compras");
  await page.getByRole("tab", { name: "Kanban" }).click();
  await page.getByRole("button", { name: "Criar nova compra" }).first().click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Programa").selectOption({ label: "LATAM Pass Bruno E2E" });
  await d.getByLabel("Pontos por real").fill("4");
  await d.getByLabel("Valor dos produtos (R$)").fill("500,00");
  await expect(d).toContainText("Pontos esperados: 2.000");
  await d.getByLabel("Descrição").fill("Loja Teste E2E");
  await d.getByRole("button", { name: /Mais opções/ }).click();
  await d.getByLabel("Tags").fill("teste-e2e");
  await d.getByLabel("Tags").press("Enter");
  await d.getByRole("button", { name: "Criar compra" }).click();
  await toastSays("Compra registrada");
  // Kanban: aguardando entrega → aguardando pontos → pontos recebidos
  const entrega = page.getByRole("region", { name: "Aguardando entrega" });
  await expect(entrega.getByRole("listitem", { name: "Compra Loja Teste E2E" })).toContainText("teste-e2e");
  await entrega.getByRole("listitem", { name: "Compra Loja Teste E2E" }).getByRole("button", { name: "Marcar entregue" }).click();
  await toastSays("aguardando pontos");
  const pontos = page.getByRole("region", { name: "Aguardando pontos" });
  await pontos.getByRole("listitem", { name: "Compra Loja Teste E2E" }).getByRole("button", { name: "Pontos recebidos" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Lançar no extrato" }).click();
  await toastSays("Pontos lançados no extrato");
  await expect(page.getByRole("region", { name: "Pontos recebidos" })).toContainText("Loja Teste E2E");
  await page.goto("/app/entries?q=Loja%20Teste%20E2E");
  await expect(page.getByRole("cell", { name: /Loja Teste E2E/ }).first()).toBeVisible();
});

test("tema claro e escuro", async () => {
  await page.goto("/app/settings");
  await page.getByRole("radio", { name: "Claro" }).first().click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(246, 247, 249)");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  for (const p of ["/app", "/app/entries", "/app/purchases", "/app/credit-cards", "/app/offers"]) {
    await page.goto(p);
    await expect(page.locator("main h1")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/claro${p.replace(/[/?=]/g, "_")}.png` });
  }
  await page.goto("/app/settings");
  await page.getByRole("radio", { name: "Escuro" }).first().click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(9, 9, 11)");
});

test("configurações: abas, plano, indicação e perfil público", async () => {
  await page.goto("/app/settings");
  const tabs = page.getByRole("navigation", { name: "Seções das configurações" });
  for (const t of ["Geral", "Perfil", "Assinatura", "Indicações", "Sua MilhasX"]) await expect(tabs.getByRole("link", { name: t, exact: true })).toBeVisible();

  // Assinatura: pedido de plano, ativado só pela administração
  await tabs.getByRole("link", { name: "Assinatura", exact: true }).click();
  await expect(page.getByText(/Você está experimentando o/)).toBeVisible();
  await page.getByRole("link", { name: "Alterar plano" }).click();
  await page.getByRole("radio", { name: /Anual/ }).click();
  await page.getByRole("region", { name: "Plano PRO" }).getByRole("button", { name: "Escolher PRO" }).click();
  await page.getByRole("button", { name: "Confirmar pedido" }).click();
  await expect(page.getByRole("heading", { name: "Pedido enviado" })).toBeVisible();
  await page.getByRole("link", { name: "Ver assinatura" }).click();
  await expect(page.getByRole("region", { name: "Pedido em andamento" })).toContainText("PRO");
  await page.getByRole("button", { name: "Cancelar pedido" }).click();
  await toastSays("Pedido cancelado");

  // Indicações: link com código
  await tabs.getByRole("link", { name: "Indicações", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Link de indicação" })).toHaveValue(/\/register\?ref=[A-Z2-9]{8}$/);

  // Perfil público: salva e abre a página pública
  await tabs.getByRole("link", { name: "Sua MilhasX", exact: true }).click();
  await page.getByLabel("Endereço da página").fill(`e2e-${Date.now()}`);
  await page.getByLabel("WhatsApp").fill("(11) 98888-7777");
  await page.getByRole("switch", { name: "Página pública ativa" }).click();
  await page.getByRole("button", { name: "Salvar perfil público" }).click();
  await toastSays("Perfil público salvo");
  const href = await page.getByRole("link", { name: "Ver página pública" }).getAttribute("href");
  await page.goto(href!);
  await expect(page.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", "https://wa.me/5511988887777");
});

test("CRM: pedido, etapas, lista, dashboard e captação pela página pública", async () => {
  await page.goto("/app/crm");
  await page.getByRole("button", { name: "Novo pedido" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Nome").fill("Cliente CRM E2E");
  await d.getByLabel("WhatsApp").fill("(21) 98888-1111");
  await d.getByRole("radio", { name: "Ida e volta" }).click();
  await d.getByLabel("Origem", { exact: true }).fill("BSB");
  await d.getByLabel("Destino", { exact: true }).fill("GIG");
  await d.getByLabel("Data de ida").fill("2027-01-23");
  await d.getByLabel("Data de volta").fill("2027-01-30");
  await d.getByRole("button", { name: "Mais adulto" }).click();
  await d.getByRole("button", { name: "Salvar" }).click();
  await toastSays("Pedido criado");
  const novos = page.getByRole("region", { name: "Novos pedidos" });
  await expect(novos.getByRole("listitem", { name: /Cliente CRM E2E/ })).toContainText("BSB ⇄ GIG · 23/01/2027");

  // detalhe: muda de etapa e o cartão vai para a coluna
  await novos.getByRole("button", { name: /Cliente CRM E2E/ }).click();
  const det = page.getByRole("dialog");
  await det.getByRole("navigation", { name: "Etapa do pedido" }).getByRole("button", { name: "Cotação enviada" }).click();
  await expect(det.getByRole("navigation", { name: "Etapa do pedido" }).getByRole("button", { name: "Cotação enviada" })).toHaveAttribute("aria-pressed", "true");
  await expect(det.getByRole("link", { name: "Enviar cotação" })).toHaveAttribute("href", /^https:\/\/wa\.me\/5521988881111\?text=/);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("region", { name: "Cotação enviada" }).getByRole("listitem", { name: /Cliente CRM E2E/ })).toBeVisible();

  await page.goto("/app/crm?view=lista");
  await expect(page.getByRole("region", { name: "Pedidos ativos" })).toContainText("Cliente CRM E2E");
  await page.goto("/app/crm?view=dashboard");
  await expect(page.getByRole("region", { name: "Destinos mais buscados" })).toContainText("Rio de Janeiro (GIG)");

  // buscador a partir do pedido: monta os endereços e anota uma cotação
  await page.goto("/app/buscador");
  await page.evaluate(() => {
    (window as unknown as { __opened: string[] }).__opened = [];
    window.open = ((u: string) => { (window as unknown as { __opened: string[] }).__opened.push(u); return null; }) as typeof window.open;
  });
  const pick = page.getByLabel("Preencher a partir de um pedido");
  await pick.selectOption((await pick.locator("option", { hasText: "Cliente CRM E2E" }).first().getAttribute("value"))!);
  await page.getByRole("button", { name: "Buscar em todos os sites selecionados" }).click();
  await expect(page.getByRole("list", { name: "Links da busca" }).getByRole("link", { name: /LATAM Pass/ })).toHaveAttribute("href", /latamairlines\.com\/br\/pt\/oferta-voos\?origin=BSB.*destination=GIG.*adt=2.*trip=RT/);
  expect(await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened.length)).toBeGreaterThanOrEqual(1);
  await page.getByRole("button", { name: "Comparar cotações" }).click();
  const cmp = page.getByRole("dialog");
  await cmp.getByLabel("Milhas").fill("28000");
  await cmp.getByLabel("Taxas (R$)").fill("98,00");
  await cmp.getByRole("button", { name: "Anotar" }).click();
  await toastSays("Cotação anotada");
  await expect(cmp.getByRole("table", { name: "Cotações do trecho" })).toContainText("28.000");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Histórico" }).click();
  await expect(page.getByRole("dialog")).toContainText("BSB → GIG");
  await page.keyboard.press("Escape");

  // tradutor: a cotação anotada vira a referência do trecho (por adulto)
  await page.goto("/app/tradutor");
  await page.getByRole("complementary", { name: "Trechos com cotações" }).getByRole("link", { name: /BSB → GIG/ }).click();
  await expect(page.getByRole("article", { name: "Programa Smiles" })).toContainText("14.000");

  // captação: a página pública (criada no teste de configurações) recebe um pedido
  await page.goto("/app/crm?view=dashboard");
  const pub = await page.getByRole("region", { name: "Captação de pedidos" }).getByRole("link", { name: "Ver página" }).getAttribute("href");
  await page.goto(pub!);
  // Central de Atendimento: os formulários abrem ao clicar no cartão
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("Sua viagem começa aqui")).toBeVisible();
  await page.getByRole("button", { name: /Interesse em gestão de milhas/ }).click();
  const lead = page.getByRole("form", { name: "Interesse em gestão de milhas" });
  await lead.getByLabel("Seu nome").fill("Interessado E2E");
  await lead.getByLabel("WhatsApp").fill("(11) 96666-3333");
  await lead.getByRole("button", { name: "Quero saber mais" }).click();
  await expect(page.getByText("Recebemos seu interesse!")).toBeVisible();
  await page.getByRole("button", { name: /Pedir cotação de viagem/ }).click();
  const form = page.getByRole("form", { name: "Pedir cotação" });
  await form.getByLabel("Seu nome").fill("Visitante E2E");
  await form.getByLabel("WhatsApp").fill("(11) 97777-2222");
  await form.getByLabel("Origem", { exact: true }).fill("GRU");
  await form.getByLabel("Destino", { exact: true }).fill("LIS");
  await form.getByLabel("Data de ida").fill("2027-05-10");
  await form.getByRole("button", { name: "Pedir cotação" }).click();
  await expect(page.getByText("Pedido enviado!")).toBeVisible();
  await page.goto("/app/crm");
  await expect(page.getByRole("region", { name: "Novos pedidos" }).getByRole("listitem", { name: /Visitante E2E/ })).toContainText("Página pública");
  await page.goto("/app/crm?view=lista");
  await expect(page.getByRole("region", { name: "Interessados em gestão de milhas" })).toContainText("Interessado E2E");
  // menu lateral: Sua MilhasX leva às configurações da página
  await page.locator("aside").getByRole("link", { name: "Sua MilhasX" }).click();
  await expect(page).toHaveURL(/tab=sales-profile/);
});

const PAGES = [
  "/app", "/app/entries", "/app/programs", "/app/programs?view=titulares", "/app/purchases", "/app/purchases?tab=alertas",
  "/app/sales", "/app/sales?tab=clientes", "/app/simulators", "/app/reports", "/app/notifications", "/app/settings", "/app/settings?tab=profile", "/app/settings?tab=billing", "/app/settings?tab=referrals", "/app/settings?tab=sales-profile", "/app/upgrade", "/app/crm", "/app/crm?view=lista", "/app/crm?view=dashboard", "/app/buscador", "/app/tradutor", "/app/tradutor?de=BSB&para=GIG",
  "/app/offers", "/app/offers?tab=historico", "/app/offers?tab=alertas", "/app/credit-cards", "/app/management",
  "/app/management?tab=fornecedores", "/app/guides", "/app/guides/entendendo-o-cpm", "/app/news", "/app/purchases?tab=compras",
];

test("responsivo: celular sem rolagem lateral, extrato em lista, botão redondo", async () => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const p of PAGES) {
    await page.goto(p);
    await expect(page.locator("main h1")).toBeVisible();
    await noHorizontalScroll();
    await page.screenshot({ path: `${SHOTS}/mobile${p.replace(/[/?=]/g, "_")}.png`, fullPage: true });
  }
  await page.goto("/app/entries");
  await expect(page.locator("table")).toBeHidden();
  await expect(page.locator("main ul li").first()).toBeVisible();
  const fab = page.getByRole("button", { name: "Abrir menu de novo lançamento" });
  const box = (await fab.boundingBox())!;
  expect(Math.round(box.width)).toBe(Math.round(box.height));

  await page.getByRole("button", { name: "Abrir/fechar menu lateral" }).click();
  await expect(page.getByRole("navigation", { name: "Menu principal" })).toBeVisible();
  await page.getByRole("link", { name: "Simuladores" }).click();
  await expect(page).toHaveURL(/simulators/);
  // nos simuladores o botão flutuante vira "Simular", como na referência
  await expect(page.getByRole("button", { name: "Simular", exact: true }).last()).toBeVisible();

  await page.goto("/app/entries");
  await openNewEntry("Crédito");
  const dbox = (await page.getByRole("dialog").boundingBox())!;
  expect(dbox.width).toBeGreaterThanOrEqual(370);
  await page.screenshot({ path: `${SHOTS}/mobile_modal_credito.png` });
  await page.keyboard.press("Escape");
});

test("responsivo: tablet e desktop", async () => {
  for (const [w, h, tag] of [[768, 1024, "tablet"], [1280, 800, "desktop"]] as const) {
    await page.setViewportSize({ width: w, height: h });
    for (const p of PAGES) {
      await page.goto(p);
      await expect(page.locator("main h1")).toBeVisible();
      await noHorizontalScroll();
      if (tag === "desktop") await page.screenshot({ path: `${SHOTS}/desktop${p.replace(/[/?=]/g, "_")}.png`, fullPage: true });
    }
  }
  await page.goto("/app/entries");
  await expect(page.locator("main h1")).toBeVisible();
  await openNewEntry("Crédito");
  await page.waitForTimeout(2000);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/desktop_modal_credito.png` });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Abrir menu de novo lançamento" }).click();
  await page.screenshot({ path: `${SHOTS}/desktop_menu_novo.png` });
  await page.keyboard.press("Escape");
});

test("painel administrativo completo", async ({ browser }) => {
  // Promove o usuário de teste com o mesmo código do script do operador (npm run admin:create)
  if (!process.env.DATABASE_URL) process.loadEnvFile(".env");
  const { createAdmin } = await import("../scripts/create-admin-lib");
  const { prisma } = await import("../src/server/db");
  await createAdmin({ email: user.email, name: user.name });

  // um segundo usuário para ativar/desativar
  const other = await browser.newPage();
  const otherEmail = `e2e-outro-${stamp}@exemplo.test`;
  expect((await other.request.post("/api/auth/register", { data: { name: "Outro E2E", email: otherEmail, password: "senha-e2e-123" } })).status()).toBe(201);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/app");
  await page.getByRole("button", { name: new RegExp(user.name) }).click();
  await page.getByRole("menuitem", { name: "Administração" }).click();
  await expect(page.getByRole("heading", { name: "Indicadores" })).toBeVisible();

  await page.goto(`/admin/users?q=${encodeURIComponent(otherEmail)}`);
  await page.getByRole("button", { name: "Desativar" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Desativar" }).click();
  await toastSays("Conta desativada");
  expect((await other.request.get("/api/auth/me")).status()).toBe(401);
  await page.getByRole("button", { name: "Reativar" }).click();
  await toastSays("Conta reativada");
  await other.close();

  await page.goto("/admin/programs");
  await page.getByRole("row", { name: /Smiles/ }).getByRole("button", { name: "Editar" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel(/Valor estimado/).fill("18,00");
  await d.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("row", { name: /Smiles/ })).toContainText("R$ 18,00");
  await d.waitFor({ state: "detached" }).catch(() => {});

  await page.goto("/admin/offers");
  await page.getByLabel("Loja").fill(`Loja E2E ${stamp}`);
  await page.getByLabel(/Programa \(pontos\)/).selectOption({ label: "Livelo" });
  await page.getByLabel("Pontos por real").fill("7");
  await page.getByRole("button", { name: "Salvar oferta" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Oferta salva" })).toBeVisible();
  await expect(page.getByRole("cell", { name: `Loja E2E ${stamp}` })).toBeVisible();
  // catálogo por planilha (para os programas que bloqueiam consultas automáticas)
  const sheet = page.getByRole("form", { name: "Importar planilha" });
  await sheet.getByLabel("Programa").selectOption({ label: "Smiles" });
  await sheet.getByLabel("ou cole aqui").fill(`loja;pontos_por_real;ate\nPlanilha E2E ${stamp};2,5;sim`);
  await sheet.getByRole("button", { name: "Importar planilha" }).click();
  await toastSays(/1 lojas: 1 novas/);
  await expect(page.getByRole("cell", { name: `Planilha E2E ${stamp}` })).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(`Planilha E2E ${stamp}`) })).toContainText("até 2,5");

  await page.goto("/admin/audit?action=admin.");
  await expect(page.getByText("admin.user_disable").first()).toBeVisible();
  await expect(page.getByText("admin.program_update").first()).toBeVisible();
  const csv = await page.request.get("/api/admin/export?kind=audit");
  expect(csv.status()).toBe(200);

  await page.goto("/admin/settings");
  await expect(page.getByText("Cadastro público aberto")).toBeVisible();

  await page.goto("/admin/promotions");
  await page.getByRole("button", { name: "Nova promoção" }).click();
  const pd = page.getByRole("dialog");
  await pd.getByLabel(/Título/).fill(`Promo E2E ${stamp}`);
  await pd.getByLabel(/^Bônus \(%\)/).fill("90");
  await pd.getByLabel(/Programa de destino/).selectOption({ label: "LATAM Pass" });
  await pd.getByLabel(/^Fim/).fill(new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10));
  await pd.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Promoção criada" })).toBeVisible();
  await page.goto("/app/notifications");
  await expect(page.getByText(`Promo E2E ${stamp}`)).toBeVisible();

  await page.goto("/admin/news");
  await page.getByRole("button", { name: "Nova publicação" }).click();
  await page.getByRole("dialog").getByLabel(/Título/).fill(`Novidade E2E ${stamp}`);
  await page.getByRole("dialog").getByLabel(/Texto/).fill("Texto da novidade.");
  await page.getByRole("dialog").getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Novidade publicada" })).toBeVisible();

  await page.goto("/admin/guides");
  await page.getByRole("button", { name: "Novo guia" }).click();
  const gd = page.getByRole("dialog");
  await gd.getByLabel(/^Título/).fill("Guia E2E");
  await gd.getByLabel(/Endereço/).fill(`guia-e2e-${stamp}`);
  await gd.getByLabel(/Resumo/).fill("Resumo do guia");
  await gd.getByLabel(/Conteúdo/).fill("## Seção\n\nParágrafo.");
  await gd.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Guia criado" })).toBeVisible();
  await page.goto(`/app/guides/guia-e2e-${stamp}`);
  await expect(page.getByRole("heading", { name: "Seção" })).toBeVisible();

  await page.setViewportSize({ width: 375, height: 812 });
  for (const p of ["/admin", "/admin/users", "/admin/programs", "/admin/offers", "/admin/promotions", "/admin/guides", "/admin/news", "/admin/audit", "/admin/settings"]) {
    await page.goto(p);
    await expect(page.locator("main h1")).toBeVisible();
    await noHorizontalScroll();
  }
  await page.setViewportSize({ width: 1280, height: 800 });

  // limpa: oferta de teste e rebaixa o usuário
  await prisma.store.deleteMany({ where: { name: `Loja E2E ${stamp}` } });
  await prisma.promotion.deleteMany({ where: { title: `Promo E2E ${stamp}` } });
  await prisma.newsPost.deleteMany({ where: { title: `Novidade E2E ${stamp}` } });
  await prisma.guide.deleteMany({ where: { slug: `guia-e2e-${stamp}` } });
  await prisma.program.update({ where: { code: "SMILES" }, data: { marketValueCpmCents: 1750 } });
  await prisma.user.deleteMany({ where: { email: otherEmail } });
  await prisma.user.update({ where: { email: user.email }, data: { role: "USER" } });
  await prisma.$disconnect();
});

test("limpeza: excluir dados do usuário de teste", async () => {
  await page.goto("/app/entries?pageSize=100");
  const all = page.getByLabel("Selecionar todos");
  if (await all.isVisible()) {
    await all.check();
    await page.getByRole("button", { name: "Excluir", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Excluir" }).click();
    await toastSays("excluído");
  }
});
