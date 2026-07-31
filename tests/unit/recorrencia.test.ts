// Recorrencia (PROJECT_BRAIN/17 D3): a serie e gerada na hora do salvar, com teto de 12 meses.
// Decisoes do Jose (30/07): "3 em 3" = trimestral; dias da semana so na frequencia semanal;
// `repeticoes` e o TOTAL, ja contando o lancamento que esta sendo criado.
import { describe, expect, it } from "vitest";
import { datasDaRecorrencia, LIMITE_MESES_RECORRENCIA } from "@padaria/shared/recorrencia";
import { diaDaSemanaIso, somarMeses } from "@padaria/shared";

describe("datasDaRecorrencia", () => {
  it("R-059/R-060 gera anual e trimestral pelo numero de repeticoes, sem teto de 12 meses", () => {
    expect(datasDaRecorrencia("2026-01-31", { frequencia: "ano", repeticoes: 4 }).datas).toEqual([
      "2026-01-31",
      "2027-01-31",
      "2028-01-31",
      "2029-01-31"
    ]);
    expect(datasDaRecorrencia("2026-01-31", { frequencia: "trimestre", repeticoes: 6 }).datas).toHaveLength(6);
  });
  it("repeticoes conta o lancamento atual: 3 mensais = 3 datas, nao 4", () => {
    const { datas } = datasDaRecorrencia("2026-07-30", { frequencia: "mes", repeticoes: 3 });
    expect(datas).toEqual(["2026-07-30", "2026-08-30", "2026-09-30"]);
  });

  it("repeticoes = 1 nao gera nada alem do proprio lancamento", () => {
    const { datas, limitadaPeloTeto } = datasDaRecorrencia("2026-07-30", { frequencia: "mes", repeticoes: 1 });
    expect(datas).toEqual(["2026-07-30"]);
    expect(limitadaPeloTeto).toBe(false);
  });

  it("'3 em 3' e trimestral", () => {
    const { datas } = datasDaRecorrencia("2026-01-15", { frequencia: "trimestre", repeticoes: 4 });
    expect(datas).toEqual(["2026-01-15", "2026-04-15", "2026-07-15", "2026-10-15"]);
  });

  it("dia e quinzena andam em dias corridos", () => {
    expect(datasDaRecorrencia("2026-07-30", { frequencia: "dia", repeticoes: 3 }).datas).toEqual([
      "2026-07-30",
      "2026-07-31",
      "2026-08-01"
    ]);
    expect(datasDaRecorrencia("2026-07-30", { frequencia: "quinzena", repeticoes: 3 }).datas).toEqual([
      "2026-07-30",
      "2026-08-14",
      "2026-08-29"
    ]);
  });

  // O caso classico que quebra recorrencia mal feita: setUTCMonth transborda 31/01 para 03/03.
  it("vencimento no dia 31 cai no ultimo dia dos meses curtos e VOLTA ao 31 nos longos", () => {
    const { datas } = datasDaRecorrencia("2026-01-31", { frequencia: "mes", repeticoes: 5 });
    expect(datas).toEqual([
      "2026-01-31",
      "2026-02-28", // grampeado, nao 03/03
      "2026-03-31", // volta ao 31: o passo e sempre a partir da data ORIGINAL
      "2026-04-30",
      "2026-05-31"
    ]);
  });

  it("respeita fevereiro de ano bissexto", () => {
    // 2028 e bissexto: 29/02 existe.
    expect(datasDaRecorrencia("2028-01-31", { frequencia: "mes", repeticoes: 2 }).datas).toEqual([
      "2028-01-31",
      "2028-02-29"
    ]);
  });

  describe("semanal", () => {
    it("sem dias marcados, repete o dia da semana da data inicial a cada 7 dias", () => {
      const { datas } = datasDaRecorrencia("2026-07-30", { frequencia: "semana", repeticoes: 3 });
      expect(datas).toEqual(["2026-07-30", "2026-08-06", "2026-08-13"]);
      expect(new Set(datas.map(diaDaSemanaIso)).size).toBe(1);
    });

    it("com dias marcados, gera um lancamento por dia marcado dentro da semana", () => {
      // 30/07/2026 e quinta (ISO 4). Marcando terca (2) e sexta (5).
      expect(diaDaSemanaIso("2026-07-30")).toBe(4);
      const { datas } = datasDaRecorrencia("2026-07-30", {
        frequencia: "semana",
        repeticoes: 5,
        diasSemana: [2, 5]
      });
      // A primeira e sempre a do proprio lancamento (quinta), mesmo nao sendo dia marcado.
      expect(datas).toEqual([
        "2026-07-30", // qui (o lancamento atual)
        "2026-07-31", // sex
        "2026-08-04", // ter
        "2026-08-07", // sex
        "2026-08-11" // ter
      ]);
    });

    it("dia marcado repetido nao duplica a data", () => {
      const { datas } = datasDaRecorrencia("2026-07-30", {
        frequencia: "semana",
        repeticoes: 3,
        diasSemana: [2, 2, 2]
      });
      expect(datas).toEqual(["2026-07-30", "2026-08-04", "2026-08-11"]);
      expect(new Set(datas).size).toBe(datas.length);
    });
  });

  describe("teto de 12 meses", () => {
    it("corta a serie e avisa que cortou", () => {
      const { datas, limitadaPeloTeto } = datasDaRecorrencia("2026-07-30", { frequencia: "mes", repeticoes: 24 });
      expect(limitadaPeloTeto).toBe(true);
      // 13 datas: a inicial + 12 meses. Nenhuma passa do teto.
      expect(datas).toHaveLength(13);
      expect(datas.at(-1)).toBe(somarMeses("2026-07-30", LIMITE_MESES_RECORRENCIA));
      for (const data of datas) expect(data <= somarMeses("2026-07-30", LIMITE_MESES_RECORRENCIA)).toBe(true);
    });

    it("serie que cabe dentro de 12 meses nao e marcada como limitada", () => {
      const { limitadaPeloTeto } = datasDaRecorrencia("2026-07-30", { frequencia: "mes", repeticoes: 12 });
      expect(limitadaPeloTeto).toBe(false);
    });

    it("frequencia diaria com repeticoes absurdas para no teto, sem laco infinito", () => {
      const { datas, limitadaPeloTeto } = datasDaRecorrencia("2026-07-30", { frequencia: "dia", repeticoes: 100_000 });
      expect(limitadaPeloTeto).toBe(true);
      expect(datas.length).toBeLessThanOrEqual(366);
      expect(datas.at(-1)! <= somarMeses("2026-07-30", LIMITE_MESES_RECORRENCIA)).toBe(true);
    });

    it("semanal com dias marcados tambem para no teto", () => {
      // 6 dias por semana em 12 meses da ~314 vagas: 400 nao cabe e a serie e cortada.
      const { datas, limitadaPeloTeto } = datasDaRecorrencia("2026-07-30", {
        frequencia: "semana",
        repeticoes: 400,
        diasSemana: [1, 2, 3, 4, 5, 6]
      });
      expect(limitadaPeloTeto).toBe(true);
      expect(datas.length).toBeLessThan(400);
      expect(datas.at(-1)! <= somarMeses("2026-07-30", LIMITE_MESES_RECORRENCIA)).toBe(true);
      // Nenhum domingo entrou.
      expect(datas.slice(1).every((data) => diaDaSemanaIso(data) !== 7)).toBe(true);
    });

    it("serie que CABE em 12 meses nao e marcada como limitada, mesmo sendo longa", () => {
      const { datas, limitadaPeloTeto } = datasDaRecorrencia("2026-07-30", {
        frequencia: "semana",
        repeticoes: 300,
        diasSemana: [1, 2, 3, 4, 5, 6]
      });
      expect(limitadaPeloTeto).toBe(false);
      expect(datas).toHaveLength(300);
    });
  });

  it("repeticoes invalidas (0, negativa, fracionaria) nao quebram nem geram serie vazia", () => {
    expect(datasDaRecorrencia("2026-07-30", { frequencia: "mes", repeticoes: 0 }).datas).toEqual(["2026-07-30"]);
    expect(datasDaRecorrencia("2026-07-30", { frequencia: "mes", repeticoes: -5 }).datas).toEqual(["2026-07-30"]);
    expect(datasDaRecorrencia("2026-07-30", { frequencia: "mes", repeticoes: 2.9 }).datas).toEqual([
      "2026-07-30",
      "2026-08-30"
    ]);
  });
});
