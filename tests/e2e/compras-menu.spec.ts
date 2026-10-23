import { expect, test, type Page } from "@playwright/test";
import { entrar, USUARIOS } from "./apoio.js";

const ROTAS_COMPRAS = [
  "/estoque_produtos",
  "/conferencias_estoque",
  "/agendamento_pedidos",
  "/solicitacao_compra",
  "/pedidos",
  "/pedidos_finalizados",
  "/cadastro_compras",
  "/fornecedores"
] as const;

async function provarMenuCompras(page: Page) {
  const grupo = page.locator(".sidebar-group", {
    has: page.locator(".sidebar-group-label", { hasText: "Compras" })
  });
  await expect(grupo).toHaveCount(1);

  const botaoGrupo = grupo.locator(".sidebar-group-label");
  if ((await botaoGrupo.getAttribute("aria-expanded")) !== "true") await botaoGrupo.click();

  const links = grupo.locator("a.sidebar-item");
  await expect(links).toHaveCount(ROTAS_COMPRAS.length);
  for (const rota of ROTAS_COMPRAS) await expect(grupo.locator(`a.sidebar-item[href="${rota}"]`)).toHaveCount(1);
  await expect(grupo.getByText("Mercadorias", { exact: true })).toHaveCount(0);
  await expect(grupo.getByText("Produtos", { exact: true })).toHaveCount(0);

  const saidas = page.locator(".sidebar-group", {
    has: page.locator(".sidebar-group-label", { hasText: "Saidas" })
  });
  await expect(saidas).toHaveCount(1);
  const botaoSaidas = saidas.locator(".sidebar-group-label");
  if ((await botaoSaidas.getAttribute("aria-expanded")) !== "true") await botaoSaidas.click();
  const lancamentos = saidas.getByRole("button", { name: "Lançamentos" });
  if ((await lancamentos.getAttribute("aria-expanded")) !== "true") await lancamentos.click();
  await expect(saidas.getByText("Mercadorias", { exact: true })).toHaveCount(1);
}

for (const [perfil, usuario] of [
  ["Diretor", USUARIOS.admin],
  ["Compras", USUARIOS.compras]
] as const) {
  test(`menu Compras tem um unico caminho correto para ${perfil}`, async ({ page }) => {
    await entrar(page, usuario);
    await provarMenuCompras(page);
  });
}
