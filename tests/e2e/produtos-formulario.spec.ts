import { expect, test, type Page } from "@playwright/test";
import {
  entrar,
  escolherNoSelect,
  escolherPrimeiraOpcao,
  esperarListagem,
  LARGURAS,
  mensagemDoCampo,
  observarConsole,
  PREFIXO,
  semRolagemHorizontal,
  USUARIOS
} from "./apoio.js";

/**
 * Formulario de produto em pagina dedicada: criacao, edicao, previas, validacao, foto e scanner.
 *
 * Cada teste cria o proprio produto com nome unico — nenhum depende do que o anterior deixou.
 */

const nomeUnico = () => `${PREFIXO} ${Date.now()}-${Math.floor(Math.random() * 1000)}`;

/** Preenche o minimo obrigatorio: descricao, quantidade e unidade. */
async function preencherObrigatorios(page: Page, descricao: string, quantidade = "25") {
  await page.locator('[data-campo="descricao"] input').fill(descricao);
  await page.locator('[data-campo="quantidadeIndividual"] input').fill(quantidade);
  await escolherPrimeiraOpcao(page, '[data-campo="unidadeIndividualId"]');
}

test.beforeEach(async ({ page }) => {
  await entrar(page, USUARIOS.admin);
});

test("salvar nasce desabilitado e habilita quando o obrigatorio esta preenchido", async ({ page }) => {
  await page.goto("/produtos/novo");
  const salvar = page.getByRole("button", { name: "Salvar produto" });
  await expect(salvar).toBeDisabled();

  await preencherObrigatorios(page, nomeUnico());
  await expect(salvar).toBeEnabled();
});

test("a previa da descricao automatica e NOME + QUANTIDADE + UNIDADE", async ({ page }) => {
  await page.goto("/produtos/novo");
  const descricao = nomeUnico();
  await preencherObrigatorios(page, descricao, "25");

  const previa = page.getByLabel("Descrição automática (prévia)");
  // A unidade do seed de desenvolvimento e "un"; a regra sobe tudo para maiuscula.
  await expect(previa).toHaveValue(new RegExp(`^${descricao.toUpperCase()} 25 [A-Z]+$`));
});

test('a previa "como se compra" usa o formato oficial', async ({ page }) => {
  await page.goto("/produtos/novo");
  await preencherObrigatorios(page, nomeUnico(), "25");

  await escolherPrimeiraOpcao(page, ".secao__grade-compra .v-select");
  await page.getByLabel("Qtd. por embalagem").fill("25");

  // "<Rotulo> de 25 <MEDIDA> — <DESCRICAO>" — uma implementacao so, a do shared.
  await expect(page.getByLabel("Como se compra (prévia)")).toHaveValue(/\sde\s25\b.*—/);
});

test("cria o produto, volta para a listagem e recebe codigo interno sequencial", async ({ page }) => {
  const problemas = observarConsole(page);
  const descricao = nomeUnico();

  await page.goto("/produtos/novo");
  await preencherObrigatorios(page, descricao);
  await page.getByRole("button", { name: "Salvar produto" }).click();

  await page.waitForURL("**/produtos");
  await esperarListagem(page);
  await page.getByPlaceholder("Buscar por nome, código, EAN ou marca...").fill(descricao);
  await expect(page.locator(".produto-card h3").first()).toHaveText(descricao);
  // Codigo interno de 5 digitos, atribuido pelo SERVIDOR (o campo e somente leitura na tela).
  await expect(page.locator(".produto-card__titulo p").first()).toHaveText(/^\d{5}$/);
  expect(problemas).toEqual([]);
});

test("editar hidrata o formulario e o codigo interno fica somente leitura", async ({ page }) => {
  const descricao = nomeUnico();
  await page.goto("/produtos/novo");
  await preencherObrigatorios(page, descricao);
  await page.getByRole("button", { name: "Salvar produto" }).click();
  await page.waitForURL("**/produtos");

  await esperarListagem(page);
  await page.getByPlaceholder("Buscar por nome, código, EAN ou marca...").fill(descricao);
  await page.locator(".produto-card").first().getByRole("link", { name: "Editar" }).click();

  await expect(page.getByRole("heading", { name: "Editar produto" })).toBeVisible();
  await expect(page.locator('[data-campo="descricao"] input')).toHaveValue(descricao);
  await expect(page.getByLabel("Código interno")).toHaveValue(/^\d{5}$/);
  await expect(page.getByLabel("Código interno")).toHaveAttribute("readonly", "");
});

