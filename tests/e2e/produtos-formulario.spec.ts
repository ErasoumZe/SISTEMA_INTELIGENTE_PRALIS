import { expect, test, type Page } from "@playwright/test";
import {
  entrar,
  escolherNoSelect,
  escolherPrimeiraOpcao,
  LARGURAS,
  mensagemDoCampo,
  observarConsole,
  PREFIXO,
  semRolagemHorizontal,
  USUARIOS
} from "./apoio.js";
import { criarProdutoPelaBase } from "./apoio-compras.js";

/**
 * Formulario de produto em pagina dedicada, nos DOIS cadastros do app oficial (R-222):
 *  - BASE (`/produtos/novo`, `/produtos/base/:id`): so o administrador cria e altera; sem fiscal e
 *    sem promocao, que sao da loja;
 *  - LOJA (`/produtos/:id`): a copia importada; o que veio da base fica em leitura.
 *
 * Cada teste cria o proprio produto com nome unico — nenhum depende do que o anterior deixou.
 */

const nomeUnico = () => `${PREFIXO} ${Date.now()}-${Math.floor(Math.random() * 1000)}`;

/** Preenche o minimo obrigatorio: nome, quantidade, unidade e grupo (oficial: produto novo exige grupo). */
async function preencherObrigatorios(page: Page, descricao: string, quantidade = "25") {
  await page.locator('[data-campo="nomeCatalogo"] input').fill(descricao);
  await page.locator('[data-campo="quantidadeIndividual"] input').fill(quantidade);
  await escolherPrimeiraOpcao(page, '[data-campo="unidadeIndividualId"]');
  await escolherPrimeiraOpcao(page, '[data-campo="grupoMercadoriaId"]');
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

test("cria o produto NA BASE, volta ao catalogo BASE e recebe codigo interno sequencial", async ({ page }) => {
  const problemas = observarConsole(page);
  const descricao = nomeUnico();

  await page.goto("/produtos/novo");
  await expect(page.getByRole("heading", { name: "Novo produto na base" })).toBeVisible();
  await preencherObrigatorios(page, descricao);
  await page.getByRole("button", { name: "Salvar produto" }).click();

  await page.waitForURL("**/produtos/base");
  await page.getByLabel("Buscar por nome, código interno ou EAN").fill(descricao);
  const linha = page.locator(".catalogo-base__linha").filter({ hasText: descricao });
  await expect(linha).toBeVisible();
  // Codigo interno de 5 digitos, atribuido pelo SERVIDOR (o campo e somente leitura na tela).
  await expect(linha.locator("td.cx-num").first()).toHaveText(/^\d{5}$/);
  expect(problemas).toEqual([]);
});

test("editar a BASE hidrata o formulario e o codigo interno fica somente leitura", async ({ page }) => {
  const descricao = nomeUnico();
  const { baseId } = await criarProdutoPelaBase({ descricao });

  await page.goto(`/produtos/base/${baseId}`);
  await expect(page.getByRole("heading", { name: "Editar produto da base" })).toBeVisible();
  await expect(page.locator('[data-campo="nomeCatalogo"] input')).toHaveValue(descricao.toUpperCase());
  await expect(page.getByLabel("Código interno")).toHaveValue(/^\d{5}$/);
  await expect(page.getByLabel("Código interno")).toHaveAttribute("readonly", "");
});

test("na copia da loja o que veio da base fica em leitura e os locais de venda salvam", async ({ page }) => {
  const descricao = nomeUnico();
  const { produtoId } = await criarProdutoPelaBase({ descricao });

  await page.goto(`/produtos/${produtoId}`);
  await expect(page.getByRole("heading", { name: "Editar produto" })).toBeVisible();
  await expect(page.getByText("segue a base")).toBeVisible();
  await expect(page.locator('[data-campo="nomeCatalogo"] input')).toBeDisabled();
  await expect(page.locator('[data-campo="grupoMercadoriaId"] input')).toBeDisabled();

  await page.getByLabel("Local de venda 1").fill("Gôndola 01");
  await page.getByLabel("Local de venda 2").fill("Ponta de gôndola");
  await page.getByRole("button", { name: "Salvar produto" }).click();
  await page.waitForURL("**/produtos");

  await page.goto(`/produtos/${produtoId}`);
  // Texto descritivo e gravado em maiusculas (regra do app oficial).
  await expect(page.getByLabel("Local de venda 1")).toHaveValue("GÔNDOLA 01");
  await expect(page.getByLabel("Local de venda 2")).toHaveValue("PONTA DE GÔNDOLA");
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

test("vai para balanca: tecla fixa 000 e validade obrigatoria de 0 a 999", async ({ page }) => {
  await page.goto("/produtos/novo");
  await preencherObrigatorios(page, nomeUnico());
  const salvar = page.getByRole("button", { name: "Salvar produto" });

  await escolherNoSelect(page, "Vai para balança? *", "Sim");
  await expect(page.getByLabel("Tecla da balança")).toHaveValue("000");
  await expect(mensagemDoCampo(page, "validadeBalanca")).toContainText("validade da balança");
  await expect(salvar).toBeDisabled();

  await page.locator('[data-campo="validadeBalanca"] input').fill("1000");
  await expect(salvar).toBeDisabled();
  await page.locator('[data-campo="validadeBalanca"] input').fill("5");
  await expect(salvar).toBeEnabled();
});

test("estoque minimo fora do multiplo da embalagem bloqueia o salvar", async ({ page }) => {
  await page.goto("/produtos/novo");
  await preencherObrigatorios(page, nomeUnico());
  await page.getByLabel("Qtd. por embalagem").fill("10");
  await page.getByLabel("Estoque mínimo").fill("15");

  await expect(mensagemDoCampo(page, "estoqueMin")).toContainText("múltiplo da Qt. embalagem (10)");
  await expect(page.getByRole("button", { name: "Salvar produto" })).toBeDisabled();
});

test("a base nao tem fiscal nem promocao; a copia da loja tem os dois", async ({ page }) => {
  await page.goto("/produtos/novo");
  await preencherObrigatorios(page, nomeUnico());
  await expect(page.getByRole("heading", { name: "Promoções" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Fiscal" })).toHaveCount(0);

  // Transformacao mostra a ficha (o bloco que a loja herda inteiro).
  await escolherNoSelect(page, "Tipo", "Transformação");
  await expect(page.getByRole("heading", { name: "Transformação" })).toBeVisible();

  const { produtoId } = await criarProdutoPelaBase({ descricao: nomeUnico() });
  await page.goto(`/produtos/${produtoId}`);
  await expect(page.getByRole("heading", { name: "Promoções" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fiscal" })).toBeVisible();
});

test("duas promocoes sobrepostas sao recusadas na tela", async ({ page }) => {
  const { produtoId } = await criarProdutoPelaBase({ descricao: nomeUnico() });
  await page.goto(`/produtos/${produtoId}`);
  await expect(page.getByRole("heading", { name: "Promoções" })).toBeVisible();

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

test("foto na base: exibe a imagem e sobrevive ao recarregar", async ({ page }) => {
  const problemas = observarConsole(page);
  const { baseId } = await criarProdutoPelaBase({ descricao: nomeUnico() });

  await page.goto(`/produtos/base/${baseId}`);
  await expect(page.getByRole("heading", { name: "Editar produto da base" })).toBeVisible();

  await page.locator('.produto-foto input[type="file"]').setInputFiles("tests/e2e/fixtures/foto-produto.png");
  await expect(page.locator(".produto-foto__imagem")).toBeVisible();
  await expect(page.getByRole("button", { name: "Remover" })).toBeVisible();

  // Recarrega: a foto tem de vir do SERVIDOR, nao do preview local que acabou de ser criado.
  await page.reload();
  const imagem = page.locator(".produto-foto__imagem");
  await expect(imagem).toBeVisible();

  // `<img src>` apontando direto para a API e bloqueado por Cross-Origin-Resource-Policy: a imagem
  // TEM de ser um object URL baixado com credenciais, e tem de ter pixel de verdade.
  await expect(imagem).toHaveAttribute("src", /^blob:/);
  const carregou = await imagem.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
  expect(carregou, "a foto foi bloqueada pelo navegador").toBe(true);
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
    await expect(page.getByRole("heading", { name: "Novo produto na base" })).toBeVisible();

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

  test(`copia da loja sem rolagem horizontal em ${largura}px (${nome})`, async ({ page }) => {
    const { produtoId } = await criarProdutoPelaBase({ descricao: nomeUnico() });
    await page.setViewportSize({ width: largura, height: altura });
    await page.goto(`/produtos/${produtoId}`);
    await expect(page.getByText("segue a base")).toBeVisible();
    await semRolagemHorizontal(page);
  });
}
