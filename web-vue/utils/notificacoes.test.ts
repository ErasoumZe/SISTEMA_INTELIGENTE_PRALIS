import { describe, expect, it } from "vitest";
import type { Notificacao } from "@padaria/shared/notificacoes";
import { limitarNotificacoesDoSino, separarNotificacoes } from "./notificacoes";

function notificacao(id: string, verificado: boolean): Notificacao {
  return {
    id,
    empresaId: "11111111-1111-4111-8111-111111111112",
    tipo: "quebra_caixa",
    referenciaId: "11111111-1111-4111-8111-111111111113",
    titulo: `Quebra ${id}`,
    valor: -50,
    verificado,
    verificadoPor: verificado ? "11111111-1111-4111-8111-111111111114" : null,
    verificadoEm: verificado ? "2026-09-14T20:52:00.000Z" : null,
    criadoEm: "2026-09-14T20:51:00.000Z"
  };
}

describe("separarNotificacoes", () => {
  it("deriva as pendentes do historico sem uma segunda ida a API", () => {
    const { pendentes, historico } = separarNotificacoes([
      notificacao("a", false),
      notificacao("b", true),
      notificacao("c", false)
    ]);

    expect(pendentes.map((item) => item.id)).toEqual(["a", "c"]);
    expect(historico).toHaveLength(3);
  });

  it("preserva a ordem que a API entregou", () => {
    const { pendentes } = separarNotificacoes([
      notificacao("c", false),
      notificacao("b", true),
      notificacao("a", false)
    ]);

    expect(pendentes.map((item) => item.id)).toEqual(["c", "a"]);
  });

  it("devolve as duas listas vazias quando nao ha nada", () => {
    const { pendentes, historico } = separarNotificacoes([]);

    expect(pendentes).toEqual([]);
    expect(historico).toEqual([]);
  });
});

describe("limitarNotificacoesDoSino", () => {
  it("mantem somente as cinco mais recentes para nao travar o menu", () => {
    const itens = Array.from({ length: 7 }, (_, indice) => notificacao(String(indice), false));
    expect(limitarNotificacoesDoSino(itens).map((item) => item.id)).toEqual(["0", "1", "2", "3", "4"]);
  });
});