test("locais de venda salvam e reaparecem na edicao", async ({ page }) => {
  const descricao = nomeUnico();
  await page.goto("/produtos/novo");
  await preencherObrigatorios(page, descricao);
  await page.getByRole("button", { name: "Salvar produto" }).click();
  await page.waitForURL("**/produtos");

  await esperarListagem(page);
  await page.getByPlaceholder("Buscar por nome, código, EAN ou marca...").fill(descricao);
  await page.locator(".produto-card").first().getByRole("link", { name: "Editar" }).click();
  await page.getByLabel("Local de venda 1").fill("Gôndola 01");
  await page.getByLabel("Local de venda 2").fill("Ponta de gôndola");
  await page.getByRole("button", { name: "Salvar produto" }).click();
  await page.waitForURL("**/produtos");

  await page.getByPlaceholder("Buscar por nome, código, EAN ou marca...").fill(descricao);
  await page.locator(".produto-card").first().getByRole("link", { name: "Editar" }).click();
  await expect(page.getByLabel("Local de venda 1")).toHaveValue("Gôndola 01");
  await expect(page.getByLabel("Local de venda 2")).toHaveValue("Ponta de gôndola");
});

test("estoque maximo menor que o minimo bloqueia o salvar com mensagem no campo", async ({ page }) => {
  await page.goto("/produtos/novo");
  await preencherObrigatorios(page, nomeUnico());

  await page.getByLabel("Estoque mínimo").fill("100");
  await page.locator('[data-campo="estoqueMax"] input').fill("10");

  await expect(mensagemDoCampo(page, "estoqueMax")).toContainText("O máximo não pode ser menor que o mínimo.");
  await expect(page.getByRole("button", { name: "Salvar produto" })).toBeDisabled();

  await page.locator('[data-campo="estoqueMax"] input').fill("200");
  await expect(page.getByRole("button", { name: "Salvar produto" })).toBeEnabled();
});

