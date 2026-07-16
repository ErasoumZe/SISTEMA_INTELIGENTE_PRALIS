import { describe, expect, it } from "vitest";
import { diaNegocio, janelaDiaNegocio, somarDias } from "@padaria/shared/datas";

// BUG B: a data contabil da venda integrada era derivada com toISOString() (UTC). Em BRT (-03),
// toda venda a partir das 21:00 caia no dia seguinte — no caixa errado e divergindo do CREARE.
describe("diaNegocio", () => {
  it("venda as 22:00 locais fica no dia dela, nao no seguinte", () => {
    // 16/07 22:00 BRT = 17/07 01:00 UTC
    const instante = new Date("2026-07-17T01:00:00.000Z");
    expect(diaNegocio(instante)).toBe("2026-07-16");
    expect(instante.toISOString().slice(0, 10)).toBe("2026-07-17"); // o bug, para contraste
  });

  it("venda as 21:00 locais (a fronteira exata do bug) fica no dia dela", () => {
    expect(diaNegocio(new Date("2026-07-17T00:00:00.000Z"))).toBe("2026-07-16");
  });

  it("venda as 20:59 locais nunca esteve errada", () => {
    expect(diaNegocio(new Date("2026-07-16T23:59:00.000Z"))).toBe("2026-07-16");
  });

  it("primeira hora do dia local cai no dia certo", () => {
    // 16/07 00:30 BRT = 16/07 03:30 UTC
    expect(diaNegocio(new Date("2026-07-16T03:30:00.000Z"))).toBe("2026-07-16");
  });

  it("aceita string ISO alem de Date", () => {
    expect(diaNegocio("2026-07-17T01:00:00.000Z")).toBe("2026-07-16");
  });

  it("vira o ano corretamente (31/12 as 22:00 locais nao vira 01/01)", () => {
    expect(diaNegocio(new Date("2027-01-01T01:00:00.000Z"))).toBe("2026-12-31");
  });
});

describe("janelaDiaNegocio", () => {
  it("cobre o dia local inteiro em instantes UTC", () => {
    const { inicio, fim } = janelaDiaNegocio("2026-07-16");
    // BRT e UTC-3: o dia local comeca as 03:00Z e termina as 03:00Z do dia seguinte.
    expect(inicio.toISOString()).toBe("2026-07-16T03:00:00.000Z");
    expect(fim.toISOString()).toBe("2026-07-17T03:00:00.000Z");
  });

  it("a janela contem todo instante cujo dia de negocio e o dia pedido", () => {
    const { inicio, fim } = janelaDiaNegocio("2026-07-16");
    const dentro = ["2026-07-16T03:00:00.000Z", "2026-07-16T15:00:00.000Z", "2026-07-17T02:59:59.000Z"];
    const fora = ["2026-07-16T02:59:59.000Z", "2026-07-17T03:00:00.000Z"];

    for (const instante of dentro) {
      const data = new Date(instante);
      expect(diaNegocio(data)).toBe("2026-07-16");
      expect(data >= inicio && data < fim).toBe(true);
    }
    for (const instante of fora) {
      const data = new Date(instante);
      expect(diaNegocio(data)).not.toBe("2026-07-16");
      expect(data >= inicio && data < fim).toBe(false);
    }
  });
});

describe("somarDias", () => {
  it("anda no calendario sem depender do fuso da maquina", () => {
    expect(somarDias("2026-07-16", 1)).toBe("2026-07-17");
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
  });
});
