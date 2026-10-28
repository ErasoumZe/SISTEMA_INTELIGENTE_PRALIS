import { describe, expect, it } from "vitest";
import {
  catalogoDoDeParaSia,
  chaveDeBarras,
  lerCsvDoSia,
  lerDeParaSia,
  mapearColunasDoSia,
  recusaDoDeParaSia,
  temColunasDoSia
} from "@padaria/shared/produtos";

// Casos portados de `sia-depara.parser.test.ts` do app oficial (R-222): mesmas entradas, mesmo resultado.
const cabecalho = [
  "Curva ABC Valor",
  "Cód. produto",
  "Cód. barras",
  "Descrição",
  "Cód. grupo",
  "Alíq. Saída",
  "% Redução",
  "Alíq. interna",
  "CST Saída",
  "CSOSN_EMPRESA",
  "NCM",
  "Ativo"
];
const linha = (coditem: string, barras: string, reducao = "0") => [
  "A",
  coditem,
  barras,
  "PRODUTO",
  "0005",
  "3",
  reducao,
  "18",
  "000",
  "101",
  "19059090",
  "S"
];
const comBalanca = [...cabecalho, "Pesável", "Tecla", "Validade"];

describe("de-para SIA — chave de barras", () => {
  it("tira pontuacao e zeros a esquerda", () => {
    expect(chaveDeBarras("00000000010000")).toBe("10000");
    expect(chaveDeBarras("789.114-910/0828")).toBe("7891149100828");
    expect(chaveDeBarras("")).toBe("");
    expect(chaveDeBarras(null)).toBe("");
    expect(chaveDeBarras("0000")).toBe("0");
  });
});

describe("de-para SIA — colunas", () => {
  it("acha as colunas por nome, fora de ordem, e diz quais faltam", () => {
    expect(mapearColunasDoSia(cabecalho)).toMatchObject({ coditem: 1, codigoBarras: 2, aliqSaidaEcf: 5 });
    const trocado = [...cabecalho].reverse();
    expect(mapearColunasDoSia(trocado).coditem).toBe(trocado.indexOf("Cód. produto"));
    expect(() => mapearColunasDoSia(["Cód. produto", "Descrição"])).toThrow(/codigoBarras/u);
  });

  it("aceita os cabecalhos do CSV normalizado", () => {
    expect(
      mapearColunasDoSia([
        "CODITEM",
        "COD_BARRAS",
        "NOME",
        "ATIVO",
        "ALIQ_ECF",
        "CST",
        "CSOSN",
        "NCM",
        "REDUCAO",
        "ALIQ_INTERNA",
        "GRUPO"
      ])
    ).toMatchObject({ coditem: 0, codigoBarras: 1, descricao: 2, aliqSaidaEcf: 4, codGrupo: 10 });
  });

  it("reconhece a BASE SIA FULL com o cabecalho na segunda linha", () => {
    expect(temColunasDoSia([cabecalho.map((_, i) => `COL${i}`), cabecalho])).toBe(true);
    expect(temColunasDoSia([["qualquer", "coisa"]])).toBe(false);
  });
});