test("promocao so existe para revenda e some no tipo transformacao", async ({ page }) => {
  await page.goto("/produtos/novo");
  await preencherObrigatorios(page, nomeUnico());

  await expect(page.getByRole("heading", { name: "Promoções" })).toBeVisible();

  await escolherNoSelect(page, "Tipo", "Transformação");

  await expect(page.getByRole("heading", { name: "Promoções" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Transformação" })).toBeVisible();
});

test("duas promocoes sobrepostas sao recusadas na tela", async ({ page }) => {
  await page.goto("/produtos/novo");
  await preencherObrigatorios(page, nomeUnico());

  const adicionar = page.getByRole("button", { name: "Adicionar" }).first();
  await adicionar.click();
  await adicionar.click();

  // Duas promocoes de desconto, ambas todos os dias e sem janela: colidem por definicao.
  const descontos = page.getByLabel("Desconto %");
  await descontos.nth(0).fill("10");
  await descontos.nth(1).fill("20");

  await expect(page.locator(".secao__erros")).toContainText("se sobrepõem");
  await expect(page.getByRole("button", { name: "Salvar produto" })).toBeDisabled();
});

test("upload de foto exibe a imagem e sobrevive ao recarregar", async ({ page }) => {
  const problemas = observarConsole(page);
  const descricao = nomeUnico();

  await page.goto("/produtos/novo");
  await preencherObrigatorios(page, descricao);
  await page.getByRole("button", { name: "Salvar produto" }).click();
  await page.waitForURL("**/produtos");

  await esperarListagem(page);
  await page.getByPlaceholder("Buscar por nome, código, EAN ou marca...").fill(descricao);
  await page.locator(".produto-card").first().getByRole("link", { name: "Editar" }).click();
  await expect(page.getByRole("heading", { name: "Editar produto" })).toBeVisible();

  await page.locator('.produto-foto input[type="file"]').setInputFiles("tests/e2e/fixtures/foto-produto.png");
  await expect(page.locator(".produto-foto__imagem")).toBeVisible();
  await expect(page.getByRole("button", { name: "Remover" })).toBeVisible();
  await page.locator(".produto-foto__imagem").click();
  await expect(page.getByRole("dialog", { name: "Foto ampliada do produto" })).toBeVisible();
  await expect(page.locator(".produto-foto__ampliada")).toBeVisible();
  await page.getByRole("button", { name: "Fechar foto ampliada" }).click();
  await expect(page.getByRole("dialog", { name: "Foto ampliada do produto" })).toBeHidden();

  // Recarrega: a foto tem de vir do SERVIDOR, nao do preview local que acabou de ser criado.
  await page.reload();
  const imagem = page.locator(".produto-foto__imagem");
  await expect(imagem).toBeVisible();

  // `<img src>` apontando direto para a API e bloqueado por Cross-Origin-Resource-Policy: a imagem
  // TEM de ser um object URL baixado com credenciais, e tem de ter pixel de verdade.
  await expect(imagem).toHaveAttribute("src", /^blob:/);
  const carregou = await imagem.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
  expect(carregou, "a foto foi bloqueada pelo navegador").toBe(true);

  await page.goto("/produtos");
  await esperarListagem(page);
  await page.getByPlaceholder("Buscar por nome, cÃ³digo, EAN ou marca...").fill(descricao);
  const fotoDoCard = page.locator(".produto-card__foto img").first();
  await expect(fotoDoCard).toBeVisible();
  await fotoDoCard.click();
  await expect(page.getByRole("dialog", { name: new RegExp(`Foto ampliada de ${descricao}`) })).toBeVisible();
  await expect(page.locator(".produto-card__foto-ampliada")).toBeVisible();
  expect(problemas).toEqual([]);
});

test("o leitor de codigo de barras abre e fechar encerra a camera", async ({ page }) => {
  await page.goto("/produtos/novo");

  await page.locator(".mdi-barcode-scan").click();
  await expect(page.getByText("Ler código de barras")).toBeVisible();
  await expect(page.locator(".scanner__video")).toBeVisible();

  await page.getByRole("button", { name: "Fechar leitor" }).click();
  await expect(page.locator(".scanner__video")).toHaveCount(0);

  // Nenhuma track de midia pode ficar viva: camera esquecida acende a luz e come bateria.
  const tracksVivas = await page.evaluate(() => {
    const video = document.querySelector<HTMLVideoElement>(".scanner__video");
    const stream = video?.srcObject as MediaStream | null;
    return stream ? stream.getTracks().filter((t) => t.readyState === "live").length : 0;
  });
  expect(tracksVivas).toBe(0);
});

test("a ajuda por campo liga e desliga, e a preferencia sobrevive ao recarregar", async ({ page }) => {
  await page.goto("/produtos/novo");

  const dicaDoStatus = page.locator('.v-messages__message:has-text("Produto inativo some das operacoes")');
  await expect(dicaDoStatus).toHaveCount(0);

  await page.getByRole("button", { name: "Ajuda" }).click();
  await expect(dicaDoStatus.first()).toBeVisible();

  // A preferencia e do USUARIO (localStorage por id), nao do produto: sobrevive ao reload.
  await page.reload();
  await expect(dicaDoStatus.first()).toBeVisible();

  await page.getByRole("button", { name: "Ajuda" }).click();
  await expect(dicaDoStatus).toHaveCount(0);
});

for (const { nome, largura, altura } of LARGURAS) {
  test(`formulario sem rolagem horizontal em ${largura}px (${nome})`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: altura });
    await page.goto("/produtos/novo");
    await expect(page.getByRole("heading", { name: "Novo produto" })).toBeVisible();

    await semRolagemHorizontal(page);

    // No celular as acoes ficam fixas no rodape (`67` §13.3) e o alvo de toque sobe para 44px.
    if (largura <= 768) {
      const posicao = await page.locator(".produto-form__acoes").evaluate((el) => getComputedStyle(el).position);
      expect(posicao).toBe("sticky");

      const alturas = await page
        .locator(".produto-form .v-btn--size-small")
        .evaluateAll((botoes) => botoes.map((b) => Math.round(b.getBoundingClientRect().height)));
      expect(
        alturas.every((h) => h >= 44),
        `alvo de toque abaixo de 44px: ${alturas.join(", ")}`
      ).toBe(true);
    }
  });
}
