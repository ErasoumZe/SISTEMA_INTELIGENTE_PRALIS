import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { encerrarCaixaSeedAdminParaTeste } from "../../setup/caixa.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql, json } from "../../setup/integracao.js";

async function usuarioAdminId() {
  const usuario = await consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [
    usuariosTeste.admin.email
  ]);
  if (!usuario) throw new Error("Usuario admin nao encontrado");
  return usuario.id;
}

describe("operacoes edicao integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let vendaId = "";

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    await encerrarCaixaSeedAdminParaTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_EditarOsCincoTiposDeLancamento_Quando_CaixaAberto", async () => {
    const adminId = await usuarioAdminId();
    const conta = await contexto.app.inject({
      method: "POST",
      url: "/api/contas",
      headers: { cookie: cookieAdmin },
      // R-165: a conta do PDV paga as cinco saidas editadas neste caso; sem fundo, o POST nem chega
      // na edicao, que e o que o arquivo prova.
      payload: { empresaId: idsTeste.empresaA, nome: "Conta edicao", saldoInicial: 100_000 }
    });
    expect(conta.statusCode).toBe(201);
    const contaPdvId = json<{ data: { id: string } }>(conta).data.id;
    const pdv = await contexto.app.inject({
      method: "POST",
      url: "/api/pdvs",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "PDV edicao", contaId: contaPdvId, ativo: true }
    });
    expect(pdv.statusCode).toBe(201);
    const pdvId = json<{ data: { id: string } }>(pdv).data.id;

    const abrir = await contexto.app.inject({
      method: "POST",
      url: "/api/caixa/abrir",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        pdvId,
        usuarioCaixaId: adminId,
        dataHoraAbertura: "2026-04-01T08:00",
        observacao: "Caixa edicao"
      }
    });
    expect(abrir.statusCode).toBe(201);
    const caixaId = json<{ data: { id: string } }>(abrir).data.id;
    const dataRef = "2026-04-01";

    async function criar(url: string, payload: object): Promise<string> {
      const resposta = await contexto.app.inject({ method: "POST", url, headers: { cookie: cookieAdmin }, payload });
      expect(resposta.statusCode, `${url}: ${resposta.body}`).toBe(201);
      return json<{ data: { id: string } }>(resposta).data.id;
    }

    vendaId = await criar("/api/vendas", {
      empresaId: idsTeste.empresaA,
      dataReferencia: dataRef,
      descricao: "Venda edicao",
      valorOriginal: 12,
      contaOrigemId: contaPdvId,
      pdvId,
      colaboradorId: idsTeste.colaboradorAdmin,
      itensVenda: [
        {
          produtoId: idsTeste.produto,
          descricaoProduto: "Item original",
          quantidade: 1,
          valorUnitario: 12,
          valorTotal: 12
        }
      ],
      tiposPagamento: [{ formaPagamentoId: idsTeste.formaPagamentoDinheiro, numeroVendas: 1, totalPago: 12 }]
    });
    const despesaId = await criar("/api/despesas", {
      empresaId: idsTeste.empresaA,
      dataReferencia: dataRef,
      dataVencimento: dataRef,
      descricao: "Despesa edicao",
      valorOriginal: 3,
      contaOrigemId: contaPdvId,
      colaboradorId: idsTeste.colaboradorAdmin,
      grupoDespesaId: idsTeste.grupoDespesaOperacional
    });
    const retiradaId = await criar("/api/retiradas", {
      empresaId: idsTeste.empresaA,
      dataReferencia: dataRef,
      dataVencimento: dataRef,
      descricao: "Retirada edicao",
      valorOriginal: 2,
      contaOrigemId: contaPdvId,
      // R-128: retirada NOVA e de fornecedor ou socio/gestor.
      fornecedorId: idsTeste.fornecedor,
      grupoRetiradaId: idsTeste.grupoRetiradaSangria
    });
    const transferenciaId = await criar("/api/transferencias", {
      empresaId: idsTeste.empresaA,
      dataReferencia: dataRef,
      descricao: "Transferencia edicao",
      valorOriginal: 1,
      contaOrigemId: contaPdvId,
      contaDestinoId: idsTeste.contaBanco,
      nLacreDoc: "EDICAO-TR-001"
    });
    const mercadoriaId = await criar("/api/mercadorias", {
      empresaId: idsTeste.empresaA,
      dataReferencia: dataRef,
      dataVencimento: dataRef,
      descricao: "Mercadoria edicao",
      valorOriginal: 4,
      contaOrigemId: contaPdvId,
      fornecedorId: idsTeste.fornecedor,
      grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
      temNotaFiscal: false
    });

    // Detalhe traz o payload completo, com filhos, para preencher o formulario de edicao.
    const detalhe = await contexto.app.inject({
      method: "GET",
      url: `/api/vendas/${vendaId}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(detalhe);
    expect(detalhe.json()).toMatchObject({
      data: {
        id: vendaId,
        caixaId,
        valorOriginal: 12,
        itensVenda: [{ descricaoProduto: "Item original", valorTotal: 12 }],
        tiposPagamento: [{ totalPago: 12 }]
      }
    });

    async function atualizar(url: string, payload: object) {
      const resposta = await contexto.app.inject({ method: "PUT", url, headers: { cookie: cookieAdmin }, payload });
      expect(resposta.statusCode, `${url}: ${resposta.body}`).toBe(200);
    }

    await atualizar(`/api/vendas/${vendaId}`, {
      empresaId: idsTeste.empresaA,
      dataReferencia: dataRef,
      descricao: "Venda editada",
      valorOriginal: 20,
      contaOrigemId: contaPdvId,
      pdvId,
      colaboradorId: idsTeste.colaboradorAdmin,
      itensVenda: [
        {
          produtoId: idsTeste.produto,
          descricaoProduto: "Item editado",
          quantidade: 2,
          valorUnitario: 10,
          valorTotal: 20
        }
      ],
      tiposPagamento: [{ formaPagamentoId: idsTeste.formaPagamentoDinheiro, numeroVendas: 1, totalPago: 20 }]
    });
    const vendaLinha = await consultarUm<{ valor_original: string; descricao: string }>(
      "select valor_original, descricao from vendas where id = $1",
      [vendaId]
    );
    expect(vendaLinha).toMatchObject({ valor_original: "20.00", descricao: "Venda editada" });
    const itemLinha = await consultarUm<{ total: number; valor_total: string }>(
      "select count(*)::int as total, min(valor_total) as valor_total from vendas_produtos where venda_id = $1",
      [vendaId]
    );
    expect(itemLinha).toMatchObject({ total: 1, valor_total: "20.00" });

    await atualizar(`/api/despesas/${despesaId}`, {
      empresaId: idsTeste.empresaA,
      dataReferencia: dataRef,
      dataVencimento: dataRef,
      descricao: "Despesa editada",
      valorOriginal: 5,
      contaOrigemId: contaPdvId,
      colaboradorId: idsTeste.colaboradorAdmin,
      grupoDespesaId: idsTeste.grupoDespesaOperacional
    });
    const debitoDespesa = await consultarUm<{ total: number; valor: string }>(
      "select count(*)::int as total, min(valor) as valor from debitos_colaboradores where despesa_id = $1",
      [despesaId]
    );
    expect(debitoDespesa).toMatchObject({ total: 1, valor: "5.00" });

    // O debito de colaborador so existe na retirada de COLABORADOR, que desde a R-128 no servidor e
    // caminho de historico: a retirada nasce com fornecedor e e convertida no banco, como estao os
    // registros antigos. Editar uma retirada legada tem de continuar recriando o debito.
    await executarSql(
      "update retiradas set fornecedor_id = null, colaborador_id = $2, credor_tipo = 'colaborador' where id = $1",
      [retiradaId, idsTeste.colaboradorAdmin]
    );
    await atualizar(`/api/retiradas/${retiradaId}`, {
      empresaId: idsTeste.empresaA,
      dataReferencia: dataRef,
      dataVencimento: dataRef,
      descricao: "Retirada editada",
      valorOriginal: 7,
      contaOrigemId: contaPdvId,
      colaboradorId: idsTeste.colaboradorAdmin,
      grupoRetiradaId: idsTeste.grupoRetiradaSangria
    });
    const debitoRetirada = await consultarUm<{ total: number; valor: string }>(
      "select count(*)::int as total, min(valor) as valor from debitos_colaboradores where retirada_id = $1",
      [retiradaId]
    );
    expect(debitoRetirada).toMatchObject({ total: 1, valor: "7.00" });

    await atualizar(`/api/transferencias/${transferenciaId}`, {
      empresaId: idsTeste.empresaA,
      dataReferencia: dataRef,
      descricao: "Transferencia editada",
      valorOriginal: 9,
      contaOrigemId: contaPdvId,
      contaDestinoId: idsTeste.contaLivre,
      nLacreDoc: "EDICAO-TR-001"
    });
    expect(
      await consultarTodos<{ conta_id: string }>(
        "select conta_id from transferencias_destinos_candidatos where transferencia_id = $1",
        [transferenciaId]
      )
    ).toEqual([{ conta_id: idsTeste.contaLivre }]);

    const alterarPrazo = await contexto.app.inject({
      method: "PUT",
      url: `/api/transferencias/${transferenciaId}`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: dataRef,
        descricao: "Prazo nao pode mudar na edicao",
        valorOriginal: 9,
        contaOrigemId: contaPdvId,
        contaDestinoId: idsTeste.contaLivre,
        nLacreDoc: "EDICAO-TR-001",
        tempoConfirmacao: "5min"
      }
    });
    assertProblem(alterarPrazo, 400);
    expect(alterarPrazo.body).toMatch(/tempo de confirma.*depois da cria/iu);

    await atualizar(`/api/mercadorias/${mercadoriaId}`, {
      empresaId: idsTeste.empresaA,
      dataReferencia: dataRef,
      dataVencimento: dataRef,
      descricao: "Mercadoria editada",
      valorOriginal: 6,
      contaOrigemId: contaPdvId,
      fornecedorId: idsTeste.fornecedor,
      grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
      temNotaFiscal: false
    });

    // O resumo do caixa reflete os valores EDITADOS: 20 - 9 - 5 - 7 - 6 = -7.
    const status = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/status?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(status);
    expect(status.json()).toMatchObject({
      data: {
        caixaAberto: { id: caixaId },
        resumo: {
          totalEntradas: 20,
          totalTransferenciasSaida: 9,
          totalDespesas: 5,
          totalRetiradas: 7,
          totalMercadorias: 6,
          saldo: -7
        }
      }
    });

    const fechar = await contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${caixaId}/fechar`,
      headers: { cookie: cookieAdmin },
      payload: { observacao: "Fechado apos edicoes" }
    });
    expect(fechar.statusCode, fechar.body).toBe(204);
  });

  it("Deve_Retornar403_Quando_EditarSemPermissaoDeEdicao", async () => {
    const cookieCaixa = await cookieSessao(contexto.app, "caixa");
    const resposta = await contexto.app.inject({
      method: "PUT",
      url: `/api/vendas/${vendaId}`,
      headers: { cookie: cookieCaixa },
      payload: {}
    });
    assertProblem(resposta, 403);
  });

  it("Deve_Retornar400_Quando_EditarLancamentoDeCaixaFechado", async () => {
    const resposta = await contexto.app.inject({
      method: "PUT",
      url: `/api/vendas/${vendaId}`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: "2026-04-01",
        descricao: "Tentativa pos-fechamento",
        valorOriginal: 20,
        itensVenda: [],
        tiposPagamento: []
      }
    });
    assertProblem(resposta, 400);
  });
});
