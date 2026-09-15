import { describe, expect, it } from "vitest";
import { campanhaPayloadSchema, campanhaVigenteNoDia, percentualDaMetaCentavos } from "@padaria/shared/campanhas";

const EMPRESA = "11111111-1111-4111-8111-111111111111";
const PDV = "22222222-2222-4222-8222-222222222222";

function payload(over: Record<string, unknown> = {}) {
  return {
    empresaId: EMPRESA,
    titulo: "Meta de setembro",
    mensagem: "Bata a meta e ganhe a bonificacao.",
    inicio: "2026-09-01",
    fim: "2026-09-30",
    metaValor: 50000,
    bonificacaoTipo: "dinheiro",
    bonificacaoValor: 500,
    pdvIds: [PDV],
    ...over
  };
}

describe("R-197 - periodo e meta da campanha", () => {
  it("aceita a campanha completa", () => {
    expect(campanhaPayloadSchema.safeParse(payload()).success).toBe(true);
  });

  it("recusa fim anterior ao inicio", () => {
    expect(campanhaPayloadSchema.safeParse(payload({ fim: "2026-08-31" })).success).toBe(false);
  });

  it("aceita campanha de um dia so", () => {
    expect(campanhaPayloadSchema.safeParse(payload({ inicio: "2026-09-10", fim: "2026-09-10" })).success).toBe(true);
  });

  it("recusa meta zerada ou negativa", () => {
    expect(campanhaPayloadSchema.safeParse(payload({ metaValor: 0 })).success).toBe(false);
    expect(campanhaPayloadSchema.safeParse(payload({ metaValor: -1 })).success).toBe(false);
  });

  it("exige ao menos um PDV participante: a campanha e por PDV", () => {
    expect(campanhaPayloadSchema.safeParse(payload({ pdvIds: [] })).success).toBe(false);
  });
});

describe("bonificacao - as tres formas sao mutuamente exclusivas", () => {
  it("dinheiro e percentual exigem valor e recusam texto", () => {
    expect(campanhaPayloadSchema.safeParse(payload({ bonificacaoValor: null })).success).toBe(false);
    expect(campanhaPayloadSchema.safeParse(payload({ bonificacaoTexto: "uma folga" })).success).toBe(false);
  });

  it("recompensa exige texto e recusa valor", () => {
    expect(
      campanhaPayloadSchema.safeParse(
        payload({ bonificacaoTipo: "recompensa", bonificacaoValor: null, bonificacaoTexto: "Um dia de folga" })
      ).success
    ).toBe(true);
    expect(
      campanhaPayloadSchema.safeParse(
        payload({ bonificacaoTipo: "recompensa", bonificacaoValor: 100, bonificacaoTexto: "Um dia de folga" })
      ).success
    ).toBe(false);
  });

  // O dedo escorregado que digita 1500 querendo 15%. Sem esta trava, a tela exibiria uma
  // bonificacao de 1500% como se fosse combinada.
  it("percentual para em 100", () => {
    expect(
      campanhaPayloadSchema.safeParse(payload({ bonificacaoTipo: "percentual", bonificacaoValor: 15 })).success
    ).toBe(true);
    expect(
      campanhaPayloadSchema.safeParse(payload({ bonificacaoTipo: "percentual", bonificacaoValor: 1500 })).success
    ).toBe(false);
  });
});

describe("R-199 - progresso ao vivo", () => {
  it("calcula o percentual com uma casa decimal", () => {
    expect(percentualDaMetaCentavos(2500, 10000)).toBe(25);
    expect(percentualDaMetaCentavos(3333, 10000)).toBe(33.3);
  });

  // Truncar em 100 esconderia exatamente o resultado que a campanha existe para mostrar.
  it("passa de 100 quando a meta e superada", () => {
    expect(percentualDaMetaCentavos(15000, 10000)).toBe(150);
  });

  it("devolve zero em vez de dividir por zero", () => {
    expect(percentualDaMetaCentavos(5000, 0)).toBe(0);
  });
});

describe("vigencia da campanha", () => {
  const campanha = { status: "ativa" as const, inicio: "2026-09-01", fim: "2026-09-30" };

  it("vale nos extremos da janela", () => {
    expect(campanhaVigenteNoDia(campanha, "2026-09-01")).toBe(true);
    expect(campanhaVigenteNoDia(campanha, "2026-09-30")).toBe(true);
  });

  it("nao vale um dia antes nem um dia depois", () => {
    expect(campanhaVigenteNoDia(campanha, "2026-08-31")).toBe(false);
    expect(campanhaVigenteNoDia(campanha, "2026-10-01")).toBe(false);
  });

  it("rascunho, encerrada e cancelada nunca acumulam progresso", () => {
    for (const status of ["rascunho", "encerrada", "cancelada"] as const) {
      expect(campanhaVigenteNoDia({ ...campanha, status }, "2026-09-15")).toBe(false);
    }
  });
});
