import { randomUUID } from "node:crypto";
import { expect, request, test, type APIRequestContext } from "@playwright/test";
import { entrar, LARGURAS, PREFIXO, semRolagemHorizontal, USUARIOS } from "./apoio.js";

/**
 * G1/R-171 (#101) — o navegador precisa MOSTRAR a trava, nao so a API recusar.
 *
 * A integracao ja prova que `POST /fechar` devolve 400 com entrega aguardando conferencia. O que ela
 * nao prova: que o operador ve o motivo ANTES de clicar, que o botao para, e que o bloco novo nao
 * quebra o layout nas quatro larguras do Definition of Done.
 *
 * Roda contra a stack de DESENVOLVIMENTO ja de pe (`npm run dev`), como os E2E de Produtos. Cria os
 * proprios dados com o prefixo `E2E-AUTO` — inclusive a conta e o PDV, para nunca disputar um PDV
 * ocupado por outro caixa aberto.
 */
const API = process.env["E2E_API_URL"] ?? "http://localhost:4100";
const MARCA = `${PREFIXO}-101-${Date.now().toString(36)}`;

// O atributo desta base e `data-teste`, nao `data-testid`: `getByTestId` nao acharia nada.
const porTeste = (nome: string) => `[data-teste="${nome}"]`;

type Sessao = { usuarioId: string; empresaId: string };

async function entrarNaApi(usuario: { email: string; senha: string }): Promise<APIRequestContext> {
  const contexto = await request.newContext({ baseURL: API });
  const resposta = await contexto.post("/api/auth/sign-in/email", {
    data: { email: usuario.email, password: usuario.senha }
  });
  expect(resposta.status(), await resposta.text()).toBe(200);
  return contexto;
}

// O perfil expoe a empresa ATIVA em `empresaId` e o conjunto acessivel em `empresaIds` — nao existe
// `empresas` com objetos. Ler o campo errado devolvia `undefined` e o `beforeAll` inteiro morria em
// "Cannot read properties of undefined", antes de qualquer asserção sobre a tela. Mesma leitura de
// `produtos-permissoes.spec.ts`.
async function sessao(contexto: APIRequestContext): Promise<Sessao> {
  const resposta = await contexto.get("/api/sessao");
  expect(resposta.status(), await resposta.text()).toBe(200);
  const corpo = (await resposta.json()) as {
    data: { perfil: { usuarioId: string; empresaId?: string; empresaIds?: string[] } };
  };
  const empresaId = corpo.data.perfil.empresaId ?? corpo.data.perfil.empresaIds?.[0];
  if (!empresaId) throw new Error("Perfil sem empresa — o seed de desenvolvimento nao esta pronto");
  return { usuarioId: corpo.data.perfil.usuarioId, empresaId };
}

async function criar(contexto: APIRequestContext, url: string, data: object): Promise<string> {
  const resposta = await contexto.post(url, { data });
  expect(resposta.status(), `${url} -> ${await resposta.text()}`).toBe(201);
  return ((await resposta.json()) as { data: { id: string } }).data.id;
}

test.describe("Caixa - fechamento travado por entrega aguardando conferencia", () => {
  let admin: APIRequestContext;
  let caixa: APIRequestContext;

  test.beforeAll(async () => {
    admin = await entrarNaApi(USUARIOS.admin);
    caixa = await entrarNaApi(USUARIOS.semProdutos);

    const { empresaId } = await sessao(admin);
    const eu = await sessao(caixa);

    const contaId = await criar(admin, "/api/contas", { empresaId, nome: `${MARCA} conta` });
    const pdvId = await criar(admin, "/api/pdvs", { empresaId, nome: `${MARCA} PDV`, contaId, ativo: true });

    const hoje = new Date().toISOString().slice(0, 10);
    const caixaId = await criar(caixa, "/api/caixa/abrir", {
      empresaId,
      pdvId,
      usuarioCaixaId: eu.usuarioId,
      dataHoraAbertura: `${hoje}T06:00`
    });

    // Dinheiro de verdade no caixa, lancado pelo proprio operador (o servidor resolve conta e PDV
    // pelo caixa aberto dele).
    await criar(caixa, "/api/vendas", {
      empresaId,
      dataReferencia: hoje,
      descricao: `${MARCA} venda`,
      valorOriginal: 300
    });

    // A entrega que trava: sai do caixa e fica `pendente` ate o cofre conferir.
    const entrega = await caixa.post(`/api/caixa/${caixaId}/transferencia-cofre`, {
      data: { tipo: "sangria", valor: 100, lacre: `${MARCA}-LACRE`, idempotenciaChave: randomUUID() }
    });
    expect(entrega.status(), await entrega.text()).toBe(200);
  });

  test.afterAll(async () => {
    await admin?.dispose();
    await caixa?.dispose();
  });

  test("o operador ve o motivo antes de clicar, e o botao de fechar para", async ({ page }) => {
    await entrar(page, USUARIOS.semProdutos);
    await page.goto("/caixa");

    const bloco = page.locator(porTeste("entregas-aguardando-conferencia"));
    await expect(bloco).toBeVisible();
    await expect(bloco).toContainText(`${MARCA}-LACRE`);
    await expect(bloco).toContainText("Sangria");

    // O motivo fica escrito, e nao escondido em tooltip: quem le a tela sabe o que resolver.
    await expect(page.locator(porTeste("motivo-fechamento-travado"))).toContainText("conferência no cofre");

    // Travado, mas FOCAVEL: `aria-disabled`, nunca `disabled` — botao morto sai da navegacao por
    // teclado e o leitor de tela nunca chega ao motivo.
    //
    // A prova e o atributo `disabled` AUSENTE mais o foco, e nao `toBeEnabled()`: o Playwright
    // passou a tratar `aria-disabled="true"` como desabilitado, entao aquela asserção reprovaria
    // justamente o markup correto que esta decisao exige.
    const fechar = page.locator(porTeste("botao-fechar"));
    await expect(fechar).toHaveAttribute("aria-disabled", "true");
    expect(await fechar.getAttribute("disabled")).toBeNull();
    await fechar.focus();
    await expect(fechar).toBeFocused();
  });

  test("o bloco nao cria rolagem horizontal em nenhuma das quatro larguras", async ({ page }) => {
    await entrar(page, USUARIOS.semProdutos);
    await page.goto("/caixa");
    await expect(page.locator(porTeste("entregas-aguardando-conferencia"))).toBeVisible();

    for (const largura of LARGURAS) {
      await page.setViewportSize({ width: largura.largura, height: largura.altura });
      await expect(page.locator(porTeste("entregas-aguardando-conferencia"))).toBeVisible();
      await semRolagemHorizontal(page);
    }
  });
});
