import { randomUUID } from "node:crypto";
import { expect, request, test, type APIRequestContext } from "@playwright/test";
import { entrar, LARGURAS, PREFIXO, semRolagemHorizontal, USUARIOS } from "./apoio.js";

/**
 * R-179 · Fatia 3 (#101) — o caminho antigo sumiu DA TELA, e o que ficou continua legivel nas
 * quatro larguras do Definition of Done.
 *
 * A integracao prova que as rotas respondem 404. O que ela nao prova: que o painel "Programar
 * entrega ao cofre" nao aparece mais em `/transferencias`, que o bloco "Entregas solicitadas pela
 * Tesouraria" nao aparece mais em `/caixa`, e que a remocao dos dois nao deixou buraco de layout
 * em 1440 / 1024 / 768 / 390.
 *
 * Roda contra a stack de DESENVOLVIMENTO ja de pe (`npm run dev`), como os demais E2E. Cria os
 * proprios dados com o prefixo `E2E-AUTO` — inclusive conta e PDV, para nunca disputar um PDV
 * ocupado por outro caixa aberto.
 */
const API = process.env["E2E_API_URL"] ?? "http://localhost:4100";
const MARCA = `${PREFIXO}-F3-${Date.now().toString(36)}`;

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

test.describe("Caixa - o caminho 'Programar entrega ao cofre' sumiu da tela", () => {
  let admin: APIRequestContext;
  let caixa: APIRequestContext;
  let empresaId = "";
  let caixaId = "";

  test.beforeAll(async () => {
    admin = await entrarNaApi(USUARIOS.admin);
    caixa = await entrarNaApi(USUARIOS.semProdutos);

    ({ empresaId } = await sessao(admin));
    const eu = await sessao(caixa);

    const contaId = await criar(admin, "/api/contas", { empresaId, nome: `${MARCA} conta` });
    const pdvId = await criar(admin, "/api/pdvs", { empresaId, nome: `${MARCA} PDV`, contaId, ativo: true });

    const hoje = new Date().toISOString().slice(0, 10);
    caixaId = await criar(caixa, "/api/caixa/abrir", {
      empresaId,
      pdvId,
      usuarioCaixaId: eu.usuarioId,
      dataHoraAbertura: `${hoje}T06:00`
    });

    // Dinheiro de verdade: sem saldo a tela do Caixa nao mostra os campos de entrega.
    await criar(caixa, "/api/vendas", {
      empresaId,
      dataReferencia: hoje,
      descricao: `${MARCA} venda`,
      valorOriginal: 300
    });
  });

  test.afterAll(async () => {
    await admin?.dispose();
    await caixa?.dispose();
  });

  // O painel vivia acima do cockpit de Tesouraria, e so para quem e retaguarda — por isso o ator
  // aqui e o ADMIN: se ele nao ve, ninguem ve.
  test("Transferencias nao oferece mais o painel de programar entrega", async ({ page }) => {
    await entrar(page, USUARIOS.admin);
    await page.goto("/transferencias");

    // ANCORA POSITIVA PRIMEIRO. As assercoes abaixo sao todas negativas, e `toHaveCount(0)` resolve
    // no primeiro tick — numa tela em branco (erro de hidratacao, 500 na API, redirect) as quatro
    // passariam, e `semRolagemHorizontal` tambem, porque pagina vazia nunca rola. O cockpit e o
    // conteudo que FICA nesta tela: se ele nao aparecer, o caso reprova antes de afirmar ausencia.
    await expect(page.getByRole("table", { name: "Transferências do período" })).toBeVisible();

    await expect(page.getByText("Programar entrega ao cofre")).toHaveCount(0);
    await expect(page.locator(porTeste("solicitacao-programar"))).toHaveCount(0);
    await expect(page.locator(porTeste("solicitacao-caixa"))).toHaveCount(0);
    await expect(page.locator(porTeste("solicitacao-agendada"))).toHaveCount(0);

    for (const largura of LARGURAS) {
      await page.setViewportSize({ width: largura.largura, height: largura.altura });
      await semRolagemHorizontal(page);
    }
  });

  // Do lado do operador, o que sumiu foi o botao de EXECUTAR a ordem — o segundo caminho para o
  // mesmo ato do botao de entregar ao cofre, que continua.
  test("Caixa nao oferece mais a execucao de ordem, e a entrega continua", async ({ page }) => {
    await entrar(page, USUARIOS.semProdutos);
    await page.goto("/caixa");

    await expect(page.locator(porTeste("valor-entrega"))).toBeVisible();
    await expect(page.locator(porTeste("solicitacao-cofre"))).toHaveCount(0);
    await expect(page.locator(porTeste("botao-executar-solicitacao"))).toHaveCount(0);
    await expect(page.getByText("Entregas solicitadas pela Tesouraria")).toHaveCount(0);

    for (const largura of LARGURAS) {
      await page.setViewportSize({ width: largura.largura, height: largura.altura });
      await expect(page.locator(porTeste("valor-entrega"))).toBeVisible();
      await semRolagemHorizontal(page);
    }
  });

  // A trava do fechamento e a Fatia 1/2, e ela nao pode ter sido levada junto: entrega em transito
  // continua parando o botao, com o motivo escrito antes do clique.
  test("a trava por entrega aguardando conferencia sobreviveu a remocao", async ({ page }) => {
    const entrega = await caixa.post(`/api/caixa/${caixaId}/transferencia-cofre`, {
      data: { valor: 100, lacre: `${MARCA}-LACRE`, idempotenciaChave: randomUUID() }
    });
    expect(entrega.status(), await entrega.text()).toBe(200);

    await entrar(page, USUARIOS.semProdutos);
    await page.goto("/caixa");

    const bloco = page.locator(porTeste("entregas-aguardando-conferencia"));
    await expect(bloco).toBeVisible();
    await expect(bloco).toContainText(`${MARCA}-LACRE`);
    await expect(page.locator(porTeste("motivo-fechamento-travado"))).toContainText("conferência no cofre");

    // Travado, mas FOCAVEL: `aria-disabled`, nunca `disabled`. A prova e o atributo `disabled`
    // ausente mais o foco — `toBeEnabled()` nao serve: o Playwright conta `aria-disabled="true"`
    // como desabilitado e reprovaria o markup correto.
    const fechar = page.locator(porTeste("botao-fechar"));
    await expect(fechar).toHaveAttribute("aria-disabled", "true");
    expect(await fechar.getAttribute("disabled")).toBeNull();
    await fechar.focus();
    await expect(fechar).toBeFocused();

    for (const largura of LARGURAS) {
      await page.setViewportSize({ width: largura.largura, height: largura.altura });
      await expect(bloco).toBeVisible();
      await semRolagemHorizontal(page);
    }
  });
});
