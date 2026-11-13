import { describe, expect, it } from "vitest";
import {
  arvoreGruposMercadoria,
  grupoDoRegistro,
  liberadoCompraAoCriar,
  liberadoCompraAoGravar,
  rotuloGrupoMercadoria,
  separarGrupoMercadoria
} from "../../shared/src/produtos/index.js";

describe("grupo e subgrupo de mercadoria (13/11/2026, igual ao S2)", () => {
  it("separa no primeiro ' - ' e tira o prefixo MER", () => {
    expect(separarGrupoMercadoria("MER BEBIDAS - SUCOS")).toEqual({ grupo: "BEBIDAS", subgrupo: "SUCOS" });
    expect(separarGrupoMercadoria("MER. BEBIDAS - SUCOS")).toEqual({ grupo: "BEBIDAS", subgrupo: "SUCOS" });
    expect(separarGrupoMercadoria("MER CIGARROS - ACESSORIOS: CEDA/ISQUEIRO/ETC")).toEqual({
      grupo: "CIGARROS",
      subgrupo: "ACESSORIOS: CEDA/ISQUEIRO/ETC"
    });
    expect(separarGrupoMercadoria("MER FAB. PRÓPRIA - BEBIDAS/COPA")).toEqual({
      grupo: "FAB. PRÓPRIA",
      subgrupo: "BEBIDAS/COPA"
    });
  });

  it("grupo sem ' - ' não tem subgrupo e mantém o nome", () => {
    expect(separarGrupoMercadoria("Insumos")).toEqual({ grupo: "Insumos", subgrupo: "" });
    expect(separarGrupoMercadoria("  ")).toEqual({ grupo: "", subgrupo: "" });
    expect(separarGrupoMercadoria(null)).toEqual({ grupo: "", subgrupo: "" });
  });

  it("não confunde hífen sem espaço com o separador", () => {
    expect(separarGrupoMercadoria("MER PÃO-DE-QUEIJO")).toEqual({ grupo: "PÃO-DE-QUEIJO", subgrupo: "" });
  });

  it("rótulo de leitura", () => {
    expect(rotuloGrupoMercadoria("MER BEBIDAS - SUCOS")).toBe("BEBIDAS › SUCOS");
    expect(rotuloGrupoMercadoria("Insumos")).toBe("Insumos");
  });

  it("monta a árvore juntando o mesmo grupo sem diferenciar acento e caixa", () => {
    const arvore = arvoreGruposMercadoria([
      { id: "s", nome: "MER BEBIDAS - SUCOS" },
      { id: "a", nome: "MER BEBIDAS - ÁGUAS" },
      { id: "e", nome: "Embalagens" },
      { id: "p", nome: "MER EMBALAGENS - PAPEL" },
      { id: "i", nome: "Insumos" }
    ]);
    expect(arvore.map((g) => g.grupo)).toEqual(["BEBIDAS", "EMBALAGENS", "Insumos"]);
    expect(arvore[0]!.subgrupos.map((s) => s.subgrupo)).toEqual(["ÁGUAS", "SUCOS"]);
    // O registro sem subgrupo vem primeiro dentro do grupo.
    expect(arvore[1]!.subgrupos.map((s) => s.id)).toEqual(["e", "p"]);
    expect(grupoDoRegistro(arvore, "p")?.grupo).toBe("EMBALAGENS");
    expect(grupoDoRegistro(arvore, "x")).toBeNull();
    expect(grupoDoRegistro(arvore, null)).toBeNull();
  });
});

describe("liberado para compra (13/11/2026, igual ao S2)", () => {
  it("revenda nova nasce liberada; transformação nasce desligada", () => {
    expect(liberadoCompraAoCriar("revenda")).toBe(true);
    expect(liberadoCompraAoCriar("transformacao")).toBe(false);
    expect(liberadoCompraAoCriar(undefined)).toBe(false);
  });

  it("inativo nunca fica liberado", () => {
    expect(liberadoCompraAoGravar("inativo", true)).toBe(false);
    expect(liberadoCompraAoGravar("ativo", true)).toBe(true);
    expect(liberadoCompraAoGravar("ativo", false)).toBe(false);
  });
});
