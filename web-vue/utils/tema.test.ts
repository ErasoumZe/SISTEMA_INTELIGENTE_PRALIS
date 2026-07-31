import { describe, expect, it } from "vitest";
import type { ConfiguracaoAparenciaEmpresa, TemaAplicacao } from "@padaria/shared";
import {
  corCategoriaPorTela,
  corMenuTela,
  diferencasTema,
  inkParaSuperficie,
  montarConfiguracaoAparencia,
  padraoComIdentidade,
  resolverTemaDeConfiguracao
} from "./tema";

const padrao: TemaAplicacao = {
  corPrimaria: "#111111",
  corSecundaria: "#222222",
  corFundo: "#333333",
  corCartao: "#444444",
  corSucesso: "#555555",
  corAviso: "#666666",
  corErro: "#777777"
};

describe("diferencasTema", () => {
  it("retorna so os campos que diferem do padrao", () => {
    expect(diferencasTema({ ...padrao, corPrimaria: "#000000" }, padrao)).toEqual({ corPrimaria: "#000000" });
    expect(diferencasTema(padrao, padrao)).toEqual({});
  });
});

describe("resolverTemaDeConfiguracao", () => {
  const config: ConfiguracaoAparenciaEmpresa = {
    padrao,
    especifico: [{ pagina: "caixa", propriedades: { corPrimaria: "#abcabc" } }]
  };

  it("null quando nao ha configuracao", () => {
    expect(resolverTemaDeConfiguracao(null, "caixa")).toBeNull();
  });

  it("padrao retorna copia do padrao", () => {
    expect(resolverTemaDeConfiguracao(config, "padrao")).toEqual(padrao);
  });

  it("tela especifica mescla padrao + propriedades da pagina", () => {
    expect(resolverTemaDeConfiguracao(config, "caixa")).toEqual({ ...padrao, corPrimaria: "#abcabc" });
  });

  it("tela sem especifico cai no padrao", () => {
    expect(resolverTemaDeConfiguracao(config, "relatorios")).toEqual(padrao);
  });

  it("tela categorizada sem especifico usa a cor da categoria sobre o padrao", () => {
    expect(resolverTemaDeConfiguracao(config, "entradas")).toEqual({
      ...padrao,
      corPrimaria: corCategoriaPorTela["entradas"]
    });
    expect(resolverTemaDeConfiguracao(config, "mercadorias")).toEqual({
      ...padrao,
      corPrimaria: corCategoriaPorTela["mercadorias"]
    });
  });

  it("especifico da empresa vence o default de categoria", () => {
    const configComEspecifico: ConfiguracaoAparenciaEmpresa = {
      padrao,
      especifico: [{ pagina: "retiradas", propriedades: { corPrimaria: "#aabbcc" } }]
    };
    expect(resolverTemaDeConfiguracao(configComEspecifico, "retiradas")).toEqual({
      ...padrao,
      corPrimaria: "#aabbcc"
    });
  });

  it("default de categoria so muda a cor primaria (fundo/cartao seguem o padrao)", () => {
    const tema = resolverTemaDeConfiguracao(config, "transferencias");
    expect(tema?.corPrimaria).toBe(corCategoriaPorTela["transferencias"]);
    expect(tema?.corFundo).toBe(padrao.corFundo);
    expect(tema?.corCartao).toBe(padrao.corCartao);
  });
});

describe("padraoComIdentidade", () => {
  const roxoFabrica: TemaAplicacao = { ...padrao, corPrimaria: "#6d28d9", corSecundaria: "#0891b2" };
  const laranjaFabrica: TemaAplicacao = { ...padrao, corPrimaria: "#c0521d", corSecundaria: "#b8480f" };

  it("troca as cores de fabrica (roxo/teal) pela marca neutra", () => {
    const efetivo = padraoComIdentidade(roxoFabrica);
    expect(efetivo.corPrimaria).toBe("#6515dd");
    expect(efetivo.corSecundaria).toBe("#35128c");
  });

  it("troca o acento legado persistido pela marca neutra", () => {
    const efetivo = padraoComIdentidade(laranjaFabrica);
    expect(efetivo.corPrimaria).toBe("#6515dd");
    expect(efetivo.corSecundaria).toBe("#35128c");
  });

  it("mantem cores personalizadas (campo a campo)", () => {
    expect(padraoComIdentidade(padrao)).toEqual(padrao);
    const soPrimariaCustom: TemaAplicacao = { ...padrao, corSecundaria: "#0891b2" };
    const efetivo = padraoComIdentidade(soPrimariaCustom);
    expect(efetivo.corPrimaria).toBe(padrao.corPrimaria);
    expect(efetivo.corSecundaria).toBe("#35128c");
  });

  it("resolver aplica a identidade sobre o padrao de fabrica", () => {
    const config: ConfiguracaoAparenciaEmpresa = { padrao: roxoFabrica, especifico: [] };
    expect(resolverTemaDeConfiguracao(config, "padrao")?.corPrimaria).toBe("#6515dd");
  });
});

