import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import {
  abrirCaixaDoOperador,
  encerrarCaixaSeedAdminParaTeste,
  multipartAnexoFechamento,
  prepararFechamentoValido
} from "../../setup/caixa.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarUm, json } from "../../setup/integracao.js";

// R-232 (Marco + tesoureiro, 29/10): contagem fisica cega. O operador nao ve o fisico esperado durante o turno; conta
// cedulas e moedas no primeiro passo de Vendas; a contagem fica no relatorio de vendas e trava (corrigir exige
// justificativa, com historico); o fechamento usa a contagem gravada.
describe("caixa - contagem física cega (R-232)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieCaixa: string;
  let caixa: { caixaId: string; lacreFechamento: string };

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    await encerrarCaixaSeedAdminParaTeste();
    [cookieAdmin, cookieCaixa] = await Promise.all([
      cookieSessao(contexto.app, "admin"),
      cookieSessao(contexto.app, "caixa")
    ]);
    caixa = await abrirCaixaDoOperador(contexto.app, {
      cookieAdmin,
      cookieOperador: cookieCaixa,
      emailOperador: usuariosTeste.caixa.email,
      nome: "Contagem cega",
      valorAbertura: 100,
      registrarLimpeza: false
    });
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("o operador de caixa não recebe o físico esperado durante o turno", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/status?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieCaixa }
    });
    expect(resposta.statusCode, resposta.body).toBe(200);
    const resumo = json<{ data: { resumo: Record<string, unknown> } }>(resposta).data.resumo;
    expect(resumo.saldo).toBeNull();
    expect(resumo).not.toHaveProperty("saldoProprio");
    expect(resumo).not.toHaveProperty("propostaRetorno");
    expect(resumo.totalEntradas).toEqual(expect.any(Number));
  });

  it("a contagem fica no relatório, trava e só muda com justificativa (com histórico); o fechamento usa ela", async () => {
    const { anexoCreareId, esperado } = await prepararFechamentoValido(contexto.app, {
      cookieOperador: cookieCaixa,
      caixaId: caixa.caixaId,
      contagem: { valorEspecie: 90, valorMoedas: 5 }
    });
    expect(esperado).toBe(100);

    async function gerar(valorEspecie: number, valorMoedas: number, justificativaContagem?: string) {
      return contexto.app.inject({
        method: "POST",
        url: `/api/caixa/${caixa.caixaId}/relatorio-vendas`,
        headers: { cookie: cookieCaixa },
        payload: {
          anexoId: anexoCreareId,
          leituraCreare: { documentoLegivel: true },
          contagemFisica: { valorEspecie, valorMoedas },
          ...(justificativaContagem ? { justificativaContagem } : {})
        }
      });
    }

    // Mesma contagem: gera de novo sem pedir nada.
    expect((await gerar(90, 5)).statusCode).toBe(200);
    // Contagem diferente sem justificativa: recusa.
    const semMotivo = await gerar(95, 5);
    expect(semMotivo.statusCode, semMotivo.body).toBe(422);
    expect(semMotivo.body).toMatch(/explique o motivo/);
    // Com justificativa: grava, mantendo o primeiro registro no historico.
    const corrigida = await gerar(95, 5, "Achei uma cédula de R$ 5 na gaveta");
    expect(corrigida.statusCode, corrigida.body).toBe(200);
    const contagem = json<{
      data: {
        dados: {
          contagemFisica: {
            total: number;
            esperado: number;
            diferenca: number;
            correcoes: Array<{ de: { valorEspecie: number }; para: { valorEspecie: number }; justificativa: string }>;
          };
        };
      };
    }>(corrigida).data.dados.contagemFisica;
    expect(contagem).toMatchObject({ total: 100, esperado: 100, diferenca: 0 });
    expect(contagem.correcoes).toEqual([
      expect.objectContaining({
        de: expect.objectContaining({ valorEspecie: 90 }),
        para: expect.objectContaining({ valorEspecie: 95 }),
        justificativa: "Achei uma cédula de R$ 5 na gaveta"
      })
    ]);

    // Trocar a folha do CREARE invalida o relatorio, mas a contagem continua gravada e travada: recontar "do zero"
    // depois de ver a comparacao exigiria justificativa.
    const { boundary, corpo } = multipartAnexoFechamento("relatorio_vendas_creare");
    const novaFolha = await contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${caixa.caixaId}/anexos`,
      headers: { cookie: cookieCaixa, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: corpo
    });
    expect(novaFolha.statusCode, novaFolha.body).toBe(201);
    const novaFolhaId = json<{ data: { id: string } }>(novaFolha).data.id;
    const invalidado = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/${caixa.caixaId}/relatorio-vendas`,
      headers: { cookie: cookieCaixa }
    });
    expect(
      json<{ data: { dados: { invalidado: boolean; contagemFisica: { total: number } } } }>(invalidado).data.dados
    ).toMatchObject({ invalidado: true, contagemFisica: { total: 100 } });
    const recontagemSemMotivo = await contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${caixa.caixaId}/relatorio-vendas`,
      headers: { cookie: cookieCaixa },
      payload: {
        anexoId: novaFolhaId,
        leituraCreare: { documentoLegivel: true },
        contagemFisica: { valorEspecie: 0, valorMoedas: 0 }
      }
    });
    expect(recontagemSemMotivo.statusCode, recontagemSemMotivo.body).toBe(422);
    const mesmaContagem = await contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${caixa.caixaId}/relatorio-vendas`,
      headers: { cookie: cookieCaixa },
      payload: {
        anexoId: novaFolhaId,
        leituraCreare: { documentoLegivel: true },
        contagemFisica: { valorEspecie: 95, valorMoedas: 5 }
      }
    });
    expect(mesmaContagem.statusCode, mesmaContagem.body).toBe(200);

    // O fechamento nao recebe contagem: usa a gravada (100 = esperado, sem quebra).
    const fechar = await contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${caixa.caixaId}/fechar`,
      headers: { cookie: cookieCaixa },
      payload: {
        lacreFechamento: caixa.lacreFechamento,
        caixaResponsavelNome: usuariosTeste.caixa.nome,
        supervisorResponsavelNome: "Supervisor de teste",
        observacao: "Fechamento com contagem cega"
      }
    });
    expect(fechar.statusCode, fechar.body).toBe(204);
    const fechado = await consultarUm<{ status: string; especie: string; moedas: string }>(
      `select status, valor_especie_fechamento as especie, valor_moedas_fechamento as moedas
         from fechamentos_caixa where id = $1`,
      [caixa.caixaId]
    );
    expect(fechado).toMatchObject({ status: "fechado", especie: "95.00", moedas: "5.00" });
  });
});
