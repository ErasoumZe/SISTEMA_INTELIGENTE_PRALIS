import { describe, expect, it } from "vitest";
import type { ConfiguracaoAparenciaEmpresa, TemaAplicacao } from "@padaria/shared";
import { diferencasTema, montarConfiguracaoAparencia, resolverTemaDeConfiguracao } from "./tema";

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
