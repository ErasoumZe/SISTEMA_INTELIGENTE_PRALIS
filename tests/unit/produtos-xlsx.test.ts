import AdmZip from "adm-zip";
import { describe, expect, it } from "vitest";
import { montarXlsxCatalogo } from "../../api/src/produtos/produtos-xlsx.js";

describe("Backup XLSX do catálogo", () => {
  it("gera um workbook legível com resumo, produtos, promoções e conversões", () => {
    const arquivo = montarXlsxCatalogo({ produtos: [], promocoes: [], conversoes: [] });
    const zip = new AdmZip(arquivo);
    const workbook = zip.getEntry("xl/workbook.xml")?.getData().toString("utf8");
    const produtos = zip.getEntry("xl/worksheets/sheet2.xml")?.getData().toString("utf8");
    const resumo = zip.getEntry("xl/worksheets/sheet1.xml")?.getData().toString("utf8");

    expect(workbook).toContain('name="Resumo"');
    expect(workbook).toContain('name="Produtos"');
    expect(workbook).toContain('name="Promocoes"');
    expect(workbook).toContain('name="Conversoes"');
    expect(produtos).toContain("codigo_interno");
    expect(produtos).toContain("pesavel");
    expect(produtos).toContain("cst_pis_cofins");
    expect(produtos).toContain("transformacao_quantidade");
    expect(resumo).toContain("total_produtos");
  });
});
