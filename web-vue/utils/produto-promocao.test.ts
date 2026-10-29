import { describe, expect, it } from "vitest";
import { promocaoVazia } from "~/composables/produto-formulario-mapa";
import { aplicarTipoDePromocao, temPromocaoLegada, tipoDaPromocao } from "./produto-promocao";

describe("promocao unica (paralelo)", () => {
  it("sem promocao -> escolher valor cria uma; voltar a 'sem promocao' tira", () => {
    const promocoes = [] as ReturnType<typeof promocaoVazia>[];
    expect(tipoDaPromocao(promocoes)).toBe("nenhum");
    aplicarTipoDePromocao(promocoes, "valor");
    expect(promocoes).toHaveLength(1);
    expect(tipoDaPromocao(promocoes)).toBe("valor");
    aplicarTipoDePromocao(promocoes, "desconto");
    expect(promocoes).toHaveLength(1);
    expect(promocoes[0]?.tipo).toBe("desconto");
    aplicarTipoDePromocao(promocoes, "nenhum");
    expect(promocoes).toHaveLength(0);
  });

  it("promocoes legadas (mais de uma ou com validade) sao avisadas e preservadas", () => {
    const primeira = { ...promocaoVazia(), tipo: "valor" as const, valor: "5" };
    const segunda = { ...promocaoVazia(), validaAte: "2026-12-31" };
    const promocoes = [primeira, segunda];
    expect(temPromocaoLegada(promocoes)).toBe(true);
    expect(temPromocaoLegada([{ ...promocaoVazia(), validaAte: "2026-12-31" }])).toBe(true);
    expect(temPromocaoLegada([primeira])).toBe(false);
    aplicarTipoDePromocao(promocoes, "nenhum");
    expect(promocoes).toEqual([segunda]);
  });
});
