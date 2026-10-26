import { describe, expect, it } from "vitest";
import {
  contratoColaboradorQuestorRequisicaoSchema,
  contratoColaboradorQuestorPayloadSchema
} from "../../shared/src/conplus/index.js";
import { esperaAposFalhaConplus } from "../../api/src/conplus/conplus-sincronizacao.service.js";

/** Regras puras da estrutura que espera a API Conplus. */
describe("Código do contrato Questor (CODIGOFUNCCONTR)", () => {
  const ler = (valor: unknown) => contratoColaboradorQuestorPayloadSchema.safeParse({ questorCodigoContrato: valor });

  it("aceita 1 a 7 dígitos e remove zeros à esquerda", () => {
    expect(ler("1").data?.questorCodigoContrato).toBe("1");
    expect(ler("9999999").data?.questorCodigoContrato).toBe("9999999");
    expect(ler(" 0012345 ").data?.questorCodigoContrato).toBe("12345");
  });

  it("aceita vazio como nulo (DP ainda não informou)", () => {
    expect(ler(null).data?.questorCodigoContrato).toBeNull();
    expect(ler(undefined).data?.questorCodigoContrato).toBeNull();
  });

  it("recusa zero, letras, sinal e mais de 7 dígitos", () => {
    for (const valor of ["0", "000", "12A", "-5", "12345678", "1.5", ""]) {
      expect(ler(valor).success, valor).toBe(false);
    }
  });

  it("requisição exige atualizadoEmLido e recusa campo desconhecido", () => {
    const base = { questorCodigoContrato: "10", atualizadoEmLido: "2026-10-22T10:00:00.000Z" };
    expect(contratoColaboradorQuestorRequisicaoSchema.safeParse(base).success).toBe(true);
    expect(contratoColaboradorQuestorRequisicaoSchema.safeParse({ questorCodigoContrato: "10" }).success).toBe(false);
    expect(contratoColaboradorQuestorRequisicaoSchema.safeParse({ ...base, empresaId: "x" }).success).toBe(false);
  });
});

describe("Busca automática Conplus — espera após falha", () => {
  const minutos = (n: number) => n * 60_000;

  it("dobra a cada falha seguida a partir de 5 minutos", () => {
    expect(esperaAposFalhaConplus(1)).toBe(minutos(5));
    expect(esperaAposFalhaConplus(2)).toBe(minutos(10));
    expect(esperaAposFalhaConplus(3)).toBe(minutos(20));
    expect(esperaAposFalhaConplus(4)).toBe(minutos(40));
  });

  it("nunca passa de 6 horas, nem com muitas falhas", () => {
    expect(esperaAposFalhaConplus(8)).toBe(minutos(360));
    expect(esperaAposFalhaConplus(1000)).toBe(minutos(360));
  });

  it("trata contagem inválida como primeira falha", () => {
    expect(esperaAposFalhaConplus(0)).toBe(minutos(5));
    expect(esperaAposFalhaConplus(-3)).toBe(minutos(5));
  });
});
