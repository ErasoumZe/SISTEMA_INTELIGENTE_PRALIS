import { writeFileSync } from "node:fs";
import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { env } from "../../api/src/env.js";

// Leitura das vendas pelo S2, SEM banco: as rotas reais do S1 com os servicos simulados. Trava o CONTRATO que o S2 le
// (formato da resposta, lista branca, empresa da loja) e, com CONTRATO_SAIDA=<pasta>, grava as respostas para o S2
// conferir o proprio cliente contra elas. O comportamento com banco esta em tests/integration/vendas/leitura-s2.test.ts.
const EMPRESA = "11111111-1111-4111-8111-1111111111aa" as const;
const TOKEN = "s2-leitura-unidade-".padEnd(48, "u");

vi.mock("../../api/src/vendas/vendas.service.js", () => ({
  listarVendasPaginadas: vi.fn(async (_query: unknown, empresas: string[]) => ({
    itens: [
      {
        id: "venda-1",
        empresaId: empresas[0],
        dataReferencia: "2026-11-24",
        dataVenda: "2026-11-24T18:30:43.000Z",
        dataPagamento: null,
        descricao: "Venda CREARE 123",
        valorOriginal: "20.00",
        valorAcrescimo: "0",
        valorDesconto: "1.20",
        valorLiquido: "18.80",
        computar: true,
        status: "aprovado",
        cancelamentoAutorizadoPorAutomacao: "SUPERVISOR",
        cancelamentoJustificativa: null,
        cancelamentoMotivo: null,
        pdvId: "pdv-1",
        pdvNome: "TNP-PC-CXPDV-1",
        clienteId: "cliente-1",
        clienteNome: "Fulano de Tal",
        colaboradorId: "colab-1",
        colaboradorNome: "Ana Souza",
        pagamentos: [
          {
            id: "pg-1",
            formaPagamentoId: "fp-1",
            formaPagamentoNome: "Pix",
            tipoPagamentoAutomacaoId: "9",
            tipoPagamentoAutomacao: "PIX",
            totalPago: "18.80"
          }
        ],
        itensVenda: [
          {
            produtoId: "p-1",
            produtoAutomacaoId: "77",
            produtoAutomacaoCodigo: "7891",
            descricaoProduto: "PAO FRANCES KG",
            quantidade: 1,
            valorUnitario: 18.8,
            valorTotal: 18.8
          }
        ],
        totalComprovantes: 2
      }
    ],
    total: 1,
    page: 1,
    pageSize: 50
  })),
  totaisVendas: vi.fn(async () => ({
    totalGeral: 18.8,
    quantidade: 1,
    porFormaPagamento: [
      { formaPagamentoId: "fp-1", formaPagamento: "Pix", categoriaFechamentoCaixa: "pix", total: 18.8, quantidade: 1 }
    ]
  }))
}));
vi.mock("../../api/src/pdvs/pdvs.service.js", () => ({
  listarPdvs: vi.fn(async () => [
    {
      id: "pdv-1",
      empresaId: EMPRESA,
      nome: "TNP-PC-CXPDV-1",
      codigo: "1",
      contaId: "c-1",
      ativo: true,
      turnosCaixa: []
    }
  ])
}));
vi.mock("../../api/src/formas-pagamento/formas-pagamento.service.js", () => ({
  listarFormasPagamento: vi.fn(async () => [
    { id: "fp-1", empresaId: EMPRESA, nome: "Pix", categoriaFechamentoCaixa: "pix" }
  ])
}));
vi.mock("../../api/src/turnos/turnos.service.js", () => ({
  listarTurnos: vi.fn(async () => [
    {
      id: "t-1",
      empresaId: EMPRESA,
      nome: "Manha",
      horaInicio: "06:00:00",
      horaFim: "14:00:00",
      ativo: true,
      etiqueta: null,
      diasSemana: []
    }
  ])
}));

const { registrarRotasLeituraS2 } = await import("../../api/src/vendas/vendas-s2.controller.js");
const { listarVendasPaginadas } = await import("../../api/src/vendas/vendas.service.js");

