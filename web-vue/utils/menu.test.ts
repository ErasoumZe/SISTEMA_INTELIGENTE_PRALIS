import { describe, expect, it } from "vitest";
import type { Permissao } from "@padaria/shared";
import { itemPorTela } from "./domain";
import { agruparTelasMenu } from "./menu";
import { usePermissoes } from "~/composables/usePermissoes";

// Regressao do bug de producao: a tela /caixa (alterar horario / solicitar autorizacao) existia e
// funcionava, mas nao aparecia no menu — quem operava caixa so chegava nela digitando a URL.
// O menu do operador = telasPermitidas (gate de permissao) agrupado por agruparTelasMenu (secoes).
function menuDoPerfil(permissoesUsuario: Permissao[], caixaAberto = true) {
  const { telasPermitidas } = usePermissoes(permissoesUsuario, caixaAberto);
  return agruparTelasMenu(telasPermitidas.value);
}

function idsDaSecao(menu: ReturnType<typeof menuDoPerfil>, titulo: string) {
  return menu.find((secao) => secao.titulo === titulo)?.itens.map((item) => item.id) ?? [];
}

describe("item de menu da tela caixa", () => {
  it("aparece para quem tem caixa_operar, na secao Entradas e antes da tela Entradas", () => {
    const menu = menuDoPerfil(["caixa_operar", "entradas_visualizar"]);
    expect(idsDaSecao(menu, "Entradas")).toEqual(["caixa", "entradas"]);
  });

  it("aparece para qualquer cargo com caixa_operar, mesmo sem as telas financeiras", () => {
    const menu = menuDoPerfil(["caixa_operar"]);
    expect(idsDaSecao(menu, "Entradas")).toEqual(["caixa"]);
  });

  it("some para quem nao tem caixa_operar, sem cair na secao Geral", () => {
    const menu = menuDoPerfil(["entradas_visualizar"]);
    expect(menu.flatMap((secao) => secao.itens).map((item) => item.id)).not.toContain("caixa");
    expect(idsDaSecao(menu, "Entradas")).toEqual(["entradas"]);
  });

  it("continua visivel com o caixa fechado (e a porta para abrir o caixa)", () => {
    const menu = menuDoPerfil(["caixa_operar"], false);
    expect(idsDaSecao(menu, "Entradas")).toContain("caixa");
  });

  it("usa o titulo e o icone do item ja declarado em domain.ts", () => {
    expect(itemPorTela["caixa"]).toMatchObject({
      titulo: "Caixa",
      permissao: "caixa_operar",
      icone: "mdi-cash-register"
    });
  });

  it("nenhuma secao repete um icone entre seus itens (icones ambiguos lado a lado)", () => {
    // Regressao original: Caixa x Fechamento tinham o mesmo icone na mesma secao. Com o menu por
    // eixo do V2 eles caem em secoes diferentes; a regra geral (icone unico por secao) cobre o caso.
    const menu = menuDoPerfil([
      "caixa_operar",
      "caixas_gerenciar",
      "entradas_visualizar",
      "fechamento_com_diferenca_visualizar",
      "transferencias_visualizar",
      "despesas_visualizar",
      "mercadorias_visualizar",
      "retiradas_visualizar",
      "contas_pagar_visualizar"
    ]);
    for (const secao of menu) {
      const icones = secao.itens.map((item) => item.icone);
      expect(icones).toEqual([...new Set(icones)]);
    }
  });
});

describe("item de menu do historico de caixas", () => {
  it("aparece para quem gerencia caixas (gerencia/admin), logo depois de Caixa", () => {
    const menu = menuDoPerfil(["caixa_operar", "caixas_gerenciar", "entradas_visualizar"]);
    expect(idsDaSecao(menu, "Entradas")).toEqual(["caixa", "historico_caixas", "entradas"]);
  });

  it("some para o operador de caixa, que so tem caixa_operar", () => {
    const menu = menuDoPerfil(["caixa_operar"]);
    expect(idsDaSecao(menu, "Entradas")).toEqual(["caixa"]);
    expect(menu.flatMap((secao) => secao.itens).map((item) => item.id)).not.toContain("historico_caixas");
  });

  it("aparece para o autorizador mesmo sem caixa_operar", () => {
    const menu = menuDoPerfil(["caixas_gerenciar"]);
    expect(idsDaSecao(menu, "Entradas")).toEqual(["historico_caixas"]);
  });
});

describe("agruparTelasMenu", () => {
  it("joga tela nao mapeada em nenhuma secao para Geral, para nada sumir do menu", () => {
    const menu = agruparTelasMenu([
      itemPorTela["caixa"]!,
      { id: "tela_nova", titulo: "Tela nova", permissao: "caixa_operar", icone: "mdi-help" }
    ]);
    expect(idsDaSecao(menu, "Geral")).toEqual(["tela_nova"]);
  });
});
