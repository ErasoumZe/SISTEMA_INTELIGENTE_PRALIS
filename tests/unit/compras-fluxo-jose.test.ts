import { describe, expect, it } from "vitest";
import {
  agendamentoPayloadSchema,
  conferenciaAgendaPayloadSchema,
  limitesDaMargem,
  montarMatrizCompras,
  quantidadeDentroDaMargem,
  totaisDaMatriz,
  type PainelComprasDto
} from "@padaria/shared/compras";
import type { PedidoStatus } from "@padaria/shared";

// Fluxo de Compras de 22/10/2026 (PROJECT_BRAIN/57): margem de quantidade, matriz de Pedidos e os contratos
// novos de agendamento e conferencia.

describe("margem de variacao da quantidade (doc 57 §6.3)", () => {
  it("vale para menos e para mais, com 3 casas", () => {
    expect(limitesDaMargem(5, 10)).toEqual({ minimo: 4.5, maximo: 5.5 });
    expect(limitesDaMargem(3, 40)).toEqual({ minimo: 1.8, maximo: 4.2 });
    expect(limitesDaMargem(0.333, 10)).toEqual({ minimo: 0.3, maximo: 0.366 });
  });

  it("aceita o 5,2 kg de um pedido de 5 kg com 10% e recusa o que sai da faixa", () => {
    expect(quantidadeDentroDaMargem(5, 5.2, 10)).toBe(true);
    expect(quantidadeDentroDaMargem(5, 4.5, 10)).toBe(true);
    expect(quantidadeDentroDaMargem(5, 5.5, 10)).toBe(true);
    expect(quantidadeDentroDaMargem(5, 5.6, 10)).toBe(false);
    expect(quantidadeDentroDaMargem(5, 4.4, 10)).toBe(false);
  });

  it("zero ou negativo nunca e quantidade", () => {
    expect(quantidadeDentroDaMargem(5, 0, 40)).toBe(false);
    expect(quantidadeDentroDaMargem(5, -1, 40)).toBe(false);
  });

  it("cotacao antiga (sem margem) aceita ate o pedido, nunca a mais", () => {
    expect(quantidadeDentroDaMargem(5, 3, null)).toBe(true);
    expect(quantidadeDentroDaMargem(5, 5, null)).toBe(true);
    expect(quantidadeDentroDaMargem(5, 5.1, null)).toBe(false);
  });
});

describe("matriz de Pedidos (doc 57 §4)", () => {
  const vazio: PainelComprasDto = { semFornecedor: [], decisoes: [], convites: [] };
  const pedido = (status: PedidoStatus, fornecedorId: string | null, fornecedorNome: string | null) => ({
    status,
    fornecedorId,
    fornecedorNome
  });

  it("conta cada pedido na coluna da sua situacao e deixa cancelado e historico de fora", () => {
    const linhas = montarMatrizCompras(vazio, [
      pedido("cotado", "f1", "Bahamas"),
      pedido("cotado", "f1", "Bahamas"),
      pedido("retornado", "f1", "Bahamas"),
      pedido("confirmado", "f2", "Mercearia do Lu"),
      pedido("recebido", "f2", "Mercearia do Lu"),
      pedido("cancelado", "f2", "Mercearia do Lu"),
      pedido("rascunho", "f3", "Antigo")
    ]);
    expect(linhas.map((linha) => linha.fornecedorNome)).toEqual(["Bahamas", "Mercearia do Lu"]);
    expect(linhas[0]!.celulas).toMatchObject({ cotado: 2, retornado: 1, confirmado: 0 });
    expect(linhas[1]!.celulas).toMatchObject({ confirmado: 1, recebido: 1 });
  });

  it("convite em aberto conta em Enviado; item sem fornecedor e decisao pendente em A fazer, linha primeiro", () => {
    const painel: PainelComprasDto = {
      semFornecedor: [
        {
          rodadaId: "r1",
          rodadaNumero: 1,
          rodadaItemId: "i1",
          produtoId: "p1",
          descricaoProduto: "Abacaxi",
          quantidade: "10",
          expiraEm: "2026-10-23T12:00:00.000Z"
        }
      ],
      decisoes: [
        {
          solicitacaoId: "s1",
          rodadaId: "r0",
          rodadaNumero: 1,
          observacao: null,
          fechadaEm: "2026-10-21T12:00:00.000Z"
        }
      ],
      convites: [
        {
          conviteId: "c1",
          rodadaId: "r1",
          solicitacaoId: "s1",
          rodadaNumero: 1,
          fornecedorId: "f1",
          fornecedorNome: "Bahamas",
          totalItens: 2,
          respondeu: false,
          expiraEm: "2026-10-23T12:00:00.000Z",
          whatsapp: "enviado"
        }
      ]
    };
    const linhas = montarMatrizCompras(painel, [pedido("enviado", "f1", "Bahamas")]);
    expect(linhas[0]).toMatchObject({ fornecedorId: null, fornecedorNome: "Sem fornecedor" });
    expect(linhas[0]!.celulas.a_fazer).toBe(2);
    expect(linhas[1]!.celulas.enviado).toBe(2);
    expect(totaisDaMatriz(linhas)).toMatchObject({ a_fazer: 2, enviado: 2, cotado: 0 });
  });

  it("sem nada em andamento, a matriz fica vazia", () => {
    expect(montarMatrizCompras(vazio, [pedido("cancelado", "f1", "Bahamas")])).toEqual([]);
  });
});

describe("contratos novos", () => {
  const base = {
    empresaId: "00000000-0000-4000-8000-000000000001",
    grupoMercadoriaId: "00000000-0000-4000-8000-000000000002",
    inicioData: "2026-11-01",
    inicioHora: "08:00",
    regra: { tipo: "padrao", frequencia: "semanal", intervalo: 1 },
    termino: { tipo: "nunca" },
    prazoRespostaHoras: 24,
    produtos: [{ produtoId: "00000000-0000-4000-8000-000000000003" }]
  };

  it("agendamento de pedido: margem padrao 10% e so 10/20/30/40", () => {
    expect(agendamentoPayloadSchema.parse(base).margemVariacaoPercentual).toBe(10);
    expect(agendamentoPayloadSchema.parse({ ...base, margemVariacaoPercentual: 30 }).margemVariacaoPercentual).toBe(30);
    expect(agendamentoPayloadSchema.safeParse({ ...base, margemVariacaoPercentual: 15 }).success).toBe(false);
  });

  it("agenda de conferencia: exige quem conta e so aceita os tres rankings", () => {
    const agenda = {
      empresaId: base.empresaId,
      responsavelId: "usuario-1",
      inicioData: base.inicioData,
      inicioHora: base.inicioHora,
      regra: base.regra,
      termino: base.termino
    };
    expect(conferenciaAgendaPayloadSchema.safeParse(agenda).success).toBe(true);
    expect(conferenciaAgendaPayloadSchema.safeParse({ ...agenda, ranking: "mais_lucro" }).success).toBe(true);
    expect(conferenciaAgendaPayloadSchema.safeParse({ ...agenda, ranking: "curva_a" }).success).toBe(false);
    expect(conferenciaAgendaPayloadSchema.safeParse({ ...agenda, responsavelId: "" }).success).toBe(false);
  });
});
