import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarUm, json } from "../../setup/integracao.js";

// DEMONSTRACAO: caixa aberto com despesa/retirada/transferencia/mercadoria (manuais) + uma ENTRADA
// vinda da INTEGRACAO de vendas (CREARE). Mostra a relacao venda integrada <-> resumo do caixa.
// A venda integrada e do MESMO PDV do caixa e DENTRO do periodo em que ele esta aberto.
describe("caixa + venda integrada (entrada por integracao)", () => {
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

  function post(url: string, payload: object, headers: Record<string, string> = { cookie: cookieAdmin }) {
    return contexto.app.inject({ method: "POST", url, headers, payload });
  }

  async function criar(url: string, payload: object) {
    const resposta = await post(url, payload);
    expect(resposta.statusCode, `${url} -> ${resposta.body}`).toBe(201);
    return resposta;
  }

  function payloadVendaIntegrada(idVenda: string, idCaixaExterno: string, valor: number, dataHoraVenda: string) {
    return {
      DadosIntegracao: { origem: "vitest-demo" },
      Venda: {
        idVenda,
        idCaixa: idCaixaExterno,
        nomeCaixa: "PDV Demo Integracao",
        idCliente: null,
        nomeCliente: null,
        documentoCliente: null,
        dataHoraVenda,
        valorOriginal: valor,
        desconto: 0,
        acrescimo: 0,
        valorTotal: valor,
        statusVenda: "aprovado",
        numeroNotaFiscal: null
      },
      ItensVenda: [
        {
          idRegistro: `${idVenda}-ITEM-1`,
          idProduto: "PROD-DEMO",
          descricaoProduto: "Pao frances (integracao)",
          dataHoraItem: dataHoraVenda,
          quantidade: 1,
          valorUnitario: valor,
          total: valor,
          itemCancelado: false
        }
      ],
      PagamentosVenda: [{ idVenda, idFormaPagamento: "CARTAO", descricaoFormaPagamento: "Cartao", valor }]
    };
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

  it("cenario completo: 4 operacoes manuais + entrada por integracao", async () => {
    const usuarioAdmin = await usuarioAdminId();

    // Conta + PDV proprios, e vinculo do idCaixa externo -> este PDV (para a venda cair aqui).
    const conta = await criar("/api/contas", { empresaId: idsTeste.empresaA, nome: "Conta demo venda integrada" });
    const contaId = json<{ data: { id: string } }>(conta).data.id;
    const pdv = await criar("/api/pdvs", {
      empresaId: idsTeste.empresaA,
      nome: "PDV demo venda integrada",
      contaId,
      ativo: true
    });
    const pdvId = json<{ data: { id: string } }>(pdv).data.id;

    const vinculo = await contexto.app.inject({
      method: "PUT",
      url: "/api/integracoes/vinculos",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        tipo: "vendas",
        tipoRegistro: "pdv",
        identificadorExterno: "PDV-DEMO",
        descricaoExterna: "PDV Demo",
        registroSistemaId: pdvId
      }
    });
    expect(vinculo.statusCode, vinculo.body).toBe(204);

    // Abre o caixa (fica ABERTO). Periodo: [2026-06-29 08:00, agora].
    const abrir = await criar("/api/caixa/abrir", {
      empresaId: idsTeste.empresaA,
      pdvId,
      usuarioCaixaId: usuarioAdmin,
      dataHoraAbertura: "2026-06-29T08:00",
      observacao: "Caixa demo venda integrada"
    });
    const caixaId = json<{ data: { id: string } }>(abrir).data.id;

    const dataReferencia = "2026-06-30";
    // Operacoes MANUAIS (entram no caixa por caixa_id).
    await criar("/api/despesas", {
      empresaId: idsTeste.empresaA,
      dataReferencia,
      dataVencimento: dataReferencia,
      descricao: "Conta de luz",
      valorOriginal: 30,
      contaOrigemId: contaId,
      grupoDespesaId: idsTeste.grupoDespesaOperacional
    });
    await criar("/api/retiradas", {
      empresaId: idsTeste.empresaA,
      dataReferencia,
      dataVencimento: dataReferencia,
      descricao: "Vale funcionario",
      valorOriginal: 20,
      contaOrigemId: contaId,
      colaboradorId: idsTeste.colaboradorAdmin,
      grupoRetiradaId: idsTeste.grupoRetiradaSangria
    });
    await criar("/api/transferencias", {
      empresaId: idsTeste.empresaA,
      dataReferencia,
      descricao: "Suprimento do caixa",
      valorOriginal: 50,
      contaOrigemId: idsTeste.contaBanco,
      contaDestinoId: contaId
    });
    await criar("/api/mercadorias", {
      empresaId: idsTeste.empresaA,
      dataReferencia,
      dataVencimento: dataReferencia,
      descricao: "Compra de farinha",
      valorOriginal: 15,
      contaOrigemId: contaId,
      fornecedorId: idsTeste.fornecedor,
      grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
      temNotaFiscal: false
    });

    // ENTRADA por INTEGRACAO: venda de 200 no mesmo PDV, dentro do periodo aberto.
    const venda = await post(
      "/api/integracoes",
      payloadVendaIntegrada("VENDA-DEMO-1", "PDV-DEMO", 200, "2026-06-30T12:00:00.000Z"),
      { "x-api-key": idsTeste.integracaoCodigo }
    );
    assertOk(venda);
    expect(json<{ data: { status: string } }>(venda).data.status).toBe("criado");

    const linhaVenda = await consultarUm<{ caixa_id: string | null; pdv_id: string; valor_original: string }>(
      "select caixa_id, pdv_id, valor_original from vendas where identificador_externo = $1",
      ["VENDA-DEMO-1"]
    );
    console.log("[venda integrada gravada]", { ...linhaVenda, pdvDoCaixa: pdvId, caixaAberto: caixaId });

    const status = await resumoDoCaixa();
    console.log("[resumo do caixa]", status.resumo);

    expect(status.caixaAberto.id).toBe(caixaId);
    expect(status.resumo).toMatchObject({
      totalDespesas: 30,
      totalRetiradas: 20,
      totalTransferenciasEntrada: 50,
      totalMercadorias: 15
    });

    // >>> COM O VINCULO (fix): a venda integrada recebe o caixa_id do caixa do seu PDV/periodo e
    // ENTRA no ENTRADAS/saldo do caixa aberto, junto com as operacoes manuais.
    expect(linhaVenda?.caixa_id).toBe(caixaId);
    expect(status.resumo.totalEntradas).toBe(200);
    // saldo = 200 (entrada integrada) + 50 - 0 - 30 - 20 - 15 = 185
    expect(status.resumo.saldo).toBe(185);
  });

  it("venda integrada de OUTRO periodo/PDV NAO entra no caixa (so entra a do periodo certo)", async () => {
    // Venda cuja dataVenda e ANTES da abertura do caixa criado no teste anterior nao deve vincular.
    const antes = await post(
      "/api/integracoes",
      payloadVendaIntegrada("VENDA-DEMO-FORA", "PDV-DEMO", 999, "2026-06-28T12:00:00.000Z"),
      { "x-api-key": idsTeste.integracaoCodigo }
    );
    assertOk(antes);
    const linha = await consultarUm<{ caixa_id: string | null }>(
      "select caixa_id from vendas where identificador_externo = $1",
      ["VENDA-DEMO-FORA"]
    );
    expect(linha?.caixa_id).toBeNull();
  });
});
