import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { abrirCaixaDoOperador, encerrarCaixaSeedAdminParaTeste, prepararFechamentoValido } from "../../setup/caixa.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { json } from "../../setup/integracao.js";

type Contagem = { total: number; esperado: number | null; diferenca: number };
type RelatorioVendas = {
  dados: { vendas: Record<string, unknown>; creare: Record<string, unknown> | null; contagemFisica: Contagem };
};

// Fechamento cego (Marco, 11/11/2026): so quem confere o fechamento (Tesouraria; aqui o administrador) recebe o valor
// das vendas, o esperado da gaveta e a comparacao com a folha. O caixa ve quantas vendas houve e, no fim, so a FALTA:
// sobra chega como "tudo certo" (diferenca 0) e nao exige observacao; falta exige.
describe("caixa - fechamento cego", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieCaixa: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    await encerrarCaixaSeedAdminParaTeste();
    [cookieAdmin, cookieCaixa] = await Promise.all([
      cookieSessao(contexto.app, "admin"),
      cookieSessao(contexto.app, "caixa")
    ]);
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  async function relatorio(caixaId: string, cookie: string) {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/${caixaId}/relatorio-vendas`,
      headers: { cookie }
    });
    expect(resposta.statusCode, resposta.body).toBe(200);
    return json<{ data: RelatorioVendas }>(resposta).data.dados;
  }

  function fechar(caixa: { caixaId: string; lacreFechamento: string }, observacao?: string) {
    return contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${caixa.caixaId}/fechar`,
      headers: { cookie: cookieCaixa },
      payload: {
        lacreFechamento: caixa.lacreFechamento,
        caixaResponsavelNome: usuariosTeste.caixa.nome,
        supervisorResponsavelNome: "Supervisor de teste",
        ...(observacao ? { observacao } : {})
      }
    });
  }

  it("sobra: o caixa nao ve valores nem a sobra, fecha sem observacao; a Tesouraria ve tudo", async () => {
    const caixa = await abrirCaixaDoOperador(contexto.app, {
      cookieAdmin,
      cookieOperador: cookieCaixa,
      emailOperador: usuariosTeste.caixa.email,
      nome: "Fechamento cego sobra",
      valorAbertura: 100,
      registrarLimpeza: false
    });

    const status = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/status?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieCaixa }
    });
    expect(status.statusCode, status.body).toBe(200);
    expect(json<{ data: { resumo: Record<string, unknown> } }>(status).data.resumo["totalEntradas"]).toBeNull();

    const { esperado } = await prepararFechamentoValido(contexto.app, {
      cookieOperador: cookieCaixa,
      caixaId: caixa.caixaId,
      contagem: { valorEspecie: 110 }
    });
    expect(esperado).toBe(100);

    const doCaixa = await relatorio(caixa.caixaId, cookieCaixa);
    expect(doCaixa.contagemFisica).toMatchObject({ total: 110, esperado: null, diferenca: 0 });
    expect(Object.keys(doCaixa.vendas)).toEqual(["quantidade"]);
    expect(doCaixa.creare).not.toHaveProperty("comparacao");
    expect(doCaixa.creare).not.toHaveProperty("pralis");

    const daConferencia = await relatorio(caixa.caixaId, cookieAdmin);
    expect(daConferencia.contagemFisica).toMatchObject({ total: 110, esperado: 100, diferenca: 10 });
    expect(daConferencia.vendas).toHaveProperty("totalGeral");
    expect(daConferencia.creare).toHaveProperty("comparacao");

    const fechou = await fechar(caixa);
    expect(fechou.statusCode, fechou.body).toBe(204);
  });

  it("falta: o caixa ve so a falta e precisa explicar na observacao", async () => {
    const caixa = await abrirCaixaDoOperador(contexto.app, {
      cookieAdmin,
      cookieOperador: cookieCaixa,
      emailOperador: usuariosTeste.caixa.email,
      nome: "Fechamento cego falta",
      valorAbertura: 100,
      registrarLimpeza: false
    });
    await prepararFechamentoValido(contexto.app, {
      cookieOperador: cookieCaixa,
      caixaId: caixa.caixaId,
      contagem: { valorEspecie: 90, valorMoedas: 5 }
    });

    const doCaixa = await relatorio(caixa.caixaId, cookieCaixa);
    expect(doCaixa.contagemFisica).toMatchObject({ total: 95, esperado: null, diferenca: -5 });

    const semObservacao = await fechar(caixa);
    expect(semObservacao.statusCode).toBeGreaterThanOrEqual(400);
    expect(semObservacao.body).toMatch(/Observacao obrigatoria quando faltar dinheiro/);

    const comObservacao = await fechar(caixa, "Troco errado para um cliente");
    expect(comObservacao.statusCode, comObservacao.body).toBe(204);
  });
});
