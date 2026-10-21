import { expect, test } from "@playwright/test";
import { entrar, observarConsole, USUARIOS } from "./apoio.js";
import { acharLinhaPaginando, irParaTela } from "./apoio-compras.js";

test.setTimeout(120_000);

test("Compras cria e edita fornecedor com WhatsApp persistido", async ({ page }) => {
  const problemas = observarConsole(page);
  const sufixo = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const nome = `E2E Fornecedor ${sufixo}`;
  const nomeEditado = `${nome} Editado`;

  await entrar(page, USUARIOS.compras);
  await irParaTela(page, "/fornecedores", "Fornecedores");

  await page.getByRole("button", { name: "Novo cadastro" }).click();
  let dialogo = page.locator(".v-dialog.v-overlay--active");
  await dialogo.getByLabel("Nome", { exact: true }).fill(nome);
  await dialogo.getByLabel("WhatsApp", { exact: true }).fill("11987654321");
  await dialogo.getByRole("button", { name: "Salvar", exact: true }).click();

  let linha = page.locator("tbody tr").filter({ hasText: nome });
  await expect(linha).toBeVisible();
  await expect(linha).toContainText("(11) 98765-4321");

  await page.reload();
  linha = await acharLinhaPaginando(page, nome);
  await linha.getByRole("button", { name: "Editar" }).click();
  dialogo = page.locator(".v-dialog.v-overlay--active");
  await expect(dialogo.getByLabel("Nome", { exact: true })).toHaveValue(nome);
  await expect(dialogo.getByLabel("WhatsApp", { exact: true })).toHaveValue("(11) 98765-4321");
  await dialogo.getByLabel("Nome", { exact: true }).fill(nomeEditado);
  await dialogo.getByRole("button", { name: "Salvar", exact: true }).click();

  await page.reload();
  await expect(await acharLinhaPaginando(page, nomeEditado)).toContainText("(11) 98765-4321", {
    timeout: 60_000
  });
  expect(problemas).toEqual([]);
});
