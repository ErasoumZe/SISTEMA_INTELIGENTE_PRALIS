import { expect, test } from "@playwright/test";
import {
  entrar,
  escolherNoSelect,
  esperarListagem,
  LARGURAS,
  observarConsole,
  semRolagemHorizontal,
  totalDaListagem,
  USUARIOS
} from "./apoio.js";

/**
 * Listagem de Produtos: busca, filtros, ordenacao e paginacao — todos SERVER-SIDE.
 *
 * O defeito historico que estes testes prendem: a tela recebia apenas os 10 primeiros produtos,
 * porque `pageSize` tinha default 10 e `apiGet` descartava `meta.pagination`. Com 11 cadastrados ja
 * faltava um.
 */

test.beforeEach(async ({ page }) => {
  // A stack de E2E pode bloquear a saída para Google Fonts. A fonte não participa do contrato
  // funcional e seu erro de rede não deve invalidar as verificações de console da página.
  await page.route("https://fonts.googleapis.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/css", body: "" })
  );
  await entrar(page, USUARIOS.admin);
});

test("mostra mais de uma pagina e a segunda tem produtos diferentes", async ({ page }) => {
  const problemas = observarConsole(page);
  await page.goto("/produtos");
  await esperarListagem(page);

  const total = await totalDaListagem(page);
  test.skip(total <= 12, "precisa de mais de uma pagina de produtos no banco de desenvolvimento");

  await expect(page.locator(".produtos-tela__paginacao")).toBeVisible();
  const primeiraPagina = await page.locator(".produto-card h3").allTextContents();
  expect(primeiraPagina.length).toBeGreaterThan(0);
  await expect(page.locator(".produtos-tela__paginacao")).toContainText("Página 1 de");

  await page.getByRole("button", { name: "Go to page 2" }).click();
  await expect(page.locator(".produtos-tela__paginacao")).toContainText("Página 2 de");

  const segundaPagina = await page.locator(".produto-card h3").allTextContents();
  expect(segundaPagina.length).toBeGreaterThan(0);
  // Nenhum produto se repete entre as paginas: prova que o corte e do banco, nao da tela.
  expect(segundaPagina.filter((nome) => primeiraPagina.includes(nome))).toEqual([]);
  expect(problemas).toEqual([]);
});

test("alterna entre cards e lista sem perder o recorte carregado", async ({ page }) => {
  await page.goto("/produtos");
  await esperarListagem(page);

  const total = await totalDaListagem(page);
  const primeiroProduto = (await page.locator(".produto-card h3").first().textContent())?.trim();
  expect(primeiroProduto).toBeTruthy();

  await page.getByRole("button", { name: "Ver em lista" }).click();
  await expect(page.locator(".produto-linha")).toHaveCount(Math.min(total, 12));
  await expect(page.locator(".produto-linha h2").first()).toHaveText(primeiroProduto!);

  await page.reload();
  await esperarListagem(page);
  await expect(page.locator(".produto-linha").first()).toBeVisible();

  await page.getByRole("button", { name: "Ver em cards" }).click();
  await expect(page.locator(".produto-card h3").first()).toHaveText(primeiroProduto!);
});

test("filtro de vendidos envia o recorte para a API", async ({ page }) => {
  await page.goto("/produtos");
  await esperarListagem(page);

  const resposta = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/produtos" && url.searchParams.get("somenteVendidos") === "true";
  });
  await page.getByLabel("Só os que já vendi").check();
  await resposta;
  await expect(page.getByLabel("Só os que já vendi")).toBeChecked();
});

test("busca no servidor reduz o resultado e limpar devolve o total", async ({ page }) => {
  await page.goto("/produtos");
  await esperarListagem(page);
  const total = await totalDaListagem(page);

  const alvo = (await page.locator(".produto-card h3").first().textContent())?.trim() ?? "";
  expect(alvo).not.toBe("");

  await page.getByPlaceholder("Buscar por nome, código, EAN ou marca...").fill(alvo);
  await expect(page.locator(".produtos-cabecalho p")).not.toContainText(`${total} produto(s)`);
  await expect(page.locator(".produto-card h3").first()).toHaveText(alvo);

  await page.getByPlaceholder("Buscar por nome, código, EAN ou marca...").fill("");
  await expect(page.locator(".produtos-cabecalho p")).toContainText(`${total} produto(s)`);
});

test("busca sem resultado mostra o estado vazio com acao de limpar", async ({ page }) => {
  await page.goto("/produtos");
  await esperarListagem(page);

  await page.getByPlaceholder("Buscar por nome, código, EAN ou marca...").fill("NAO-EXISTE-ZZZ-999");
  await expect(page.locator(".produtos-tela__vazio")).toContainText("Nenhum produto com esses filtros");
  await expect(page.getByRole("button", { name: "Limpar filtros" })).toBeVisible();

  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await expect(page.locator(".produto-card").first()).toBeVisible();
});

