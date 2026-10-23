import { describe, expect, it } from "vitest";
import { COLUNAS_CONPLUS, valorDaColuna } from "../../web-vue/utils/conplus-layouts.js";

describe("layouts visuais Conplus", () => {
  it("reproduz todos os eventos da folha 05 e seus agrupamentos", () => {
    expect(COLUNAS_CONPLUS.folha_05).toContain("1 — Horas Normais Diurnas — Natureza");
    expect(COLUNAS_CONPLUS.folha_05).toContain("4004 — Valor Líquido Negativo na Rescisão — Valor");
    expect(COLUNAS_CONPLUS.folha_05).toContain("FGTS GRRF — Valor");
    expect(COLUNAS_CONPLUS.folha_05.length).toBe(17 + 97 * 3 + 4 + 12 + 8);
  });

  it("mantém os quatro eventos oficiais do adiantamento 20", () => {
    expect(COLUNAS_CONPLUS.adiantamento_20).toContain("80 — Adiantamento Salarial — Natureza");
    expect(COLUNAS_CONPLUS.adiantamento_20).toContain(
      "4006 — Provisão Empréstimo Crédito do Trabalhador- Adto — Valor"
    );
    expect(COLUNAS_CONPLUS.adiantamento_20).toContain("IRRF — Lucro");
  });

  it("exibe os dados importados nas colunas de rescisões e férias", () => {
    expect(valorDaColuna("rescisoes", { contrato: "001", empregado: "Fictício" }, "Código\n(Funcionário)")).toBe("001");
    expect(valorDaColuna("ferias", { empregado: "Fictício", quantidade: "10" }, "Qtd.")).toBe("10");
    expect(COLUNAS_CONPLUS.ferias).toContain("Mês");
  });
});
