import { describe, expect, it } from "vitest";
import {
  datasDoAgendamento,
  instanteLocal,
  localDoInstante,
  regraRecorrenciaSchema,
  resumoRecorrencia,
  type RegraRecorrencia,
  type TerminoRecorrencia
} from "@padaria/shared/compras";

/**
 * Agendamento de pedido (PROJECT_BRAIN/56 §3): o mesmo modelo do Calendario da Apple (RFC 5545), com as
 * provas obrigatorias do doc 52 §7. Datas conferidas a mao num calendario de 2026 (01/01/2026 = quinta).
 */
const nunca: TerminoRecorrencia = { tipo: "nunca" };
const padrao = (regra: Omit<Extract<RegraRecorrencia, { tipo: "padrao" }>, "tipo">): RegraRecorrencia => ({
  tipo: "padrao",
  ...regra
});
const datas = (regra: RegraRecorrencia, inicio: string, ate: string, termino = nunca) =>
  datasDoAgendamento(regra, inicio, termino, ate);

describe("frequencias", () => {
  it("diaria a cada dois dias", () => {
    expect(datas(padrao({ frequencia: "diaria", intervalo: 2 }), "2026-03-01", "2026-03-09")).toEqual([
      "2026-03-01",
      "2026-03-03",
      "2026-03-05",
      "2026-03-07",
      "2026-03-09"
    ]);
  });

  it("semanal em dois dias (segunda e quinta), comecando numa segunda", () => {
    expect(
      datas(padrao({ frequencia: "semanal", intervalo: 1, diasSemana: [4, 1] }), "2026-03-02", "2026-03-16")
    ).toEqual(["2026-03-02", "2026-03-05", "2026-03-09", "2026-03-12", "2026-03-16"]);
  });

  it("a cada 2 semanas: a semana de folga fica vazia", () => {
    expect(datas(padrao({ frequencia: "semanal", intervalo: 2, diasSemana: [2] }), "2026-03-03", "2026-03-31")).toEqual(
      ["2026-03-03", "2026-03-17", "2026-03-31"]
    );
  });

  it("mensal pelo dia numerico; dia 31 PULA o mes que nao tem 31", () => {
    expect(datas(padrao({ frequencia: "mensal", intervalo: 1 }), "2026-01-31", "2026-05-31")).toEqual([
      "2026-01-31",
      "2026-03-31",
      "2026-05-31"
    ]);
  });

  it("mensal em varios dias (Cada 1 e 15)", () => {
    expect(datas(padrao({ frequencia: "mensal", intervalo: 1, diasMes: [15, 1] }), "2026-03-01", "2026-04-30")).toEqual(
      ["2026-03-01", "2026-03-15", "2026-04-01", "2026-04-15"]
    );
  });

  it("um dia a cada tres meses", () => {
    expect(datas(padrao({ frequencia: "mensal", intervalo: 3 }), "2026-01-10", "2026-12-31")).toEqual([
      "2026-01-10",
      "2026-04-10",
      "2026-07-10",
      "2026-10-10"
    ]);
  });

  it("mensal por posicao: ultima sexta, 1o dia util e 5a segunda (que nem todo mes tem)", () => {
    expect(
      datas(
        padrao({ frequencia: "mensal", intervalo: 1, posicao: { ordinal: -1, dia: 5 } }),
        "2026-01-30",
        "2026-04-30"
      )
    ).toEqual(["2026-01-30", "2026-02-27", "2026-03-27", "2026-04-24"]);
    expect(
      datas(
        padrao({ frequencia: "mensal", intervalo: 1, posicao: { ordinal: 1, dia: "dia_util" } }),
        "2026-02-02",
        "2026-05-31"
      )
    ).toEqual(["2026-02-02", "2026-03-02", "2026-04-01", "2026-05-01"]);
    expect(
      datas(padrao({ frequencia: "mensal", intervalo: 1, posicao: { ordinal: 5, dia: 1 } }), "2026-03-30", "2026-08-31")
    ).toEqual(["2026-03-30", "2026-06-29", "2026-08-31"]);
  });

  it("anual em varios meses e anual por posicao", () => {
    expect(datas(padrao({ frequencia: "anual", intervalo: 1, meses: [1, 3] }), "2026-01-05", "2027-12-31")).toEqual([
      "2026-01-05",
      "2026-03-05",
      "2027-01-05",
      "2027-03-05"
    ]);
    expect(
      datas(
        padrao({ frequencia: "anual", intervalo: 1, meses: [11], posicao: { ordinal: -1, dia: 4 } }),
        "2026-11-26",
        "2027-12-31"
      )
    ).toEqual(["2026-11-26", "2027-11-25"]);
  });

  it("datas avulsas: 2 de janeiro e 3 de fevereiro", () => {
    expect(datas({ tipo: "datas", datas: ["2027-02-03", "2027-01-02"] }, "2026-12-01", "2027-12-31")).toEqual([
      "2026-12-01",
      "2027-01-02",
      "2027-02-03"
    ]);
  });

  it("nao repetir: so a data de inicio", () => {
    expect(datas({ tipo: "nunca" }, "2026-03-01", "2027-03-01")).toEqual(["2026-03-01"]);
  });
});

