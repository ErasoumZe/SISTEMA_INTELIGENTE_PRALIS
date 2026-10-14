import { expect, test } from "@playwright/test";
import { entrar, LARGURAS, observarConsole, semRolagemHorizontal, USUARIOS } from "./apoio.js";
import { dialogoAberto, irParaTela } from "./apoio-compras.js";

/**
 * Item 3 do Definition of Done para as telas de gerar pedido: 1440 / 1024 / 768 / 390 sem rolagem
 * horizontal. O compositor de pedido e o caso de risco — ele tem uma grade de duas colunas por
 * item (produto + quantidade) que, sem `min-width: 0`, estoura a largura no celular em silencio.
 */
test.describe("telas de pedido em todas as larguras", () => {
  test.setTimeout(240_000);

  test("Pedidos e o formulario nao rolam na horizontal", async ({ page }) => {
    const problemas = observarConsole(page);
    await entrar(page, USUARIOS.compras);

    for (const { nome, largura, altura } of LARGURAS) {
      await page.setViewportSize({ width: largura, height: altura });
      await irParaTela(page, "/pedidos", "Pedidos");
      await expect(page.getByRole("heading", { name: "Pedidos", exact: true }), nome).toBeVisible();
      await semRolagemHorizontal(page);

      // O formulario e o que mais aperta: cabecalho fixo, itens rolando e rodape fixo.
      await page.getByRole("button", { name: "Novo pedido manual" }).click();
      const formulario = dialogoAberto(page);
      await expect(formulario.getByText("Itens do pedido", { exact: false })).toBeVisible();
      await semRolagemHorizontal(page);
      await formulario.getByRole("button", { name: "Cancelar" }).click();
      await expect(formulario).toBeHidden();
    }

    expect(problemas, problemas.join("\n")).toEqual([]);
  });
});
