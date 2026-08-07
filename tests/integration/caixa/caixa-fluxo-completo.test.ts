import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { diaNegocio } from "@padaria/shared/datas";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { confirmarTransferenciaPorLacreDireto, consultarTodos, consultarUm, json } from "../../setup/integracao.js";

// R-129: data de pagamento nao pode ser retroativa. O fluxo do caixa nao depende do DIA do
// pagamento — os totais fecham por caixa_id — entao a data de referencia continua fixa e so o
// pagamento anda para hoje.
const PAGO_EM = diaNegocio(new Date());

// Fluxo operacional COMPLETO do caixa, narrado para visualizacao (pedido do Ze):
// abre o caixa -> cria ENTRADA (venda), DESPESA, RETIRADA, TRANSFERENCIA e MERCADORIA ->
// confere o resumo -> FECHA em dois cenarios: sem diferenca (saldo zero) e com diferenca (acerto).
// Prova que o fluxo inteiro funciona ponta a ponta no banco real (Testcontainers).
describe("caixa - fluxo operacional completo (entrada/despesa/retirada/transferencia/mercadoria + fechamento)", () => {
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

  // Abre um caixa novo (conta + pdv proprios) e o deixa como o caixa aberto mais recente do usuario.
  async function abrirCaixa(nome: string, dataHoraAbertura: string) {
    const conta = await criar("/api/contas", { empresaId: idsTeste.empresaA, nome: `Conta ${nome}` });
    const contaId = json<{ data: { id: string } }>(conta).data.id;
    const pdv = await criar("/api/pdvs", { empresaId: idsTeste.empresaA, nome: `PDV ${nome}`, contaId, ativo: true });
    const pdvId = json<{ data: { id: string } }>(pdv).data.id;
    const abrir = await criar("/api/caixa/abrir", {
      empresaId: idsTeste.empresaA,
      pdvId,
      usuarioCaixaId: await usuarioAdminId(),
      dataHoraAbertura,
      observacao: `Caixa ${nome}`
    });
    return { caixaId: json<{ data: { id: string } }>(abrir).data.id, contaId, pdvId };
  }

  async function resumoDoCaixa() {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/status?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(resposta);
    return json<{ data: { caixaAberto: { id: string }; resumo: Record<string, number> } }>(resposta).data;
  }

  it("FECHA SEM diferenca: as 5 operacoes se equilibram e o caixa fecha com saldo zero", async () => {
    const { caixaId, contaId, pdvId } = await abrirCaixa("sem-diferenca", "2026-05-01T08:00");
    const dataReferencia = "2026-05-01";

    // ENTRADA (venda) +100
    await criar("/api/vendas", {
      empresaId: idsTeste.empresaA,
      dataReferencia,
      dataPagamento: PAGO_EM,
      descricao: "Venda do dia",
      valorOriginal: 100,
      contaOrigemId: contaId,
      pdvId,
      colaboradorId: idsTeste.colaboradorAdmin,
      itensVenda: [
        { produtoId: idsTeste.produto, descricaoProduto: "Pao", quantidade: 1, valorUnitario: 100, valorTotal: 100 }
      ],
      tiposPagamento: [{ formaPagamentoId: idsTeste.formaPagamentoDinheiro, numeroVendas: 1, totalPago: 100 }]
    });
    // TRANSFERENCIA de entrada (banco -> caixa) +20
    await criar("/api/transferencias", {
      empresaId: idsTeste.empresaA,
      dataReferencia,
      descricao: "Suprimento do caixa",
      valorOriginal: 20,
      contaOrigemId: idsTeste.contaBanco,
      contaDestinoId: contaId,
      nLacreDoc: "FLUXO-ENTRADA-001"
    });
    await confirmarTransferenciaPorLacreDireto("FLUXO-ENTRADA-001", await usuarioAdminId());
    // DESPESA -40
    await criar("/api/despesas", {
      empresaId: idsTeste.empresaA,
      dataReferencia,
      dataVencimento: dataReferencia,
      dataPagamento: PAGO_EM,
      descricao: "Conta de luz",
      valorOriginal: 40,
      contaOrigemId: contaId,
      grupoDespesaId: idsTeste.grupoDespesaOperacional
    });
    // RETIRADA -30
    await criar("/api/retiradas", {
      empresaId: idsTeste.empresaA,
      dataReferencia,
      dataVencimento: dataReferencia,
      dataPagamento: PAGO_EM,
      descricao: "Vale funcionario",
      valorOriginal: 30,
      contaOrigemId: contaId,
      colaboradorId: idsTeste.colaboradorAdmin,
      grupoRetiradaId: idsTeste.grupoRetiradaSangria
    });
    // MERCADORIA -15
    await criar("/api/mercadorias", {
      empresaId: idsTeste.empresaA,
      dataReferencia,
      dataVencimento: dataReferencia,
      dataPagamento: PAGO_EM,
      descricao: "Compra de farinha",
      valorOriginal: 15,
      contaOrigemId: contaId,
      fornecedorId: idsTeste.fornecedor,
      grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
      temNotaFiscal: false
    });
    // TRANSFERENCIA de saida (caixa -> banco) -35
    await criar("/api/transferencias", {
      empresaId: idsTeste.empresaA,
      dataReferencia,
      descricao: "Deposito no banco",
      valorOriginal: 35,
      contaOrigemId: contaId,
      contaDestinoId: idsTeste.contaBanco,
      nLacreDoc: "FLUXO-SAIDA-001"
    });

    // Formula oficial: 100 + 20 - 40 - 30 - 15 - 35 = 0
    const status = await resumoDoCaixa();
    expect(status.caixaAberto.id).toBe(caixaId);
    expect(status.resumo).toMatchObject({
      totalEntradas: 100,
      totalTransferenciasEntrada: 20,
      totalTransferenciasSaida: 35,
      totalDespesas: 40,
      totalRetiradas: 30,
      totalMercadorias: 15,
      saldo: 0
    });

    // Saldo zero: fecha direto, sem acerto.
    const fechar = await post(`/api/caixa/${caixaId}/fechar`, { observacao: "Fechamento sem diferenca" });
    expect(fechar.statusCode, fechar.body).toBe(204);
    const fechado = await consultarUm<{ status: string; saldo: string }>(
      "select status, saldo from fechamentos_caixa where id = $1",
      [caixaId]
    );
    expect(fechado).toMatchObject({ status: "fechado", saldo: "0.00" });
  });

  it("FECHA COM sobra: exige retorno explicito ao cofre e zera o caixa", async () => {
    const { caixaId, contaId, pdvId } = await abrirCaixa("com-diferenca", "2026-05-02T08:00");
    const dataReferencia = "2026-05-02";

    // Apenas uma ENTRADA de 100 -> saldo 100 (a diferenca a acertar).
    await criar("/api/vendas", {
      empresaId: idsTeste.empresaA,
      dataReferencia,
      dataPagamento: PAGO_EM,
      descricao: "Venda do dia",
      valorOriginal: 100,
      contaOrigemId: contaId,
      pdvId,
      colaboradorId: idsTeste.colaboradorAdmin,
      itensVenda: [
        { produtoId: idsTeste.produto, descricaoProduto: "Pao", quantidade: 1, valorUnitario: 100, valorTotal: 100 }
      ],
      tiposPagamento: [{ formaPagamentoId: idsTeste.formaPagamentoDinheiro, numeroVendas: 1, totalPago: 100 }]
    });

    const antes = await resumoDoCaixa();
    expect(antes.caixaAberto.id).toBe(caixaId);
    expect(antes.resumo).toMatchObject({ totalEntradas: 100, saldo: 100 });

    // D1: retorno PARCIAL durante o turno — o saldo cai, mas nao zera.
    const parcial = await post(`/api/caixa/${caixaId}/transferencia-cofre`, {
      tipo: "retorno",
      valor: 40,
      lacre: "RET-PARCIAL-1",
      observacao: "Retorno parcial",
      idempotenciaChave: randomUUID()
    });
    expect(parcial.statusCode, parcial.body).toBe(200);
    expect((await resumoDoCaixa()).resumo).toMatchObject({ saldo: 60 });

    // D1: acima do saldo restante o servidor recusa — sem este teto, o excedente virava saldo
    // negativo e o fechamento gravava quebra falsa no nome do operador.
    const acimaDoSaldo = await post(`/api/caixa/${caixaId}/transferencia-cofre`, {
      tipo: "retorno",
      valor: 61,
      lacre: "RET-ACIMA",
      idempotenciaChave: randomUUID()
    });
    assertProblem(acimaDoSaldo, 400);
    expect(acimaDoSaldo.body).toMatch(/R\$ 60\.00/);
    expect((await resumoDoCaixa()).resumo).toMatchObject({ saldo: 60 });

    // D6: fechar com saldo positivo NAO e mais barrado. O retorno final do restante sai no MESMO
    // ato e na mesma transacao do fechamento; nao existe segundo botao.
    const fechar = await post(`/api/caixa/${caixaId}/fechar`, {
      observacao: "Fechamento com retorno final",
      lacreRetorno: "RET-FINAL-1"
    });
    expect(fechar.statusCode, fechar.body).toBe(204);
    const fechado = await consultarUm<{ status: string; saldo: string }>(
      "select status, saldo from fechamentos_caixa where id = $1",
      [caixaId]
    );
    expect(fechado).toMatchObject({ status: "fechado", saldo: "0.00" });

    // D5: duas entregas fisicas, cada uma com seu valor e seu lacre. O parcial nao foi editado
    // para absorver a diferenca — nasceu um segundo movimento.
    // D3: ambas nascem PENDENTES (aguardam conferencia de quem opera o cofre) e mesmo assim ja
    // abateram o saldo fisico, que e o que permitiu o caixa fechar zerado.
    const movimentos = await consultarTodos<{ valor_original: string; status: string; n_lacre_doc: string }>(
      "select valor_original, status, n_lacre_doc from transferencias where caixa_id = $1 and tipo = 'retorno' order by valor_original",
      [caixaId]
    );
    expect(movimentos).toEqual([
      { valor_original: "40.00", status: "pendente", n_lacre_doc: "RET-PARCIAL-1" },
      { valor_original: "60.00", status: "pendente", n_lacre_doc: "RET-FINAL-1" }
    ]);
  });

  it("contrato do payload do front: ID opcional em branco deve ir como null (nao ''), senao da 400 Invalid UUID", async () => {
    const { contaId } = await abrirCaixa("contrato-payload", "2026-05-03T08:00");
    const dataReferencia = "2026-05-03";
    const base = {
      empresaId: idsTeste.empresaA,
      dataReferencia,
      dataVencimento: dataReferencia,
      descricao: "Despesa contrato",
      valorOriginal: 5,
      contaOrigemId: contaId,
      grupoDespesaId: idsTeste.grupoDespesaOperacional
    };

    // Como o front passou a enviar (null nos opcionais em branco): aceito.
    const comNull = await post("/api/despesas", { ...base, colaboradorId: null, fornecedorId: null });
    expect(comNull.statusCode, comNull.body).toBe(201);

    // Como o front enviava antes (string vazia): rejeitado com o erro exato do print do Ze.
    const comVazio = await post("/api/despesas", { ...base, colaboradorId: "" });
    assertProblem(comVazio, 400);
    expect(comVazio.body).toContain("colaboradorId");
  });
});
