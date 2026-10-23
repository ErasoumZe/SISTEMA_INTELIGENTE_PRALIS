import { describe, expect, it } from "vitest";
import { expiracaoCotacao, ratear } from "@padaria/shared/compras";

/**
 * O que a rodada (R-221) herdou da cotacao por link (R-216, removida no E8): o prazo em dias uteis e o
 * rateio pelo maior resto, que reparte o frete da proposta entre os itens livres. Cada caso diz a
 * conta, para quem ler discordar da REGRA e nao so do resultado.
 */
describe("prazo da rodada em dias uteis", () => {
  // Segunda 12/10/2026, 10h em Sao Paulo. Conta terca 13 (1) e quarta 14 (2): vale ate o fim da
  // quarta, ou seja, meia-noite local de quinta 15/10 = 03:00Z. (12/10 e feriado nacional: sem
  // calendario de feriados, o sistema conta como dia comum — limite registrado na R-216.)
  it("enviado na segunda vale ate o fim da quarta", () => {
    expect(expiracaoCotacao(new Date("2026-10-12T13:00:00Z")).toISOString()).toBe("2026-10-15T03:00:00.000Z");
  });

  // Sexta 16/10: sabado e domingo nao contam; segunda (1), terca (2).
  it("enviado na sexta vale ate o fim da terca", () => {
    expect(expiracaoCotacao(new Date("2026-10-16T15:00:00Z")).toISOString()).toBe("2026-10-21T03:00:00.000Z");
  });

  it("enviado no sabado tambem vale ate o fim da terca", () => {
    expect(expiracaoCotacao(new Date("2026-10-17T15:00:00Z")).toISOString()).toBe("2026-10-21T03:00:00.000Z");
  });

  // 23h30 de domingo em Sao Paulo ja e segunda em UTC. O dia que conta e o do negocio (domingo).
  it("usa o dia do negocio, nao o dia em UTC", () => {
    expect(expiracaoCotacao(new Date("2026-10-19T02:30:00Z")).toISOString()).toBe("2026-10-21T03:00:00.000Z");
  });
});

describe("ratear (maior resto)", () => {
  it("a soma das fatias e SEMPRE exatamente o valor rateado, sem perder centavo", () => {
    // R$ 1,00 (100 centavos) entre tres itens de peso igual: 34 + 33 + 33.
    const fatias = ratear(100, [1000, 1000, 1000]);
    expect(fatias.reduce((soma, fatia) => soma + fatia, 0)).toBe(100);
    expect([...fatias].sort()).toEqual([33, 33, 34]);
  });

  it("proporcional ao peso: o item de maior valor leva a maior parte", () => {
    // 300 centavos entre pesos 2000 e 1000: 200 e 100.
    expect(ratear(300, [2000, 1000])).toEqual([200, 100]);
  });

  it("centavo impar vai inteiro para o maior resto; empate fica com o primeiro", () => {
    expect(ratear(1, [1000, 2000])).toEqual([0, 1]);
    expect(ratear(1, [1000, 1000])).toEqual([1, 0]);
  });

  it("sem valor ou sem peso nao ha o que ratear", () => {
    expect(ratear(0, [1000, 1000])).toEqual([0, 0]);
    expect(ratear(500, [0, 0])).toEqual([0, 0]);
    expect(ratear(-5, [1000])).toEqual([0]);
  });
});
