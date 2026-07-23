import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { diaNegocio } from "@padaria/shared/datas";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarUm, json } from "../../setup/integracao.js";

// Fuso do DIA CONTABIL: um instante as 22:00 BRT ja e 01:00Z do dia SEGUINTE. O dia contabil
// gravado tem de ser o dia LOCAL (America/Sao_Paulo), nao o de UTC. Cobre data_movimento do caixa,
// a data_referencia da transferencia de abertura (malote) e a data do acerto de saldo.
describe("caixa - dia contabil no fuso de Sao Paulo (nao UTC)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
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
    const { pdvId } = await criarContaEPdv("fuso-abertura");
    const abrir = await criar("/api/caixa/abrir", {
      empresaId: idsTeste.empresaA,
      pdvId,
      usuarioCaixaId: await usuarioAdminId(),
      dataHoraAbertura: INSTANTE_22H_BRT
    });
    const caixaId = json<{ data: { id: string } }>(abrir).data.id;

    const caixa = await consultarUm<{ data_movimento: string }>(
      "select to_char(data_movimento, 'YYYY-MM-DD') as data_movimento from fechamentos_caixa where id = $1",
      [caixaId]
    );
    expect(caixa?.data_movimento).toBe(DIA_LOCAL); // nao "2026-07-17" (UTC)
  });

  it("Deve gravar data_referencia da transferencia de abertura no dia LOCAL (malote as 22:00 BRT)", async () => {
    const malote = await criar("/api/malotes", {
      empresaId: idsTeste.empresaA,
      codigo: "MAL-FUSO",
      valor: 100,
      lacres: ["LAC-FUSO"]
    });
    const maloteId = json<{ data: { id: string } }>(malote).data.id;
    const { pdvId } = await criarContaEPdv("fuso-malote");
    const abrir = await criar("/api/caixa/abrir", {
      empresaId: idsTeste.empresaA,
      pdvId,
      usuarioCaixaId: await usuarioAdminId(),
      dataHoraAbertura: INSTANTE_22H_BRT,
      maloteId
    });
    const caixaId = json<{ data: { id: string } }>(abrir).data.id;

    const transferencia = await consultarUm<{ data_referencia: string }>(
      `select to_char(data_referencia, 'YYYY-MM-DD') as data_referencia
         from transferencias where caixa_id = $1 and tipo = 'abertura'`,
      [caixaId]
    );
    expect(transferencia?.data_referencia).toBe(DIA_LOCAL);
  });

  it("Deve usar o dia LOCAL de hoje (Sao Paulo) na data do acerto de saldo", async () => {
    const { contaId, pdvId } = await criarContaEPdv("fuso-acerto");
    const abrir = await criar("/api/caixa/abrir", {
      empresaId: idsTeste.empresaA,
      pdvId,
      usuarioCaixaId: await usuarioAdminId(),
      dataHoraAbertura: "2026-07-16T11:00"
    });
    const caixaId = json<{ data: { id: string } }>(abrir).data.id;

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
    await criar(`/api/caixa/${caixaId}/acertar-saldo`, { observacao: "Acerto fuso" });

    const despesa = await consultarUm<{ data_referencia: string }>(
      `select to_char(data_referencia, 'YYYY-MM-DD') as data_referencia
         from despesas where caixa_id = $1 and descricao = 'Diferenca de caixa'`,
      [caixaId]
    );
    // A data do acerto e o dia LOCAL de "agora" em Sao Paulo (diaNegocio), nao o de UTC.
    expect(despesa?.data_referencia).toBe(diaNegocio(new Date()));
  });
});
