import { describe, expect, it } from "vitest";
import { montarCsvCatalogo } from "../../api/src/produtos/produtos-csv.js";

describe("CSV do catálogo de produtos", () => {
  it("preserva zeros dos códigos, decimal pt-BR e escapa texto de fórmula", () => {
    const csv = montarCsvCatalogo([
      {
        id: "produto-1",
        loja: "TNP",
        codigo: "00012",
        codigoBarras: "000789123",
        codigoInterno: "00131",
        produtoBaseId: null,
        nome: '=HYPERLINK("https://exemplo.invalid")',
        descricao: "Nome legado",
        grupo: "MERCEARIA",
        tipo: "revenda",
        status: "ativo",
        custo: "2.50",
        precoVenda: "4.00",
        margem: "0.3000",
        quantidade: "500.000",
        medidaBase: "g",
        quantidadeCaixa: 1,
        ncm: "12345678",
        cest: null,
        categoria: null,
        cstPisCofins: "01",
        icms: "0.1800",
        reducaoIcms: null,
        aliquotaPis: "0.0165",
        aliquotaCofins: "0.0760"
      }
    ]);

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('="00012";="000789123";="00131"');
    expect(csv).toContain("'=HYPERLINK(");
    expect(csv).toContain("2,50;4,00;0,3000;500,000");
    expect(csv).toContain("ncm;cest;categoria;cst_pis_cofins");
  });
});
