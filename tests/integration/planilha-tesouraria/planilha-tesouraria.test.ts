import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import {
  abrirCaixaDoOperador,
  encerrarCaixaSeedAdminParaTeste,
  prepararPayloadFechamentoValido
} from "../../setup/caixa.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql } from "../../setup/integracao.js";
import type { PerfilUsuario } from "@padaria/shared";
import type { SheetsGateway } from "../../../api/src/google/google-sheets-gateway.js";
import { enviarParaPlanilha } from "../../../api/src/planilha-tesouraria/planilha-tesouraria.service.js";

// Ultima etapa da Tesouraria (Marco, 12/11/2026): previa e envio para a planilha. So quem confere o fechamento, so
// depois de fechar, e o PDV das linhas e sempre o do caixa. A gravacao em si e coberta no teste unitario com uma
// planilha em memoria (sob teste o cliente real do Google e travado).
describe("planilha da Tesouraria", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieCaixa: string;
  let caixaId: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    await encerrarCaixaSeedAdminParaTeste();
    [cookieAdmin, cookieCaixa] = await Promise.all([
      cookieSessao(contexto.app, "admin"),
      cookieSessao(contexto.app, "caixa")
    ]);
    const caixa = await abrirCaixaDoOperador(contexto.app, {
      cookieAdmin,
      cookieOperador: cookieCaixa,
      emailOperador: usuariosTeste.caixa.email,
      nome: "Planilha Tesouraria",
      registrarLimpeza: false
    });
    caixaId = caixa.caixaId;
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  const chamar = (rota: "previa" | "enviar", cookie: string, payload: object = {}) =>
    contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${caixaId}/planilha-tesouraria/${rota}`,
      headers: { cookie },
      payload
    });

  it("quem nao confere o fechamento nao le nem envia", async () => {
    expect((await chamar("previa", cookieCaixa)).statusCode).toBe(403);
    expect((await chamar("enviar", cookieCaixa, { cartao: null, relatorioPdv: null })).statusCode).toBe(403);
  });

  it("caixa ainda aberto: o relatorio so vai para a planilha depois do fechamento", async () => {
    const resposta = await chamar("previa", cookieAdmin);
    expect(resposta.statusCode).toBe(409);
    expect(resposta.body).toContain("PLANILHA_CAIXA_ABERTO");
  });

  it("linha com dados invalidos e recusada antes de tocar na planilha", async () => {
    const resposta = await chamar("enviar", cookieAdmin, {
      cartao: [
        {
          data: "10-11-2026",
          numeroSerie: "J9BB07936155",
          pdv: "VND CAIXA PDV - 9M",
          modalidade: "CRÉDITO",
          bandeira: "ELO",
          transacoes: 6,
          valor: 96.22
        }
      ],
      relatorioPdv: null
    });
    expect(resposta.statusCode).toBe(400);
  });

  // Mesma planilha, uma aba por empresa (sigla no cadastro). Sem sigla nao envia; com sigla grava na aba da empresa,
  // registra quem enviou e bloqueia o segundo envio do mesmo caixa e aba (sem precisar ler a planilha).
  it("sigla da empresa decide a aba; o envio fica registrado e nao se repete", async () => {
    const payloadFechar = await prepararPayloadFechamentoValido(contexto.app, { cookieOperador: cookieCaixa, caixaId });
    const fechou = await contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${caixaId}/fechar`,
      headers: { cookie: cookieCaixa },
      payload: payloadFechar
    });
    expect(fechou.statusCode, fechou.body).toBe(204);
    const caixa = await consultarUm<{ pdv_id: string; turno_caixa: string | null }>(
      "select pdv_id, turno_caixa from fechamentos_caixa where id = $1",
      [caixaId]
    );
    await executarSql("update pdvs set nome = 'PDV 7' where id = $1", [caixa!.pdv_id]);
    await executarSql("update fechamentos_caixa set turno_caixa = 'manha' where id = $1", [caixaId]);
    const pdv = "VND CAIXA PDV - 7M";
    const linha = {
      data: "10/11/2026",
      pdv,
      operador: "MARIA",
      credito: 1,
      debito: 2,
      voucher: 0,
      pix: 3,
      dinheiro: 4,
      clientes: 0
    };

    await executarSql("update empresas set sigla_planilha = null where id = $1", [idsTeste.empresaA]);
    const semSigla = await chamar("enviar", cookieAdmin, { cartao: null, relatorioPdv: linha });
    expect(semSigla.statusCode).toBe(400);
    expect(semSigla.body).toContain("PLANILHA_SEM_SIGLA");

    await executarSql("update empresas set sigla_planilha = 'TNP' where id = $1", [idsTeste.empresaA]);
    const escritas: string[] = [];
    const dados: string[][] = [];
    const gateway: SheetsGateway = {
      getSheets: async () => [],
      batchUpdate: async () => undefined,
      batchGetValues: async (_id, ranges) =>
        ranges.map((range) => (range.endsWith("F2:N") ? dados : dados.slice(Number(range.match(/F(\d+):/u)![1]) - 2))),
      batchUpdateValues: async (_id, data) => {
        for (const { range, values } of data) {
          escritas.push(range);
          dados.push(...values.map((celulas) => celulas.map(String)));
        }
      }
    };
    const usuario = await consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [
      usuariosTeste.admin.email
    ]);
    const perfil = {
      usuarioId: usuario!.id,
      role: "usuario_admin",
      permissoes: ["fechamentos_caixa_conferir"],
      empresaId: idsTeste.empresaA,
      empresaIds: [idsTeste.empresaA]
    } as unknown as PerfilUsuario;
    const anterior = process.env["PLANILHA_TESOURARIA_ID"];
    const { env } = await import("../../../api/src/env.js");
    (env as { PLANILHA_TESOURARIA_ID?: string | undefined }).PLANILHA_TESOURARIA_ID = "planilha-de-teste";
    try {
      const primeiro = await enviarParaPlanilha(caixaId, { cartao: null, relatorioPdv: linha }, perfil, gateway);
      expect(primeiro.relatorioPdv).toMatchObject({ gravado: true, linhaInicial: 2 });
      expect(escritas).toEqual(["'API - LANÇAMENTOS_RELATÓRIO_PDV_TNP_DADOS'!F2:N2"]);
      const registro = await consultarUm<{ aba: string; linha_inicial: number; enviado_por: string }>(
        "select aba, linha_inicial, enviado_por from planilha_tesouraria_envios where fechamento_caixa_id = $1",
        [caixaId]
      );
      expect(registro).toMatchObject({
        aba: "API - LANÇAMENTOS_RELATÓRIO_PDV_TNP_DADOS",
        linha_inicial: 2,
        enviado_por: usuario!.id
      });

      const segundo = await enviarParaPlanilha(caixaId, { cartao: null, relatorioPdv: linha }, perfil, gateway);
      expect(segundo.relatorioPdv?.gravado).toBe(false);
      expect(segundo.relatorioPdv?.mensagem).toMatch(/JÁ ENVIADO EM/u);
      expect(escritas).toHaveLength(1);

      const outroPdv = enviarParaPlanilha(
        caixaId,
        { cartao: null, relatorioPdv: { ...linha, pdv: "VND CAIXA PDV - 1M" } },
        perfil,
        gateway
      );
      await expect(outroPdv).rejects.toThrow(/PDV das linhas/u);
    } finally {
      (env as { PLANILHA_TESOURARIA_ID?: string | undefined }).PLANILHA_TESOURARIA_ID = anterior;
      await executarSql("update empresas set sigla_planilha = null where id = $1", [idsTeste.empresaA]);
    }
  });
});