test("filtro de status devolve so o status pedido e o contador acompanha", async ({ page }) => {
  await page.goto("/produtos");
  await esperarListagem(page);

  // O catálogo oficial abre em "Só ativos"; desmarque para provar a aplicação explícita do filtro.
  await page.getByLabel("Só ativos").uncheck();

  await page.getByRole("button", { name: "Filtros" }).click();
  await page.getByRole("button", { name: "Ativos", exact: true }).click();

  await expect(page.locator(".produtos-tela__barra .v-chip")).toHaveCount(0);
  await expect(page.getByLabel("Só ativos")).toBeChecked();
  const status = await page.locator(".produto-card__status").allTextContents();
  expect(status.length).toBeGreaterThan(0);
  expect(status.every((s) => s.trim() === "Ativo")).toBe(true);

  // Clicar de novo na mesma pilula LIMPA o filtro — o gesto herdado do app antigo.
  await page.getByRole("button", { name: "Ativos", exact: true }).click();
  await expect(page.locator(".produtos-tela__barra .v-chip")).toHaveCount(0);
  await expect(page.getByLabel("Só ativos")).not.toBeChecked();
});

test("filtros combinam e o contador soma", async ({ page }) => {
  await page.goto("/produtos");
  await esperarListagem(page);

  await page.getByRole("button", { name: "Filtros" }).click();
  await page.getByRole("button", { name: "Inativos", exact: true }).click();
  await expect(page.locator(".produtos-tela__barra .v-chip")).toHaveText("1");

  await page.getByRole("button", { name: "Transformação", exact: true }).click();
  await expect(page.locator(".produtos-tela__barra .v-chip")).toHaveText("2");

  const status = await page.locator(".produto-card__status").allTextContents();
  const tipos = await page.locator(".produto-card__dados dd").nth(0).allTextContents();
  expect(status.every((s) => s.trim() === "Inativo")).toBe(true);
  if (tipos.length) expect(tipos[0]?.trim()).toBe("Transformação");
});

test("ordenacao A-Z e Z-A sao inversas uma da outra", async ({ page }) => {
  await page.goto("/produtos");
  await esperarListagem(page);

  await page.getByRole("button", { name: "Filtros" }).click();

  await escolherNoSelect(page, "Ordenar", "Nome (A–Z)");
  await expect(page.locator(".produtos-tela__barra .v-chip")).toHaveText("1");
  const az = (await page.locator(".produto-card h3").first().textContent())?.trim();

  await escolherNoSelect(page, "Ordenar", "Nome (Z–A)");
  const za = (await page.locator(".produto-card h3").first().textContent())?.trim();

  expect(az).not.toBe(za);
});

test("nao existe botao de excluir produto — produto e inativado", async ({ page }) => {
  await page.goto("/produtos");
  await esperarListagem(page);
  await expect(page.locator(".produto-card").getByRole("button", { name: /excluir/i })).toHaveCount(0);
  await expect(page.locator(".produto-card").getByRole("link", { name: /excluir/i })).toHaveCount(0);
});

for (const { nome, largura, altura } of LARGURAS) {
  test(`listagem sem rolagem horizontal em ${largura}px (${nome})`, async ({ page }) => {
    const problemas = observarConsole(page);
    page.on("response", (response) => {
      if (response.status() >= 500) problemas.push(`HTTP ${response.status()}: ${response.url()}`);
    });
    await page.setViewportSize({ width: largura, height: altura });
    await page.goto("/produtos");
    await esperarListagem(page);

    await semRolagemHorizontal(page);

    // Progressao de colunas do `67` §13.4: 3 no desktop, 2 no meio, 1 no celular. Nunca 3 -> 1.
    const colunas = await page.evaluate(() => {
      const grade = document.querySelector(".produtos-tela__grade");
      return grade ? getComputedStyle(grade).gridTemplateColumns.split(" ").length : 0;
    });
    if (largura > 1024) expect(colunas).toBe(3);
    else if (largura <= 600) expect(colunas).toBe(1);
    else expect(colunas).toBe(2);

    expect(problemas).toEqual([]);
  });
}

for (const { nome, largura, altura } of LARGURAS) {
  test(`modo lista sem rolagem horizontal em ${largura}px (${nome})`, async ({ page }) => {
    const problemas = observarConsole(page);
    page.on("response", (response) => {
      if (response.status() >= 500) problemas.push(`HTTP ${response.status()}: ${response.url()}`);
    });
    await page.setViewportSize({ width: largura, height: altura });
    await page.goto("/produtos");
    await esperarListagem(page);
    await page.getByRole("button", { name: "Ver em lista" }).click();

    await expect(page.locator(".produto-linha").first()).toBeVisible();
    await semRolagemHorizontal(page);
    expect(problemas).toEqual([]);
  });
}
