import { describe, expect, it } from "vitest";
import {
  agendamentoPayloadSchema,
  conferenciaAgendaPayloadSchema,
  celulasZeradas,
  contarSituacoes,
  limitesDaMargem,
  quantidadeDentroDaMargem,
  situacaoDaOferta
} from "@padaria/shared/compras";

// Fluxo de Compras (PROJECT_BRAIN/57 e 58): margem de quantidade, a Cotacao por fornecedor e os contratos de
// agendamento e conferencia.

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

describe("Cotacao por fornecedor (doc 58 §4)", () => {
  const base = { compradoDeste: false, compradoDeOutro: false, enviada: null, rascunho: false, referencia: 10 };

  it("sem resposta e Enviado; salvou sem enviar e Cotado", () => {
    expect(situacaoDaOferta(base)).toBe("enviado");
    expect(situacaoDaOferta({ ...base, rascunho: true })).toBe("cotado");
  });

  it("enviou dentro da referencia e Retornado; acima (ou sem referencia) e Com aumento", () => {
    expect(situacaoDaOferta({ ...base, enviada: { indisponivel: false, custo: 10 } })).toBe("retornado");
    expect(situacaoDaOferta({ ...base, enviada: { indisponivel: false, custo: 10.01 } })).toBe("com_aumento");
    expect(situacaoDaOferta({ ...base, referencia: null, enviada: { indisponivel: false, custo: 3 } })).toBe(
      "com_aumento"
    );
  });

  it("indisponivel ou produto ja comprado de outro volta como Retornado; o vencedor e Comprado", () => {
    expect(situacaoDaOferta({ ...base, enviada: { indisponivel: true, custo: null } })).toBe("retornado");
    expect(situacaoDaOferta({ ...base, compradoDeOutro: true, enviada: { indisponivel: false, custo: 99 } })).toBe(
      "retornado"
    );
    expect(situacaoDaOferta({ ...base, compradoDeste: true, enviada: { indisponivel: false, custo: 99 } })).toBe(
      "comprado"
    );
  });

  it("Enviado conta todos os fornecedores; as outras colunas, onde cada um esta", () => {
    expect(contarSituacoes(["enviado", "cotado", "com_aumento", "com_aumento", "comprado"])).toEqual({
      enviado: 5,
      cotado: 1,
      retornado: 0,
      com_aumento: 2,
      comprado: 1
    });
    expect(contarSituacoes([])).toEqual(celulasZeradas());
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
