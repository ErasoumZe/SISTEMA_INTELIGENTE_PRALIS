import { expect, test } from "@playwright/test";
import { entrar, semRolagemHorizontal, USUARIOS } from "./apoio.js";

const tamanhos = [
  { largura: 1440, altura: 900, estado: "recolher", icone: "mdi-chevron-left", mobile: false },
  { largura: 1024, altura: 768, estado: "expandir", icone: "mdi-chevron-right", mobile: false },
  { largura: 768, altura: 900, estado: "fechar", icone: "mdi-arrow-left", mobile: true },
  { largura: 390, altura: 844, estado: "fechar", icone: "mdi-arrow-left", mobile: true }
] as const;

test("sidebar mantem marca e um unico controle responsivo", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await entrar(page, USUARIOS.admin);

  for (const tamanho of tamanhos) {
    await page.setViewportSize({ width: tamanho.largura, height: tamanho.altura });

    if (tamanho.mobile) {
      await page.getByTitle("Abrir menu").click();
    }

    const topo = page.locator(".sidebar-logo-row");
    const controle = topo.locator("button");
    await expect(topo).toBeVisible();
    await expect(controle).toHaveCount(1);
    await expect(controle).toHaveAccessibleName(new RegExp(`${tamanho.estado} menu$`, "i"));
    await expect(controle.locator(`.sidebar-toggle-icon.mdi-${tamanho.icone.replace("mdi-", "")}`)).toBeVisible();
    await expect(
      controle.locator(tamanho.estado === "expandir" ? ".sidebar-logo-simbolo" : ".marca-cicluz")
    ).toBeVisible();

    const caixa = await controle.boundingBox();
    expect(caixa, `controle ausente em ${tamanho.largura}px`).not.toBeNull();
    expect(caixa!.x).toBeGreaterThanOrEqual(0);
    expect(caixa!.x + caixa!.width).toBeLessThanOrEqual(tamanho.largura);
    await semRolagemHorizontal(page);

    await controle.click();
    if (tamanho.mobile) {
      // O Vuetify mantem a gaveta fora da tela durante/depois da transicao; `toBeHidden()` olha a
      // arvore renderizada e pode considera-la visivel mesmo com o drawer inativo e deslocado.
      await expect(page.locator(".padaria-sidebar")).not.toHaveClass(/v-navigation-drawer--active/);
      await expect(page.getByTitle("Abrir menu")).toBeVisible();
    } else {
      const acaoSeguinte = tamanho.estado === "recolher" ? "expandir" : "recolher";
      await expect(controle).toHaveAccessibleName(new RegExp(`${acaoSeguinte} menu$`, "i"));
      await expect(topo.locator("button")).toHaveCount(1);
      await semRolagemHorizontal(page);
    }
  }
});
