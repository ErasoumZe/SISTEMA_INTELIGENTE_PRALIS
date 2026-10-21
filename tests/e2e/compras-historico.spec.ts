import { expect, test } from "@playwright/test";
import { entrar, LARGURAS, observarConsole, semRolagemHorizontal, USUARIOS } from "./apoio.js";
import {
  abrirContextoCompras,
  criarFornecedor,
  criarProdutoDeEstoque,
  dialogoAberto,
  esperarOverlayFechar,
  irParaTela,
  type ContextoCompras
} from "./apoio-compras.js";

/**
 * R-222 (PROJECT_BRAIN/55), no navegador real: o operador importa a planilha de discriminacao (CSV
 * pt-BR), confere o que a aplicacao faria no catalogo, aplica, e consulta o ultimo custo. Nada entra no
 * historico antes de aplicar; aplicar duas vezes nao duplica. Tambem prova 1440/1024/768/390 sem rolagem
 * horizontal, com o dialogo aberto.
 */
function dmy(diasAtras: number): string {
  const data = new Date(Date.now() - diasAtras * 86_400_000);
  return `${String(data.getUTCDate()).padStart(2, "0")}/${String(data.getUTCMonth() + 1).padStart(2, "0")}/${data.getUTCFullYear()}`;
}

test.describe("historico de compras por fornecedor e produto", () => {
  test.setTimeout(240_000);

  let contexto: ContextoCompras;

  test.beforeAll(async () => {
    contexto = await abrirContextoCompras();
  });

  test.afterAll(async () => {
    await contexto.api.dispose();
  });

  test("importa, confere o catalogo antes, aplica e consulta o ultimo custo em todas as larguras", async ({ page }) => {
    const problemas = observarConsole(page);
    const sufixo = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const produto = `E2E Historico ${sufixo}`;
    const fornecedor = `E2E Forn Historico ${sufixo}`;
    await criarProdutoDeEstoque(contexto, {
      descricao: produto,
      estoqueMin: 1,
      estoqueMax: 10,
      setorEstoque: `Deposito Historico ${sufixo}`
    });
    await criarFornecedor(contexto, fornecedor, "11966665555");

    const csv = [
      "REFERÊNCIA;PRODUTOS;QUANT;VALOR CUSTO UN;DATA REF;CONFRONTAR",
      `${fornecedor} - ${dmy(20)} - 100;${produto};10;5,00;${dmy(20)};CONFRONTADO`,
      `${fornecedor} - ${dmy(3)} - 65;${produto};10;6,50;${dmy(3)};CONFRONTADO`,
      `${fornecedor} - ${dmy(2)} - 1;PRODUTO FORA DO CADASTRO ${sufixo};1;1,00;${dmy(2)};CONFRONTADO`
    ].join("\r\n");

    await entrar(page, USUARIOS.compras);
    await irParaTela(page, "/pedidos", "Pedidos");
    await page.getByRole("tab", { name: "Histórico de compras" }).click();

    // 1) Importar abre a analise sozinha, e NADA foi gravado ainda.
    await page
      .locator(".v-window-item--active input[type=file]")
      .setInputFiles({ name: `historico-${sufixo}.csv`, mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
    const analise = dialogoAberto(page);
    await expect(analise.getByText("Importação de histórico")).toBeVisible({ timeout: 60_000 });
    await expect(analise.locator('[data-secao="resultados"]')).toContainText("Pareadas: 2");
    await expect(analise.locator('[data-secao="resultados"]')).toContainText("Produto sem par: 1");
    // O que a aplicacao faria no catalogo aparece ANTES de aplicar, e o preco-base fica de fora.
    await expect(analise.locator('[data-secao="previa"]')).toContainText("1 vínculo(s) novo(s) aprovado(s)");
    await expect(analise.locator('[data-secao="previa"]')).toContainText("O preço-base não é alterado");
    await expect(analise.locator('[data-secao="produtos-pendentes"]')).toContainText(
      `PRODUTO FORA DO CADASTRO ${sufixo}`
    );
    await semRolagemHorizontal(page);

    // 2) Aplicar pede confirmacao e grava so as pareadas.
    await analise.getByRole("button", { name: "Aplicar", exact: true }).click();
    await page.getByRole("button", { name: "Confirmar", exact: true }).click();
    await expect(analise.getByText("2 compra(s) gravada(s); 1 vínculo(s) criado(s)")).toBeVisible({ timeout: 30_000 });
    await expect(analise.getByRole("button", { name: "Aplicar", exact: true })).toBeDisabled();
    await analise.getByRole("button", { name: "Fechar" }).click();
    await esperarOverlayFechar(page);

    // 3) A consulta mostra o ULTIMO custo (6,50, de 3 dias atras), o menor e o maior.
    await page.getByRole("textbox", { name: "Buscar produto ou fornecedor" }).fill(sufixo);
    const linha = page.locator(".v-window-item--active tbody tr").filter({ hasText: produto });
    await expect(linha).toContainText(fornecedor, { timeout: 20_000 });
    await expect(linha).toContainText("R$ 6,50");
    await expect(linha).toContainText("R$ 5,00");
    await expect(linha.locator("td").nth(6)).toHaveText("2");

    // 4) O vinculo nasceu aprovado, na aba do catalogo.
    await page.getByRole("tab", { name: "Catálogo fornecedor–produto" }).click();
    // Escopo na aba ATIVA: o v-window mantem no DOM a aba de historico ja visitada.
    const vinculo = page.locator(".v-window-item--active tbody tr").filter({ hasText: produto });
    await expect(vinculo).toContainText(fornecedor);
    await expect(vinculo).toContainText(/aprovado/iu);

    // 5) Responsivo, com a aba e depois com o dialogo da importacao abertos.
    await page.getByRole("tab", { name: "Histórico de compras" }).click();
    for (const { nome, largura, altura } of LARGURAS) {
      await page.setViewportSize({ width: largura, height: altura });
      await semRolagemHorizontal(page);
      await page
        .locator(".v-window-item--active tbody tr")
        .filter({ hasText: `historico-${sufixo}.csv` })
        .getByRole("button", { name: "Abrir" })
        .click();
      await expect(dialogoAberto(page).getByText("Importação de histórico"), nome).toBeVisible();
      await semRolagemHorizontal(page);
      await dialogoAberto(page).getByRole("button", { name: "Fechar" }).click();
      await esperarOverlayFechar(page);
    }

    expect(problemas, problemas.join("\n")).toEqual([]);
  });
});
