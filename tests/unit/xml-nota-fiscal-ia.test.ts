import { describe, expect, it } from "vitest";
import { extrairNotaFiscalDoXml } from "../../api/src/discriminacao-ia/xml-nota-fiscal.js";

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe><infNFe Id="NFe32260828126928000136550070007649911482827851" versao="4.00">
    <ide><nNF>764991</nNF><serie>7</serie><dhEmi>2026-08-31T19:44:44-03:00</dhEmi></ide>
    <emit><CNPJ>28.126.928/0001-36</CNPJ><xNome>Buaiz S/A</xNome></emit>
    <dest><CNPJ>08.351.168/0001-53</CNPJ><xNome>COML TUDONOPAO</xNome></dest>
    <det nItem="1"><prod><cProd>16</cProd><cEAN>7896093301512</cEAN><xProd>SEMOLADA EXTRA CLARA 25 KG</xProd><qCom>12.0000</qCom><vUnCom>89.0000000000</vUnCom><vProd>1068.00</vProd><vDesc>0.00</vDesc></prod></det>
    <total><ICMSTot><vProd>1068.00</vProd><vDesc>0.00</vDesc><vFrete>0.00</vFrete><vNF>1068.00</vNF></ICMSTot></total>
  </infNFe></NFe>
</nfeProc>`;

describe("leitura local de XML de NF-e", () => {
  it("mapeia fornecedor, chave, item e totais para o contrato da IA", () => {
    const resultado = extrairNotaFiscalDoXml(xml);
    expect(resultado.fornecedorCnpj).toBe("28126928000136");
    expect(resultado.numero).toBe("764991");
    expect(resultado.dataEmissao).toBe("2026-08-31");
    expect(resultado.chaveAcesso).toBe("32260828126928000136550070007649911482827851");
    expect(resultado.itens).toHaveLength(1);
    expect(resultado.itens[0]).toMatchObject({
      ean: "7896093301512",
      quantidade: "12",
      valorUnitario: "89",
      valorTotal: "1068"
    });
    expect(resultado.valorTotal).toBe("1068");
  });
});
