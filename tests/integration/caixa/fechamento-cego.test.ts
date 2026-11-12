import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { abrirCaixaDoOperador, encerrarCaixaSeedAdminParaTeste, prepararFechamentoValido } from "../../setup/caixa.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarUm, json } from "../../setup/integracao.js";

type Contagem = { total: number; esperado: number | null; diferenca: number | null };
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
    expect(doCaixa.contagemFisica).toMatchObject({ total: 110, esperado: null, diferenca: null });
    expect(Object.keys(doCaixa.vendas)).toEqual(["quantidade"]);
    expect(doCaixa.creare).not.toHaveProperty("comparacao");
    expect(doCaixa.creare).not.toHaveProperty("pralis");

    const daConferencia = await relatorio(caixa.caixaId, cookieAdmin);
    expect(daConferencia.contagemFisica).toMatchObject({ total: 110, esperado: 100, diferenca: 10 });
    expect(daConferencia.vendas).toHaveProperty("totalGeral");
    expect(daConferencia.creare).toHaveProperty("comparacao");

    // S1: com o caixa aberto, o detalhe nao manda as vendas (com valor) para o operador; a conferencia recebe.
    const categoriasDoDetalhe = async (cookie: string) => {
      const detalhe = await contexto.app.inject({
        method: "GET",
        url: `/api/caixa/${caixa.caixaId}/detalhe`,
        headers: { cookie }
      });
      expect(detalhe.statusCode, detalhe.body).toBe(200);
      return json<{ data: { lancamentos: Array<{ categoria: string }> } }>(detalhe).data.lancamentos.map(
        (categoria) => categoria.categoria
      );
    };
    expect(await categoriasDoDetalhe(cookieCaixa)).not.toContain("entradas");
    expect(await categoriasDoDetalhe(cookieAdmin)).toContain("entradas");

    const fechou = await fechar(caixa);
    expect(fechou.statusCode, fechou.body).toBe(204);
  });

  it("falta: so aparece DEPOIS de fechar; o caixa explica em seguida e a explicacao vai para a quebra", async () => {
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

    // S3: antes de fechar o caixa nao ve nem a falta (contar 0 e ver a falta revelaria o esperado).
    const doCaixa = await relatorio(caixa.caixaId, cookieCaixa);
    expect(doCaixa.contagemFisica).toMatchObject({ total: 95, esperado: null, diferenca: null });
    const resultadoAntes = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/${caixa.caixaId}/resultado-fechamento`,
      headers: { cookie: cookieCaixa }
    });
    expect(resultadoAntes.statusCode).toBeGreaterThanOrEqual(400);

    // Fecha sem observacao: ela ficou opcional, porque o caixa ainda nao sabe da falta.
    const fechou = await fechar(caixa);
    expect(fechou.statusCode, fechou.body).toBe(204);

    const resultado = async () => {
      const resposta = await contexto.app.inject({
        method: "GET",
        url: `/api/caixa/${caixa.caixaId}/resultado-fechamento`,
        headers: { cookie: cookieCaixa }
      });
      expect(resposta.statusCode, resposta.body).toBe(200);
      return json<{ data: { resultado: string; falta: number | null; explicacaoPendente: boolean } }>(resposta).data;
    };
    expect(await resultado()).toEqual({ resultado: "falta", falta: 5, explicacaoPendente: true });

    const explicar = (observacao: string) =>
      contexto.app.inject({
        method: "POST",
        url: `/api/caixa/${caixa.caixaId}/explicar-falta`,
        headers: { cookie: cookieCaixa },
        payload: { observacao }
      });
    // So o operador explica a propria falta: quem gerencia caixas (aqui o admin) nao escreve em nome dele.
    const peloAdmin = await contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${caixa.caixaId}/explicar-falta`,
      headers: { cookie: cookieAdmin },
      payload: { observacao: "Explicacao em nome do caixa" }
    });
    expect(peloAdmin.statusCode).toBe(403);
    const caixaQueNaoExiste = await contexto.app.inject({
      method: "GET",
      url: "/api/caixa/11111111-1111-4111-8111-999999999999/resultado-fechamento",
      headers: { cookie: cookieCaixa }
    });
    expect(caixaQueNaoExiste.statusCode).toBeGreaterThanOrEqual(400);

    const explicada = await explicar("Troco errado para um cliente");
    expect(explicada.statusCode, explicada.body).toBe(200);
    expect(await resultado()).toEqual({ resultado: "falta", falta: 5, explicacaoPendente: false });
    const quebra = await consultarUm<{ observacao: string }>(
      "select observacao from quebras_caixa where fechamento_caixa_id = $1 and transferencia_id is null",
      [caixa.caixaId]
    );
    expect(quebra?.observacao).toBe("Troco errado para um cliente");

    // Uma vez so: a segunda explicacao e recusada (a Tesouraria trata a partir dali).
    const deNovo = await explicar("Outra explicacao qualquer");
    expect(deNovo.statusCode).toBeGreaterThanOrEqual(400);
  });

  it("sobra ou acerto: depois de fechar o caixa ve so 'tudo certo'", async () => {
    const caixa = await abrirCaixaDoOperador(contexto.app, {
      cookieAdmin,
      cookieOperador: cookieCaixa,
      emailOperador: usuariosTeste.caixa.email,
      nome: "Fechamento cego tudo certo",
      valorAbertura: 100,
      registrarLimpeza: false
    });
    await prepararFechamentoValido(contexto.app, {
      cookieOperador: cookieCaixa,
      caixaId: caixa.caixaId,
      contagem: { valorEspecie: 120 }
    });
    const fechou = await fechar(caixa);
    expect(fechou.statusCode, fechou.body).toBe(204);
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/${caixa.caixaId}/resultado-fechamento`,
      headers: { cookie: cookieCaixa }
    });
    expect(resposta.statusCode, resposta.body).toBe(200);
    expect(json<{ data: unknown }>(resposta).data).toEqual({
      resultado: "tudo_certo",
      falta: null,
      explicacaoPendente: false
    });
  });
});