describe("leitura do S2 - contrato das rotas (sem banco)", () => {
  const app = Fastify();
  const anterior = { token: env.S2_LEITURA_TOKEN, empresa: env.S2_LEITURA_EMPRESA_ID };
  const pedir = (url: string, token = TOKEN) =>
    app.inject({ method: "GET", url, headers: { authorization: `Bearer ${token}` } });

  beforeAll(async () => {
    env.S2_LEITURA_TOKEN = TOKEN;
    env.S2_LEITURA_EMPRESA_ID = EMPRESA;
    await registrarRotasLeituraS2(app);
    await app.ready();
  });
  afterAll(async () => {
    env.S2_LEITURA_TOKEN = anterior.token;
    env.S2_LEITURA_EMPRESA_ID = anterior.empresa;
    await app.close();
  });

  it("Deve_ResponderNoFormatoQueOS2Le_SoComOsCamposDaListaBranca", async () => {
    const [vendas, totais, opcoes] = await Promise.all([
      pedir(
        "/api/s2/vendas?dataInicio=2026-11-24&dataFim=2026-11-24&horaDoDiaInicio=06:00&horaDoDiaFim=14:00&empresaId=22222222-2222-4222-8222-222222222222&page=1&pageSize=50&ordem=desc"
      ),
      pedir("/api/s2/vendas/totais?dataInicio=2026-11-24&dataFim=2026-11-24"),
      pedir("/api/s2/vendas/opcoes")
    ]);
    expect([vendas.statusCode, totais.statusCode, opcoes.statusCode]).toEqual([200, 200, 200]);
    const pagina = vendas.json();
    expect(pagina).toMatchObject({ ok: true, meta: { pagination: { total: 1, page: 1, pageSize: 50 } } });
    expect(Object.keys(pagina.data[0]).sort()).toEqual(
      [
        "cancelamentoJustificativa",
        "cancelamentoMotivo",
        "colaboradorNome",
        "dataReferencia",
        "dataVenda",
        "descricao",
        "id",
        "itensVenda",
        "pagamentos",
        "pdvId",
        "pdvNome",
        "status",
        "valorAcrescimo",
        "valorDesconto",
        "valorLiquido",
        "valorOriginal"
      ].sort()
    );
    expect(Object.keys(pagina.data[0].pagamentos[0]).sort()).toEqual(
      ["formaPagamentoId", "formaPagamentoNome", "id", "tipoPagamentoAutomacao", "totalPago"].sort()
    );
    expect(totais.json()).toMatchObject({ ok: true, data: { totalGeral: 18.8, quantidade: 1 } });
    expect(opcoes.json().data).toEqual({
      pdvs: [{ id: "pdv-1", nome: "TNP-PC-CXPDV-1", codigo: "1", ativo: true }],
      formasPagamento: [{ id: "fp-1", nome: "Pix", categoria: "pix" }],
      turnos: [{ id: "t-1", nome: "Manha", horaInicio: "06:00:00", horaFim: "14:00:00", ativo: true }]
    });
    // A empresa e sempre a configurada (o empresaId da URL nao chega ao servico) e a janela de hora chega.
    const [consulta, empresas] = vi.mocked(listarVendasPaginadas).mock.calls[0]!;
    expect(empresas).toEqual([EMPRESA]);
    expect(consulta).toMatchObject({ horaDoDiaInicio: "06:00", horaDoDiaFim: "14:00" });
    expect(consulta).not.toHaveProperty("empresaId");

    const saida = process.env["CONTRATO_SAIDA"];
    if (saida) {
      writeFileSync(`${saida}/s1-vendas.json`, vendas.body);
      writeFileSync(`${saida}/s1-totais.json`, totais.body);
      writeFileSync(`${saida}/s1-opcoes.json`, opcoes.body);
    }
  });

  it("Deve_RecusarTokenErrado_E_FicarDesligadoSemConfiguracao", async () => {
    expect((await pedir("/api/s2/vendas/opcoes", "x".repeat(48))).statusCode).toBe(401);
    env.S2_LEITURA_TOKEN = "";
    try {
      expect((await pedir("/api/s2/vendas/opcoes")).statusCode).toBe(503);
    } finally {
      env.S2_LEITURA_TOKEN = TOKEN;
    }
  });
});
