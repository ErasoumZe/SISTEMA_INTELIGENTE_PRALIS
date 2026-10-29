import {
  chaveDeGrupo,
  grupoIdDoNome,
  grupoIdPreenchido,
  gruposOficiaisDaFaixa,
  lerGrupoIds
} from "@padaria/shared/produtos";
import { describe, expect, it } from "vitest";

// Casos oficiais do paralelo (`grupo-id-planilha.test.ts`), copiados literalmente (F7, doc 56).
describe("grupo ID oficial da planilha", () => {
  it("trata zero do layout como ID nao preenchido", () => {
    expect(grupoIdPreenchido("0000")).toBe(false);
    expect(grupoIdPreenchido("0")).toBe(false);
    expect(grupoIdPreenchido("")).toBe(false);
    expect(grupoIdPreenchido(null)).toBe(false);
    expect(grupoIdPreenchido("60")).toBe(true);
  });

  it("le AC/AD como texto e casa o nome sem os separadores invisiveis", () => {
    const mapa = lerGrupoIds([
      ["NOME GRUPO", "ID GRUPO"],
      ["MER ⁠MERCEARIA - ⁠HIGIENE PESSOAL", "60"],
      ["MER ⁠MERCEARIA - ⁠PRODUTOS DE LIMPEZA", "0061"]
    ]);
    expect(mapa?.get(chaveDeGrupo("MER MERCEARIA - HIGIENE PESSOAL"))).toBe("60");
    expect(mapa?.get(chaveDeGrupo("MER MERCEARIA - PRODUTOS DE LIMPEZA"))).toBe("0061");
  });

  it("nao aceita cabecalho trocado, ID invalido ou de-para ambiguo", () => {
    expect(
      lerGrupoIds([
        ["ID GRUPO", "NOME GRUPO"],
        ["60", "HIGIENE"]
      ])
    ).toBeNull();
    const mapa = lerGrupoIds([
      ["NOME GRUPO", "ID GRUPO"],
      ["HIGIENE", "60"],
      ["HIGIENE", "61"],
      ["OUTRO", "ABC"]
    ]);
    expect(mapa?.get("HIGIENE")).toBeNull();
    expect(mapa?.has("OUTRO")).toBe(false);
  });

  it("grupoIdDoNome: acha pelo nome com acento e espacos diferentes; ambiguo ou sem fonte vira null", () => {
    const mapa = lerGrupoIds([
      ["NOME GRUPO", "ID GRUPO"],
      ["PAD PADARIA - PÃES", "12"],
      ["DUPLO", "1"],
      ["DUPLO", "2"]
    ]);
    expect(grupoIdDoNome(mapa, "pad  padaria - paes")).toBe("12");
    expect(grupoIdDoNome(mapa, "DUPLO")).toBeNull();
    expect(grupoIdDoNome(mapa, "NAO EXISTE")).toBeNull();
    expect(grupoIdDoNome(null, "PAD PADARIA - PÃES")).toBeNull();
    expect(grupoIdDoNome(mapa, "")).toBeNull();
  });
});

// 29/10/2026 (fase B1): a loja recebe os grupos OFICIAIS da planilha. O nome gravado e o que a pessoa le
// (com acento), sem os separadores invisiveis nem espaco duplo; a chave de comparacao continua a mesma.
describe("grupos oficiais da faixa AC5:AD", () => {
  it("devolve nome limpo e ID, na ordem da planilha, sem linha vazia, zero ou repetida", () => {
    const grupos = gruposOficiaisDaFaixa([
      ["NOME GRUPO", "ID GRUPO"],
      [],
      ["MER ⁠BEBIDAS  - ⁠CERVEJAS", "35"],
      ["MER ⁠BEBIDAS - ⁠ÁGUAS", "38"],
      ["MER BEBIDAS - CERVEJAS", "35"],
      ["SEM ID", "0"],
      ["MER INATIVOS", "102"]
    ]);
    expect(grupos).toEqual([
      { nome: "MER BEBIDAS - CERVEJAS", id: "35" },
      { nome: "MER BEBIDAS - ÁGUAS", id: "38" },
      { nome: "MER INATIVOS", id: "102" }
    ]);
  });

  it("sem o cabecalho oficial a faixa nao serve", () => {
    expect(gruposOficiaisDaFaixa([["OUTRA", "COISA"]])).toBeNull();
  });
});
