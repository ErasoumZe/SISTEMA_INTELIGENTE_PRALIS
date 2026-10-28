import { describe, expect, it } from "vitest";
import {
  calcularProximoCodigoInterno,
  codigoInternoHerdadoDisponivel,
  PRIMEIRO_CODIGO_FORA_DA_FAIXA,
  ULTIMO_CODIGO_DE_PRODUTO
} from "../../api/src/produtos/codigo-interno.js";

describe("código interno de produtos (R-222)", () => {
  it("começa em 13130 quando não há código da faixa", () => {
    expect(calcularProximoCodigoInterno(0)).toBe("13130");
  });

  it("continua depois do maior código da faixa, ignorando a faixa alta", () => {
    expect(calcularProximoCodigoInterno(13_130)).toBe("13131");
    expect(calcularProximoCodigoInterno(699_998)).toBe("699999");
  });

  it("nunca usa códigos reservados para entrega/equipamento", () => {
    expect(() => calcularProximoCodigoInterno(PRIMEIRO_CODIGO_FORA_DA_FAIXA - 1)).toThrow(/esgotada/);
    expect(calcularProximoCodigoInterno(PRIMEIRO_CODIGO_FORA_DA_FAIXA)).toBe("13130");
  });

  it("não volta ao piso histórico nem trunca códigos com mais de cinco dígitos", () => {
    expect(calcularProximoCodigoInterno(442)).toBe(String(ULTIMO_CODIGO_DE_PRODUTO + 1));
    expect(calcularProximoCodigoInterno(99_999)).toBe("100000");
  });

  it("preserva o código de origem quando ainda está livre na empresa destino", () => {
    expect(codigoInternoHerdadoDisponivel(" 00131 ", new Set(["00130"]))).toBe("00131");
  });

  it("pede novo código quando o código da origem está ocupado ou ausente", () => {
    const usados = new Set(["00131"]);
    expect(codigoInternoHerdadoDisponivel("00131", usados)).toBeNull();
    expect(codigoInternoHerdadoDisponivel(null, usados)).toBeNull();
    expect(codigoInternoHerdadoDisponivel("   ", usados)).toBeNull();
  });
});
