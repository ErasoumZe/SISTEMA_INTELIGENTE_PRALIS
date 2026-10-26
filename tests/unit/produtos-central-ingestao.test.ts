import { describe, expect, it } from "vitest";
import { prepararArquivosCentral } from "@padaria/shared/produtos";

describe("prepararArquivosCentral", () => {
  it("gera grupos candidatos e sinaliza EAN conflitante sem gravar decisões", () => {
    const resultado = prepararArquivosCentral([
      {
        fonte: "compilart_tnp",
        conteudo: "COD_INTERNO;COD_BARRAS;NOME;ATIVO\n1;789123;CHA LIMAO;Sim\n2;789123;CHA PESSEGO;Sim"
      }
    ]);

    expect(resultado.fontes).toEqual([{ fonte: "compilart_tnp", linhas: 2 }]);
    expect(resultado.barrasConflitantes).toEqual([{ chave: "789123", nomes: ["CHA LIMAO", "CHA PESSEGO"] }]);
    expect(resultado.grupos).toHaveLength(1);
    expect(resultado.grupos[0]?.alertas.codigoBarrasConflitante).toBe(true);
    expect(resultado).not.toHaveProperty("decisao");
  });

  it("rejeita repetir a mesma fonte na carga para evitar merge silencioso de arquivos", () => {
    const arquivo = { fonte: "sia_li" as const, conteudo: "CODITEM;COD_BARRAS;NOME\n1;123;PRODUTO" };
    expect(() => prepararArquivosCentral([arquivo, arquivo])).toThrow("foi enviada mais de uma vez");
  });

  it("marca EAN ambíguo somente quando nomes diferentes aparecem na mesma fonte", () => {
    const resultado = prepararArquivosCentral([
      { fonte: "sia_li", conteudo: "CODITEM;COD_BARRAS;NOME\n1;789123;CHA LIMAO" },
      { fonte: "compilart_tnp", conteudo: "COD_INTERNO;COD_BARRAS;NOME\n2;789123;CHA PESSEGO" }
    ]);

    expect(resultado.barrasConflitantes).toEqual([]);
    expect(resultado.grupos[0]?.alertas.nomesDivergentes).toBe(true);
    expect(resultado.grupos[0]?.alertas.codigoBarrasConflitante).toBe(false);
  });
});
