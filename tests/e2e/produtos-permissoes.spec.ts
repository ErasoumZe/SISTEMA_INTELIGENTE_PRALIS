import { expect, test } from "@playwright/test";
import { entrar, USUARIOS } from "./apoio.js";

/**
 * Permissao de Produtos vista do NAVEGADOR.
 *
 * A decisao da P-04: a listagem completa devolve custo, margem e preco, entao exige
 * `cadastro_produtos_visualizar`. Quem so opera mercadorias continua escolhendo produto pela
 * projecao REDUZIDA (`/api/produtos/opcoes`), que nao carrega nada disso.
 */

test("quem nao tem cadastro_produtos_visualizar nao entra na tela", async ({ page }) => {
  await entrar(page, USUARIOS.semProdutos);
  await page.goto("/produtos");

  await expect(page.getByText("Sem permissão para acessar esta página.")).toBeVisible();
  await expect(page.locator(".produto-card")).toHaveCount(0);
});

test("a listagem completa responde 403 e a projecao reduzida responde 200", async ({ page }) => {
  await entrar(page, USUARIOS.semProdutos);

  // A empresa vem do PERFIL da sessao, nao de `/api/empresas`: este usuario tambem nao tem
  // `cadastro_empresas_visualizar`, entao aquele endpoint responderia 403 e mascararia o teste.
  const empresaId = await page.evaluate(async () => {
    const resposta = await fetch("http://localhost:4100/api/me", { credentials: "include" });
    const json = (await resposta.json()) as {
      data?: { perfil?: { empresaId?: string; empresaIds?: string[] } };
    };
    return json.data?.perfil?.empresaId ?? json.data?.perfil?.empresaIds?.[0] ?? "";
  });
  expect(empresaId, "nao consegui descobrir a empresa da sessao").not.toBe("");

  const listagem = await page.evaluate(
    async (id) =>
      (await fetch(`http://localhost:4100/api/produtos?empresaId=${id}`, { credentials: "include" })).status,
    empresaId
  );
  const opcoes = await page.evaluate(
    async (id) =>
      (await fetch(`http://localhost:4100/api/produtos/opcoes?empresaId=${id}`, { credentials: "include" })).status,
    empresaId
  );

  expect(listagem, "listagem completa deveria exigir cadastro_produtos_visualizar").toBe(403);
  expect(opcoes, "a projecao reduzida atende quem opera mercadorias").toBe(200);

  // E o que ela devolve nao pode conter comercial nem fiscal.
  const chaves = await page.evaluate(async (id) => {
    const resposta = await fetch(`http://localhost:4100/api/produtos/opcoes?empresaId=${id}`, {
      credentials: "include"
    });
    const json = (await resposta.json()) as { data: Array<Record<string, unknown>> };
    return json.data[0] ? Object.keys(json.data[0]).sort() : [];
  }, empresaId);

  if (chaves.length) {
    expect(chaves).toEqual(["codigoBarras", "codigoInterno", "descricao", "id", "marca", "status"]);
  }
});

test("sem sessao a tela de produtos manda para o login", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/produtos");
  await page.waitForURL("**/login", { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
});
