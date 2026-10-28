import { describe, expect, it } from "vitest";
import { ErroFonteCentral, lerFonteProdutosCentral, parseCsvCentral } from "@padaria/shared/produtos";

describe("leitura de arquivos da Central de Produtos", () => {
  it("lê CSV com BOM, aspas, separador dentro do nome e preserva a linha original", () => {
    const csv = '\uFEFFCOD_BARRAS;NOME;ATIVO\r\n789;"CAFÉ; MOÍDO";A\r\n';
    const resultado = lerFonteProdutosCentral("compilart_tnp", csv);

    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toMatchObject({
      loja: "TNP",
      codigoBarras: "789",
      nome: "CAFÉ; MOÍDO",
      ativo: true,
      custo: null,
      fiscal: null
    });
    expect(resultado[0]?.raw["NOME"]).toBe("CAFÉ; MOÍDO");
  });

  it("preserva conteúdo fiscal da origem literalmente e deixa demais campos ausentes como null", () => {
    const csv = [
      "COD_INTERNO;COD_BARRAS;NOME;NCM;CST;CSOSN;ALIQ_ECF;REDUCAO;ALIQ_INTERNA",
      '456;000789;BISCOITO;19059090;="040";102;18,00;0,00;18,00'
    ].join("\n");
    const [produto] = lerFonteProdutosCentral("sia_li", csv);

    expect(produto?.loja).toBe("LI");
    expect(produto?.codigoBarras).toBe("000789");
    expect(produto?.fiscal).toMatchObject({
      ncm: "19059090",
      cstPisCofins: "040",
      csosn: "102",
      aliquotaEcf: "18,00",
      reducaoIcms: "0,00",
      icms: "18,00",
      cest: null,
      cstReforma: null
    });
  });

  it("rejeita aspas sem fechamento e cabeçalho sem identificador", () => {
    expect(() => parseCsvCentral('NOME;COD_BARRAS\n"Produto;789')).toThrowError(/aspas/u);
    expect(() => lerFonteProdutosCentral("sia_li", "NOME;GRUPO\nProduto;Mercearia")).toThrowError(ErroFonteCentral);
  });

  it("não aceita cabeçalho duplicado nem linha sem identidade", () => {
    expect(() => lerFonteProdutosCentral("planilha_tnp", "NOME;NOME;COD_INTERNO\nA;B;1")).toThrowError(/duplicados/u);
    expect(() => lerFonteProdutosCentral("vendidos_tnp", "NOME;COD_BARRAS;ATIVO\n;;A")).toThrowError(/linha 2/u);
  });
});