describe("termino", () => {
  const semanal = padrao({ frequencia: "semanal", intervalo: 1 });
  it("na data (inclusive)", () => {
    expect(datas(semanal, "2026-03-02", "2030-01-01", { tipo: "data", data: "2026-03-16" })).toEqual([
      "2026-03-02",
      "2026-03-09",
      "2026-03-16"
    ]);
  });
  it("depois de N vezes, contando a data de inicio", () => {
    expect(datas(semanal, "2026-03-02", "2030-01-01", { tipo: "quantidade", quantidade: 2 })).toEqual([
      "2026-03-02",
      "2026-03-09"
    ]);
  });
  it("a data de inicio entra mesmo quando nao casa com a regra (RFC 5545)", () => {
    // Inicio numa terca, regra de segundas.
    expect(datas(padrao({ frequencia: "semanal", intervalo: 1, diasSemana: [1] }), "2026-03-03", "2026-03-16")).toEqual(
      ["2026-03-03", "2026-03-09", "2026-03-16"]
    );
  });
  it("regra que quase nunca casa nao trava (teto de periodos)", () => {
    const rara = padrao({ frequencia: "anual", intervalo: 999, meses: [2], posicao: { ordinal: 5, dia: 0 } });
    expect(datas(rara, "2026-03-01", "9999-12-31")).toEqual(["2026-03-01"]);
  });
});

describe("contrato e resumo", () => {
  it("recusa combinacoes que a tela nao oferece", () => {
    expect(
      regraRecorrenciaSchema.safeParse(padrao({ frequencia: "diaria", intervalo: 1, diasSemana: [1] })).success
    ).toBe(false);
    expect(
      regraRecorrenciaSchema.safeParse(
        padrao({ frequencia: "mensal", intervalo: 1, diasMes: [1], posicao: { ordinal: 1, dia: 1 } })
      ).success
    ).toBe(false);
    expect(regraRecorrenciaSchema.safeParse(padrao({ frequencia: "semanal", intervalo: 0 })).success).toBe(false);
    expect(regraRecorrenciaSchema.safeParse(padrao({ frequencia: "semanal", intervalo: 1000 })).success).toBe(false);
  });

  it("descreve a regra como o topo do editor da Apple", () => {
    expect(
      resumoRecorrencia(padrao({ frequencia: "semanal", intervalo: 1, diasSemana: [1, 4] }), "2026-03-02", nunca)
    ).toBe("Toda semana na(s) segunda e quinta");
    expect(resumoRecorrencia(padrao({ frequencia: "mensal", intervalo: 3 }), "2026-01-10", nunca)).toBe(
      "A cada 3 meses no(s) dia(s) 10"
    );
    expect(
      resumoRecorrencia(
        padrao({ frequencia: "mensal", intervalo: 1, posicao: { ordinal: -1, dia: "dia_util" } }),
        "2026-01-30",
        {
          tipo: "quantidade",
          quantidade: 6
        }
      )
    ).toBe("Todo mês no(a) último dia útil, 6 vez(es)");
  });
});

describe("fuso", () => {
  it("converte data local de Sao Paulo (UTC-3) para instante e volta", () => {
    const instante = instanteLocal("2026-03-02", "08:00", "America/Sao_Paulo");
    expect(instante.toISOString()).toBe("2026-03-02T11:00:00.000Z");
    expect(localDoInstante(instante, "America/Sao_Paulo")).toEqual({ data: "2026-03-02", hora: "08:00" });
    // 22h em Sao Paulo ja e o dia seguinte em UTC: o dia LOCAL continua o mesmo.
    expect(localDoInstante(new Date("2026-03-03T01:00:00Z"), "America/Sao_Paulo").data).toBe("2026-03-02");
  });
});
