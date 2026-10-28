import { expect, test } from "@playwright/test";
import { entrar, LARGURAS, observarConsole, semRolagemHorizontal, USUARIOS } from "./apoio.js";

/**
 * Tela do de-para do SIA (R-222, igual a `produtos/depara-sia` do app oficial): conferir NAO grava; o
 * botao de substituir so libera sem problema e com a frase digitada.
 */
const csv = [
  "CODITEM;COD_BARRAS;NOME;ATIVO;ALIQ_ECF;CST;CSOSN;NCM;REDUCAO;ALIQ_INTERNA;GRUPO;PESAVEL;TECLA;VALIDADE",
  "10000;7891000249239;ABACAXI UNID;A;3;040;102;08043000;0;18;0005;N;;",
  "710000;7891000249253;ABACAXI UNID DELIVERY;A;3;040;102;08043000;0;18;0005;N;;"
].join("\n");

test.beforeEach(async ({ page }) => {
  await entrar(page, USUARIOS.admin);
});

test("conferir mostra o resumo sem gravar e a substituicao exige a frase", async ({ page }) => {
  const problemas = observarConsole(page);
  await page.goto("/produtos/depara-sia");
  await expect(page.getByRole("heading", { name: "De-para do SIA" })).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({
    name: "exportacao.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8")
  });
  await page.getByRole("button", { name: "Conferir" }).click();

  await expect(page.getByText("1 de entrega fora")).toBeVisible();
  const substituir = page.getByRole("button", { name: /Substituir o de-para de/u });
  await expect(substituir).toBeDisabled();
  await page.getByLabel(/Digite: SUBSTITUIR O DE-PARA DESTA LOJA/u).fill("substituir o de-para desta loja");
  await expect(substituir).toBeEnabled();
  expect(problemas).toEqual([]);
});

for (const { nome, largura, altura } of LARGURAS) {
  test(`de-para do SIA sem rolagem horizontal em ${largura}px (${nome})`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: altura });
    await page.goto("/produtos/depara-sia");
    await expect(page.getByRole("heading", { name: "De-para do SIA" })).toBeVisible();
    await semRolagemHorizontal(page);
  });
}
