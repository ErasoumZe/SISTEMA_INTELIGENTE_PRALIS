import AdmZip from "adm-zip";
import { describe, expect, it } from "vitest";
import { lerBackupCompletoPralisXlsx } from "../../api/src/produtos/produtos-central-pralis-xlsx.js";

function celula(ref: string, valor: string) {
  return `<c r="${ref}" t="inlineStr"><is><t>${valor}</t></is></c>`;
}

function planilha(linhas: string[][]) {
  const xmlLinhas = linhas
    .map((linha, indice) => {
      const celulas = linha.map((valor, coluna) => {
        let letras = "";
        let numero = coluna + 1;
        while (numero > 0) {
          const resto = (numero - 1) % 26;
          letras = String.fromCharCode(65 + resto) + letras;
          numero = Math.floor((numero - 1) / 26);
        }
        return celula(`${letras}${indice + 1}`, valor);
      });
      return `<row r="${indice + 1}">${celulas.join("")}</row>`;
    })
    .join("");
  return `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${xmlLinhas}</sheetData></worksheet>`;
}

function arquivoXlsx(resumo: string[][], produtos: string[][], promocoes: string[][]) {
  const zip = new AdmZip();
  zip.addFile(
    "xl/workbook.xml",
    Buffer.from(
      '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        '<sheet name="Resumo" sheetId="1" r:id="rId1"/><sheet name="Produtos" sheetId="2" r:id="rId2"/>' +
        '<sheet name="Promocoes" sheetId="3" r:id="rId3"/>' +
        "</sheets></workbook>"
    )
  );
  zip.addFile(
    "xl/_rels/workbook.xml.rels",
    Buffer.from(
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Target="worksheets/sheet2.xml"/>' +
        '<Relationship Id="rId3" Target="worksheets/sheet3.xml"/>' +
        "</Relationships>"
    )
  );
  zip.addFile("xl/worksheets/sheet1.xml", Buffer.from(planilha(resumo)));
  zip.addFile("xl/worksheets/sheet2.xml", Buffer.from(planilha(produtos)));
  zip.addFile("xl/worksheets/sheet3.xml", Buffer.from(planilha(promocoes)));
  return zip.toBuffer();
}

describe("Leitura do backup completo XLSX do Cadastro de Produtos", () => {
  it("preserva códigos, fiscal, loja, campos originais e promoções no staging", () => {
    const bytes = arquivoXlsx(
      [
        ["campo", "valor"],
        ["gerado_em_utc", "2026-10-26T12:00:00.000Z"],
        ["total_produtos", "1"],
        ["total_promocoes", "1"]
      ],
      [
        [
          "id",
          "loja",
          "codigo_interno",
          "codigo_barras",
          "nome",
          "status",
          "venda_pontual",
          "ncm",
          "cst_pis_cofins",
          "aliquota_ecf_id",
          "cclass_trib",
          "icms_re",
          "foto_url"
        ],
        [
          "produto-1",
          "TNP",
          "00131",
          "000789123",
          "CAFÉ; 500G",
          "ativo",
          "4.5",
          "09012100",
          "040",
          "03",
          "000001",
          "12.5",
          "https://exemplo/foto.jpg"
        ]
      ],
      [
        [
          "produto_id",
          "loja",
          "codigo_interno",
          "produto",
          "indice",
          "tipo",
          "valor",
          "desconto_pct",
          "hora_inicio",
          "hora_fim",
          "dias",
          "desconto_ate"
        ],
        ["produto-1", "TNP", "00131", "CAFÉ; 500G", "1", "valor", "4,50", "", "08:00", "18:00", "SSSSSNN", ""]
      ]
    );

    const [produto] = lerBackupCompletoPralisXlsx(bytes);

    expect(produto).toMatchObject({
      id: "pralis:produto-1",
      idSistema: "produto-1",
      fonte: "pralis",
      loja: "TNP",
      codigoInterno: "00131",
      codigoBarras: "000789123",
      venda: "4.5",
      nome: "CAFÉ; 500G",
      ativo: true,
      fiscal: { ncm: "09012100", cstPisCofins: "040", aliquotaEcfId: "03", cClassTrib: "000001" },
      raw: {
        nome: "CAFÉ; 500G",
        icms_re: "12.5",
        foto_url: "https://exemplo/foto.jpg",
        promocoes: [
          {
            produto_id: "produto-1",
            loja: "TNP",
            codigo_interno: "00131",
            produto: "CAFÉ; 500G",
            indice: "1",
            tipo: "valor",
            valor: "4,50",
            desconto_pct: "",
            hora_inicio: "08:00",
            hora_fim: "18:00",
            dias: "SSSSSNN",
            desconto_ate: ""
          }
        ]
      }
    });
    expect(produto?.fiscal?.cest).toBeNull();
  });

  it("rejeita a repetição do mesmo ID no backup", () => {
    const bytes = arquivoXlsx(
      [
        ["campo", "valor"],
        ["gerado_em_utc", "2026-10-26T12:00:00.000Z"],
        ["total_produtos", "2"],
        ["total_promocoes", "0"]
      ],
      [
        ["id", "loja", "codigo_interno", "codigo_barras", "nome", "status"],
        ["produto-1", "BASE", "00131", "789", "CAFÉ", "ativo"],
        ["produto-1", "BASE", "00132", "790", "CAFÉ DUPLICADO", "ativo"]
      ],
      [["produto_id"]]
    );

    expect(() => lerBackupCompletoPralisXlsx(bytes)).toThrow("repete o id de produto produto-1");
  });

  it("rejeita backup truncado quando as abas divergem do resumo", () => {
    const bytes = arquivoXlsx(
      [
        ["campo", "valor"],
        ["gerado_em_utc", "2026-10-26T12:00:00.000Z"],
        ["total_produtos", "2"],
        ["total_promocoes", "0"]
      ],
      [
        ["id", "loja", "codigo_interno", "nome"],
        ["produto-1", "BASE", "00131", "CAFÉ"]
      ],
      [["produto_id"]]
    );

    expect(() => lerBackupCompletoPralisXlsx(bytes)).toThrow("O backup está incompleto");
  });
});
