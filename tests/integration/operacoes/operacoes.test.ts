import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, json } from "../../setup/integracao.js";

describe("operacoes integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_ListarVendasNoEndpointAtualENaoRegistrarRotaAntiga", async () => {
    const respostaVendas = await contexto.app.inject({
      method: "GET",
      url: `/api/vendas?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });
    const respostaEntradas = await contexto.app.inject({
      method: "GET",
      url: `/api/entradas?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });

    assertOk(respostaVendas);
    expect(JSON.stringify(respostaVendas.json())).toContain("Venda seed integracao");
    expect(respostaEntradas.statusCode).toBe(404);
  });

  it("Deve_CriarVendaDespesaMercadoriaRetiradaETransferencia_ComBancoReal", async () => {
    const venda = await contexto.app.inject({
      method: "POST",
      url: "/api/vendas",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: "2026-06-30",
        dataPagamento: "2026-06-30",
        descricao: "Venda criada por integracao",
        valorOriginal: 12,
        contaOrigemId: idsTeste.contaCaixa,
        pdvId: idsTeste.pdvA,
        colaboradorId: idsTeste.colaboradorAdmin,
        itensVenda: [
          {
            produtoId: idsTeste.produto,
            descricaoProduto: "Produto Integracao",
            quantidade: 1,
            valorUnitario: 12,
            valorTotal: 12
          }
        ],
        tiposPagamento: [{ formaPagamentoId: idsTeste.formaPagamentoDinheiro, numeroVendas: 1, totalPago: 12 }]
      }
    });
    expect(venda.statusCode).toBe(201);

    const despesa = await contexto.app.inject({
      method: "POST",
      url: "/api/despesas",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: "2026-06-30",
        dataVencimento: "2026-06-30",
        dataPagamento: "2026-06-30",
        descricao: "Despesa criada por integracao",
        valorOriginal: 3,
        contaOrigemId: idsTeste.contaCaixa,
        grupoDespesaId: idsTeste.grupoDespesaOperacional
      }
    });
    expect(despesa.statusCode).toBe(201);

    const mercadoria = await contexto.app.inject({
      method: "POST",
      url: "/api/mercadorias",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: "2026-06-30",
        dataVencimento: "2026-06-30",
        dataPagamento: "2026-06-30",
        descricao: "Mercadoria criada por integracao",
        valorOriginal: 4,
        contaOrigemId: idsTeste.contaCaixa,
        fornecedorId: idsTeste.fornecedor,
        grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
        temNotaFiscal: false
      }
    });
    expect(mercadoria.statusCode).toBe(201);

    const retirada = await contexto.app.inject({
      method: "POST",
      url: "/api/retiradas",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: "2026-06-30",
        dataVencimento: "2026-06-30",
        dataPagamento: "2026-06-30",
        descricao: "Retirada criada por integracao",
        valorOriginal: 2,
        contaOrigemId: idsTeste.contaCaixa,
        colaboradorId: idsTeste.colaboradorAdmin,
        grupoRetiradaId: idsTeste.grupoRetiradaSangria
      }
    });
    expect(retirada.statusCode).toBe(201);

    const transferencia = await contexto.app.inject({
      method: "POST",
      url: "/api/transferencias",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: "2026-06-30",
        descricao: "Transferencia criada por integracao",
        valorOriginal: 1,
        contaOrigemId: idsTeste.contaCaixa,
        contaDestinoId: idsTeste.contaBanco,
        nLacreDoc: "OPERACOES-CRIAR-001"
      }
    });
    expect(transferencia.statusCode).toBe(201);

    const ids = {
      venda: json<{ data: { id: string } }>(venda).data.id,
      despesa: json<{ data: { id: string } }>(despesa).data.id,
      mercadoria: json<{ data: { id: string } }>(mercadoria).data.id,
      retirada: json<{ data: { id: string } }>(retirada).data.id,
      transferencia: json<{ data: { id: string } }>(transferencia).data.id
    };

    await expect(
      consultarUm("select id from vendas where id = $1 and caixa_id = $2", [ids.venda, idsTeste.caixaAberto])
    ).resolves.toBeTruthy();
    await expect(
      consultarUm("select id from despesas where id = $1 and caixa_id = $2", [ids.despesa, idsTeste.caixaAberto])
    ).resolves.toBeTruthy();
    await expect(
      consultarUm("select id from mercadorias where id = $1 and caixa_id = $2", [ids.mercadoria, idsTeste.caixaAberto])
    ).resolves.toBeTruthy();
    await expect(
      consultarUm("select id from retiradas where id = $1 and caixa_id = $2", [ids.retirada, idsTeste.caixaAberto])
    ).resolves.toBeTruthy();
    await expect(
      consultarUm("select id from transferencias where id = $1 and caixa_id = $2", [
        ids.transferencia,
        idsTeste.caixaAberto
      ])
    ).resolves.toBeTruthy();

    for (const [url, texto] of [
      [`/api/despesas?empresaId=${idsTeste.empresaA}`, "Despesa criada por integracao"],
      [`/api/mercadorias?empresaId=${idsTeste.empresaA}`, "Mercadoria criada por integracao"],
      [`/api/retiradas?empresaId=${idsTeste.empresaA}`, "Retirada criada por integracao"],
      [`/api/transferencias?empresaId=${idsTeste.empresaA}`, "Transferencia criada por integracao"]
    ] as const) {
      const resposta = await contexto.app.inject({ method: "GET", url, headers: { cookie: cookieAdmin } });
      assertOk(resposta);
      expect(JSON.stringify(resposta.json())).toContain(texto);
    }
  });

  it("Deve_Retornar400_Quando_RegrasDeLancamentoForemInvalidas", async () => {
    const vendaSomaInvalida = await contexto.app.inject({
      method: "POST",
      url: "/api/vendas",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: "2026-06-30",
        descricao: "Venda invalida",
        valorOriginal: 10,
        itensVenda: [{ descricaoProduto: "Produto", quantidade: 1, valorUnitario: 5, valorTotal: 5 }]
      }
    });
    const despesaSemGrupo = await contexto.app.inject({
      method: "POST",
      url: "/api/despesas",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: "2026-06-30",
        dataVencimento: "2026-06-30",
        descricao: "Despesa invalida",
        valorOriginal: 1
      }
    });
    const mercadoriaSemGrupo = await contexto.app.inject({
      method: "POST",
      url: "/api/mercadorias",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: "2026-06-30",
        dataVencimento: "2026-06-30",
        descricao: "Mercadoria invalida",
        valorOriginal: 1,
        fornecedorId: idsTeste.fornecedor
      }
    });
    const transferenciaMesmaConta = await contexto.app.inject({
      method: "POST",
      url: "/api/transferencias",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: "2026-06-30",
        descricao: "Transferencia invalida",
        valorOriginal: 1,
        contaOrigemId: idsTeste.contaCaixa,
        contaDestinoId: idsTeste.contaCaixa,
        nLacreDoc: "OPERACOES-MESMA-CONTA"
      }
    });
    const transferenciaSemLacre = await contexto.app.inject({
      method: "POST",
      url: "/api/transferencias",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: "2026-06-30",
        descricao: "Transferencia sem lacre",
        valorOriginal: 1,
        contaOrigemId: idsTeste.contaBanco,
        contaDestinoId: idsTeste.contaLivre
      }
    });

    for (const resposta of [
      vendaSomaInvalida,
      despesaSemGrupo,
      mercadoriaSemGrupo,
      transferenciaMesmaConta,
      transferenciaSemLacre
    ]) {
      assertProblem(resposta, 400);
    }
  });

  it("Deve_Retornar400_Quando_ReferenciaForDeOutraEmpresaOuUsuarioNaoTiverCaixaAberto", async () => {
    const referenciaOutraEmpresa = await contexto.app.inject({
      method: "POST",
      url: "/api/transferencias",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: "2026-06-30",
        descricao: "Transferencia referencia invalida",
        valorOriginal: 1,
        contaOrigemId: idsTeste.contaCaixa,
        contaDestinoId: idsTeste.contaBanco,
        nLacreDoc: "OPERACOES-REFERENCIA-OUTRA-EMPRESA",
        maloteId: idsTeste.maloteB
      }
    });
    const cookieCaixa = await cookieSessao(contexto.app, "caixa");
    const semCaixaAberto = await contexto.app.inject({
      method: "POST",
      url: "/api/vendas",
      headers: { cookie: cookieCaixa },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: "2026-06-30",
        descricao: "Venda sem caixa",
        valorOriginal: 1,
        itensVenda: [{ descricaoProduto: "Produto", quantidade: 1, valorUnitario: 1, valorTotal: 1 }]
      }
    });

    assertProblem(referenciaOutraEmpresa, 400);
    assertProblem(semCaixaAberto, 400);
  });

  it("Deve_Retornar403_Quando_UsuarioNaoTemPermissaoDaOperacao", async () => {
    const cookieCaixa = await cookieSessao(contexto.app, "caixa");

    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/despesas",
      headers: { cookie: cookieCaixa },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: "2026-06-30",
        dataVencimento: "2026-06-30",
        descricao: "Despesa sem permissao",
        valorOriginal: 1,
        grupoDespesaId: idsTeste.grupoDespesaOperacional
      }
    });

    assertProblem(resposta, 403, "INSUFFICIENT_PERMISSION");
  });

  it.each([
    [
      "venda",
      "/api/vendas",
      {
        empresaId: idsTeste.empresaB,
        dataReferencia: "2026-06-30",
        descricao: "Venda proibida",
        valorOriginal: 1,
        itensVenda: [{ descricaoProduto: "Produto", quantidade: 1, valorUnitario: 1, valorTotal: 1 }],
        tiposPagamento: [{ numeroVendas: 1, totalPago: 1 }]
      }
    ],
    [
      "despesa",
      "/api/despesas",
      {
        empresaId: idsTeste.empresaB,
        dataReferencia: "2026-06-30",
        dataVencimento: "2026-06-30",
        descricao: "Despesa proibida",
        valorOriginal: 1,
        grupoDespesaId: idsTeste.grupoDespesaOperacional
      }
    ],
    [
      "mercadoria",
      "/api/mercadorias",
      {
        empresaId: idsTeste.empresaB,
        dataReferencia: "2026-06-30",
        dataVencimento: "2026-06-30",
        descricao: "Mercadoria proibida",
        valorOriginal: 1,
        fornecedorId: idsTeste.fornecedor,
        grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos
      }
    ],
    [
      "retirada",
      "/api/retiradas",
      {
        empresaId: idsTeste.empresaB,
        dataReferencia: "2026-06-30",
        dataVencimento: "2026-06-30",
        descricao: "Retirada proibida",
        valorOriginal: 1,
        colaboradorId: idsTeste.colaboradorAdmin
      }
    ],
    [
      "transferencia",
      "/api/transferencias",
      {
        empresaId: idsTeste.empresaB,
        dataReferencia: "2026-06-30",
        descricao: "Transferencia proibida",
        valorOriginal: 1,
        contaOrigemId: idsTeste.contaCaixa,
        contaDestinoId: idsTeste.contaBanco
      }
    ]
  ])("Deve_Retornar403_Quando_Criar%sEmEmpresaNaoPermitida", async (_nome, url, payload) => {
    const resposta = await contexto.app.inject({
      method: "POST",
      url,
      headers: { cookie: cookieAdmin },
      payload
    });

    assertProblem(resposta, 403, "FORBIDDEN_COMPANY");
  });
});