describe("de-para SIA — leitura", () => {
  it("le Pesavel, Tecla e Validade da segunda linha de cabecalho", () => {
    const r = lerDeParaSia([
      cabecalho.map((_, i) => `COL${i}`),
      comBalanca,
      [...linha("13535", "2123456789012"), "S", "35", "3"]
    ]);
    expect(r.linhas[0]).toMatchObject({ coditem: "13535", pesavel: "S", teclaBalanca: "35", validadeBalanca: "3" });
  });

  it("pesavel sem tecla recebe 000; sem validade continua faltando", () => {
    const r = lerDeParaSia([
      comBalanca,
      [...linha("13535", "2123456789012"), "S", "", "3"],
      [...linha("13536", "2123456789029"), "S", "", ""]
    ]);
    expect(r.teclaAssumida).toEqual(["13535"]);
    expect(r.linhas[0]).toMatchObject({ teclaBalanca: "000", validadeBalanca: "3" });
    expect(r.linhas[1]?.teclaBalanca).toBeNull();
    expect(catalogoDoDeParaSia(r).semDadosBalanca).toBe(1);
  });

  it("nao pesavel fica sem tecla; ausencia de Pesavel nao vira N", () => {
    const naoPesavel = lerDeParaSia([comBalanca, [...linha("1", "111"), "N", "", ""]]);
    expect(naoPesavel.linhas[0]).toMatchObject({ pesavel: "N", teclaBalanca: null, validadeBalanca: null });
    const semColuna = lerDeParaSia([cabecalho, linha("2", "222")]);
    expect(semColuna.linhas[0]?.pesavel).toBeNull();
    expect(catalogoDoDeParaSia(semColuna).semDadosBalanca).toBe(1);
  });

  it("recusa Pesavel fora de S/N e tecla com mais de tres digitos", () => {
    expect(() => lerDeParaSia([comBalanca, [...linha("1", "111"), "X", "", ""]])).toThrow(/S ou N/u);
    expect(() => lerDeParaSia([comBalanca, [...linha("1", "111"), "S", "1234", "3"]])).toThrow(/três dígitos/u);
  });

  it("normaliza a chave, conta sem barras, pula linha sem coditem e trata reducao", () => {
    const r = lerDeParaSia([
      cabecalho,
      linha("10000", "00000000010000", "53,33"),
      linha("10001", ""),
      linha("", "999"),
      linha("10002", "222", "n/a")
    ]);
    expect(r.semBarras).toBe(1);
    expect(r.linhas.map((item) => item.coditem)).toEqual(["10000", "10002"]);
    expect(r.linhas[0]).toMatchObject({ codigoBarras: "00000000010000", chaveBarras: "10000", reducao: "53.33" });
    expect(r.linhas[1]?.reducao).toBeNull();
  });
});

describe("de-para SIA — catalogo e recusas (depara-upload do oficial)", () => {
  const ler = (...linhas: string[][]) =>
    catalogoDoDeParaSia(lerDeParaSia([comBalanca, ...linhas.map((item) => [...item, "N", "", ""])]));

  it("deixa a entrega (codigo >= 700000) de fora, pelo codigo e nao pelo nome", () => {
    const catalogo = ler(linha("10000", "111"), linha("13126", "222"), linha("710518", "333"));
    expect(catalogo.linhas).toHaveLength(2);
    expect(catalogo.entrega).toBe(1);
    expect(catalogo.faixa).toEqual({ min: 10000, max: 13126 });
  });

  it("recusa barras ambiguas e coditem repetido, e passa quando esta sao", () => {
    expect(recusaDoDeParaSia(ler(linha("10000", "7891"), linha("10001", "0007891")))).toMatch(
      /apontam para mais de um produto/u
    );
    expect(recusaDoDeParaSia(ler(linha("10000", "111"), linha("10000", "222")))).toMatch(/coditem repetido/u);
    expect(recusaDoDeParaSia(ler(linha("10000", "111"), linha("10001", "222")))).toBeNull();
  });

  it("recusa arquivo so de entrega e arquivo sem barras", () => {
    expect(recusaDoDeParaSia(ler(linha("710000", "111")))).toMatch(/só tem linhas de entrega/u);
    expect(recusaDoDeParaSia(ler(linha("10000", "")))).toMatch(/nenhuma linha com código de barras/u);
  });
});

describe("de-para SIA — CSV", () => {
  it("descobre o separador, respeita aspas e tira o BOM", () => {
    const bom = String.fromCharCode(0xfeff);
    expect(lerCsvDoSia(`${bom}CODITEM;COD_BARRAS;NOME\n10000;789;"PAO; DOCE"\r\n\n10001;790;"ASPA ""X"""`)).toEqual([
      ["CODITEM", "COD_BARRAS", "NOME"],
      ["10000", "789", "PAO; DOCE"],
      ["10001", "790", 'ASPA "X"']
    ]);
    expect(lerCsvDoSia("A,B\n1,2")).toEqual([
      ["A", "B"],
      ["1", "2"]
    ]);
  });
});
