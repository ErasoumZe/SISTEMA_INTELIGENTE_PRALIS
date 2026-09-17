import { describe, expect, it } from "vitest";
import type { Notificacao } from "@padaria/shared/notificacoes";
import { filtrarNotificacoes, paginaNotificacoes } from "./notificacoes";

function criar(id: string, tipo: Notificacao["tipo"], criadoEm: string): Notificacao {
  return {
    id,
    empresaId: "00000000-0000-0000-0000-000000000001",
    tipo,
    referenciaId: "00000000-0000-0000-0000-000000000002",
    titulo: id,
    valor: null,
    verificado: false,
    verificadoPor: null,
    verificadoEm: null,
    criadoEm
  };
}

describe("notificacoes", () => {
  const itens = [
    criar("quebra", "quebra_caixa", "2026-09-17T10:00:00.000Z"),
    criar("transferencia", "transferencia_divergencia", "2026-09-16T10:00:00.000Z"),
    criar("prazo", "transferencia_prazo_confirmacao", "2026-09-15T10:00:00.000Z")
  ];

  it("filtra por categoria e intervalo de datas", () => {
    expect(
      filtrarNotificacoes(itens, {
        tipo: "transferencia_divergencia",
        dataInicio: "2026-09-16",
        dataFim: "2026-09-16"
      }).map((item) => item.id)
    ).toEqual(["transferencia"]);
  });

  it("pagina a fila", () => {
    const resultado = paginaNotificacoes(itens, 2, 2);
    expect(resultado.totalPaginas).toBe(2);
    expect(resultado.itens.map((item) => item.id)).toEqual(["prazo"]);
  });
});
