import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { encerrarCaixaSeedAdminParaTeste, registrarEncerramentoCaixaParaTeste } from "../../setup/caixa.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarUm, json } from "../../setup/integracao.js";

// Fuso do DIA CONTABIL: um instante as 22:00 BRT ja e 01:00Z do dia SEGUINTE. O dia contabil
// gravado tem de ser o dia LOCAL (America/Sao_Paulo), nao o de UTC. Cobre data_movimento do caixa
// e a data do retorno/acerto ao cofre — as duas datas que o SERVIDOR ainda deriva.
// (Desde a R-040 a abertura nao cria transferencia: ela confirma uma ja criada pela tesouraria,
// com data_referencia informada por quem enviou. Nao ha mais data derivada nesse caminho.)
describe("caixa - dia contabil no fuso de Sao Paulo (nao UTC)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    await encerrarCaixaSeedAdminParaTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  async function usuarioAdminId() {
    const usuario = await consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [
      usuariosTeste.admin.email
    ]);
    if (!usuario) throw new Error("Usuario admin nao encontrado");
    return usuario.id;
  }

  function post(url: string, payload: object) {
    return contexto.app.inject({ method: "POST", url, headers: { cookie: cookieAdmin }, payload });
  }

  async function criar(url: string, payload: object) {
    const resposta = await post(url, payload);
    expect(resposta.statusCode, `${url} -> ${resposta.body}`).toBe(201);
    return resposta;
  }

  async function criarContaEPdv(nome: string) {
    const conta = await criar("/api/contas", { empresaId: idsTeste.empresaA, nome: `Conta ${nome}` });
    const contaId = json<{ data: { id: string } }>(conta).data.id;
    const pdv = await criar("/api/pdvs", { empresaId: idsTeste.empresaA, nome: `PDV ${nome}`, contaId, ativo: true });
    const pdvId = json<{ data: { id: string } }>(pdv).data.id;
    return { contaId, pdvId };
  }

  const INSTANTE_22H_BRT = "2026-07-17T01:00:00Z"; // 22:00 de 16/07 em Sao Paulo
  const DIA_LOCAL = "2026-07-16";

  it("Deve gravar data_movimento no dia LOCAL quando o caixa abre as 22:00 BRT (01:00Z)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(INSTANTE_22H_BRT));
    let caixaId: string;
    try {
      const { pdvId } = await criarContaEPdv("fuso-abertura");
      const abrir = await criar("/api/caixa/abrir", {
        empresaId: idsTeste.empresaA,
        pdvId,
        usuarioCaixaId: await usuarioAdminId()
      });
      caixaId = json<{ data: { id: string } }>(abrir).data.id;
      registrarEncerramentoCaixaParaTeste(caixaId);
    } finally {
      vi.useRealTimers();
    }

    const caixa = await consultarUm<{ data_movimento: string }>(
      "select to_char(data_movimento, 'YYYY-MM-DD') as data_movimento from fechamentos_caixa where id = $1",
      [caixaId]
    );
    expect(caixa?.data_movimento).toBe(DIA_LOCAL); // nao "2026-07-17" (UTC)
  });

  it("Deve usar o dia LOCAL de hoje (Sao Paulo) na data do acerto de saldo", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(INSTANTE_22H_BRT));
    let contaId: string;
    let pdvId: string;
    let caixaId: string;
    try {
      ({ contaId, pdvId } = await criarContaEPdv("fuso-acerto"));
      const abrir = await criar("/api/caixa/abrir", {
        empresaId: idsTeste.empresaA,
        pdvId,
        usuarioCaixaId: await usuarioAdminId()
      });
      caixaId = json<{ data: { id: string } }>(abrir).data.id;
      registrarEncerramentoCaixaParaTeste(caixaId);
    } finally {
      vi.useRealTimers();
    }

    // Venda em dinheiro -> saldo positivo, exige acerto.
    await criar("/api/vendas", {
      empresaId: idsTeste.empresaA,
      dataReferencia: "2026-07-16",
      dataPagamento: "2026-07-16",
      descricao: "Venda do dia",
      valorOriginal: 50,
      contaOrigemId: contaId,
      pdvId,
      colaboradorId: idsTeste.colaboradorAdmin,
      itensVenda: [
        { produtoId: idsTeste.produto, descricaoProduto: "Pao", quantidade: 1, valorUnitario: 50, valorTotal: 50 }
      ],
      tiposPagamento: [{ formaPagamentoId: idsTeste.formaPagamentoDinheiro, numeroVendas: 1, totalPago: 50 }]
    });
    const respostaRetorno = await post(`/api/caixa/${caixaId}/transferencia-cofre`, {
      valor: 50,
      observacao: "Retorno fuso",
      idempotenciaChave: randomUUID()
    });
    expect(respostaRetorno.statusCode, respostaRetorno.body).toBe(200);

    const retorno = await consultarUm<{ data_referencia: string }>(
      `select to_char(data_referencia, 'YYYY-MM-DD') as data_referencia
         from transferencias where caixa_id = $1 and tipo = 'retorno'`,
      [caixaId]
    );
    // O retorno pertence ao mesmo dia contabil do caixa, inclusive quando o teste roda depois desse dia.
    expect(retorno?.data_referencia).toBe(DIA_LOCAL);
  });
});