describe("inkParaSuperficie", () => {
  it("cartao claro -> texto escuro", () => {
    expect(inkParaSuperficie("#ffffff").ink).toBe("#2f2320");
    expect(inkParaSuperficie("#eaf1f9").ink).toBe("#2f2320");
  });

  it("cartao escuro -> texto claro", () => {
    expect(inkParaSuperficie("#191f26").ink).toBe("#f7f5f2");
    expect(inkParaSuperficie("#2f2320").ink).toBe("#f7f5f2");
  });

  it("hex invalido cai no texto escuro (fundo claro)", () => {
    expect(inkParaSuperficie("nao-hex").ink).toBe("#2f2320");
  });
});

describe("corMenuTela", () => {
  const config: ConfiguracaoAparenciaEmpresa = {
    padrao,
    especifico: [{ pagina: "despesas", propriedades: { corPrimaria: "#aa00aa" } }]
  };

  it("tela categorizada usa a cor da categoria", () => {
    expect(corMenuTela(config, "entradas")).toBe(corCategoriaPorTela["entradas"]);
  });

  it("tela personalizada usa a cor do especifico", () => {
    expect(corMenuTela(config, "despesas")).toBe("#aa00aa");
  });

  it("tela igual ao padrao fica neutra (undefined)", () => {
    expect(corMenuTela(config, "clientes")).toBeUndefined();
  });

  it("sem configuracao cai na cor estatica da categoria", () => {
    expect(corMenuTela(null, "mercadorias")).toBe(corCategoriaPorTela["mercadorias"]);
    expect(corMenuTela(null, "clientes")).toBeUndefined();
  });
});

describe("montarConfiguracaoAparencia", () => {
  it("editar uma tela grava so o diff dela como especifico", () => {
    const atual: ConfiguracaoAparenciaEmpresa = { padrao, especifico: [] };
    const nova = montarConfiguracaoAparencia(atual, "caixa", { ...padrao, corAviso: "#ff0000" });
    expect(nova.padrao).toEqual(padrao);
    expect(nova.especifico).toEqual([{ pagina: "caixa", propriedades: { corAviso: "#ff0000" } }]);
  });

  it("editar uma tela igual ao padrao remove o especifico", () => {
    const atual: ConfiguracaoAparenciaEmpresa = {
      padrao,
      especifico: [{ pagina: "caixa", propriedades: { corAviso: "#ff0000" } }]
    };
    const nova = montarConfiguracaoAparencia(atual, "caixa", padrao);
    expect(nova.especifico).toEqual([]);
  });

  it("salvar tela categorizada sem mudar nada NAO grava especifico (diff contra a base da tela)", () => {
    const atual: ConfiguracaoAparenciaEmpresa = { padrao, especifico: [] };
    const baseEntradas: TemaAplicacao = { ...padrao, corPrimaria: corCategoriaPorTela["entradas"] ?? "" };
    const nova = montarConfiguracaoAparencia(atual, "entradas", baseEntradas);
    expect(nova.especifico).toEqual([]);
  });

  it("personalizar tela categorizada grava so o diff contra a base (categoria inclusa)", () => {
    const atual: ConfiguracaoAparenciaEmpresa = { padrao, especifico: [] };
    const tema: TemaAplicacao = { ...padrao, corPrimaria: "#123456" };
    const nova = montarConfiguracaoAparencia(atual, "entradas", tema);
    expect(nova.especifico).toEqual([{ pagina: "entradas", propriedades: { corPrimaria: "#123456" } }]);
  });

  it("editar o padrao recalcula os especificos como diff sobre o novo padrao", () => {
    const atual: ConfiguracaoAparenciaEmpresa = {
      padrao,
      especifico: [
        { pagina: "caixa", propriedades: { corPrimaria: "#abcabc" } },
        { pagina: "resumo", propriedades: { corPrimaria: padrao.corPrimaria } }
      ]
    };
    const novoPadrao: TemaAplicacao = { ...padrao, corFundo: "#eeeeee" };
    const nova = montarConfiguracaoAparencia(atual, "padrao", novoPadrao);
    expect(nova.padrao).toEqual(novoPadrao);
    // caixa mantem o override de corPrimaria; resumo (que so repetia o padrao antigo) some.
    expect(nova.especifico).toEqual([{ pagina: "caixa", propriedades: { corPrimaria: "#abcabc" } }]);
  });
});
