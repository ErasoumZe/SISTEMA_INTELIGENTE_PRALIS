import { expect, test } from "@playwright/test";
import { entrar, LARGURAS, observarConsole, semRolagemHorizontal, USUARIOS } from "./apoio.js";

test.describe("Relatório de fechamento da Tesouraria", () => {
  test("bloqueia o operador e mantém o dossiê fechado por X sem rolagem horizontal", async ({ page }, testInfo) => {
    const avisos = observarConsole(page);

    await entrar(page, USUARIOS.semProdutos);
    await page.goto("/relatorio_fechamento");
    await expect(page.getByRole("alert")).toContainText("Sem permissão para acessar esta página.");

    await page.context().clearCookies();
    await entrar(page, USUARIOS.admin);
    await page.goto("/relatorio_fechamento");
    await expect(page.getByRole("heading", { name: "Relatório de fechamento", exact: true }).first()).toBeVisible();

    const conferir = page.getByRole("button", { name: "Conferir caixa" }).first();
    await expect(conferir).toBeVisible();
    await conferir.click();
    await expect(page.getByText("Conferência final do caixa")).toBeVisible();

    await page.getByRole("button", { name: "Exportar para planilha" }).click();
    await expect(page.getByText("Nenhum arquivo foi gerado e nenhum dado foi alterado.")).toBeVisible();
    await page.getByRole("button", { name: "Entendi" }).click();

    await page.getByRole("button", { name: "Alteração de status" }).click();
    await expect(page.getByText("Quebra de caixa", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Entendi" }).click();

    for (const largura of LARGURAS) {
      await page.setViewportSize({ width: largura.largura, height: largura.altura });
      await expect(page.getByText("Conferência final do caixa")).toBeVisible();
      await semRolagemHorizontal(page);
    }

    await page.setViewportSize({ width: 360, height: 800 });
    await page.getByText("Conferências físicas e quebras", { exact: true }).click();
    await expect(page.locator(".v-table").first()).toBeVisible();
    await semRolagemHorizontal(page);
    await page.screenshot({ path: testInfo.outputPath("relatorio-fechamento-360.png"), fullPage: false });

    await page.getByRole("button", { name: "Fechar folha digital" }).click();
    await expect(page.getByText("Conferência final do caixa")).toBeHidden();
    expect(avisos).toEqual([]);
  });
});
