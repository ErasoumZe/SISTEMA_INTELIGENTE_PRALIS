import { describe, expect, it } from "vitest";
import { corRgbMenuSchema, estruturaMenuEmpresaSchema } from "@padaria/shared";
import { contrasteRgb, estiloCorRgbMenu, textoRgbAcessivel } from "./menu-cor-rgb";

describe("cor RGB do menu", () => {
  it("aceita somente os tres canais inteiros entre 0 e 255", () => {
    expect(corRgbMenuSchema.safeParse({ r: 0, g: 128, b: 255 }).success).toBe(true);
    for (const cor of [{ r: -1, g: 0, b: 0 }, { r: 0, g: 256, b: 0 }, { r: 0, g: 1.5, b: 0 }, { r: "0", g: 0, b: 0 }]) {
      expect(corRgbMenuSchema.safeParse(cor).success).toBe(false);
    }
  });

  it("mantem RGB no contrato e ajusta a escrita para contraste", () => {
    const cor = { r: 18, g: 76, b: 210 };
    const estrutura = {
      versao: 1,
      secoes: [{ id: "operacao", titulo: "Operacao", cor: "neutro", corRgb: cor, ids: ["caixa"] }]
    };

    expect(estruturaMenuEmpresaSchema.safeParse(estrutura).success).toBe(true);
    expect(estiloCorRgbMenu(cor, true).faixa).toBe("rgb(18 76 210)");
    expect(contrasteRgb(textoRgbAcessivel(cor, true), [20, 25, 33])).toBeGreaterThanOrEqual(4.5);
    expect(contrasteRgb(textoRgbAcessivel(cor, false), [255, 255, 255])).toBeGreaterThanOrEqual(4.5);
  });
});
