import { describe, expect, it } from "vitest";
import type { Permissao } from "@padaria/shared";
import { permissoesAcessoTotal } from "@padaria/shared";
import { agruparTelasMenu } from "./menu";
import { estruturaEfetiva, estruturaPadrao, normalizarEstrutura, type EstruturaMenu } from "./menu-estrutura";
import { rotaTela } from "./domain";
import { usePermissoes } from "~/composables/usePermissoes";

const telasDe = (permissoes: Permissao[], caixaAberto = true) =>
  usePermissoes(permissoes, caixaAberto).telasPermitidas.value;
const todas = telasDe([...permissoesAcessoTotal]);

describe("estrutura configurável do menu", () => {
  it("mantém a organização atual quando não há configuração salva", () => {
    expect(estruturaEfetiva(null)).toEqual(estruturaPadrao());
    expect(agruparTelasMenu(todas, estruturaEfetiva(null).secoes)).toEqual(
      agruparTelasMenu(todas, estruturaPadrao().secoes)
    );
  });

  it("remove item desconhecido, duplicado e grupo vazio", () => {
    const corrompida = {
      versao: 1,
      secoes: [
        { id: "a", titulo: "Operação", ids: ["caixa", "entradas", "caixa", "nao-existe"] },
        { id: "b", titulo: "Repetido", ids: ["entradas"] }
      ]
    } as EstruturaMenu;

    expect(normalizarEstrutura(corrompida)).toMatchObject({
      versao: 1,
      secoes: [{ id: "a", titulo: "Operação", ids: ["caixa", "entradas"] }]
    });
  });

  it("nunca usa a estrutura para mostrar tela sem permissão", () => {
    const estrutura: EstruturaMenu = {
      versao: 1,
      idsOcultos: [],
      secoes: [{ id: "x", titulo: "Tudo", ids: ["caixa", "relatorio_dre"] }]
    };
    const semDre = telasDe(["menu_caixa_mostrar", "caixa_operar"]);
    const ids = agruparTelasMenu(semDre, estrutura.secoes).flatMap((grupo) => grupo.itens.map((item) => item.id));

    expect(ids).toContain("caixa");
    expect(ids).not.toContain("relatorio_dre");
  });

  it("tela fora de um grupo cai em Geral, sem desaparecer", () => {
    const estrutura: EstruturaMenu = {
      versao: 1,
      idsOcultos: [],
      secoes: [{ id: "x", titulo: "Só caixa", ids: ["caixa"] }]
    };
    const grupos = agruparTelasMenu(todas, estrutura.secoes);
    const ids = grupos.flatMap((grupo) => grupo.itens.map((item) => item.id));

    expect(grupos.map((grupo) => grupo.titulo)).toContain("Geral");
    for (const tela of todas) expect(ids).toContain(tela.id);
  });

  it("inclui a Central do DP na secao existente de estruturas salvas antes dela", () => {
    const estruturaLegada: EstruturaMenu = {
      versao: 1,
      idsOcultos: [],
      secoes: [
        { id: "operacao", titulo: "Operação", ids: ["caixa"] },
        { id: "dp", titulo: "Departamento pessoal", ids: ["admissoes_processos", "colaboradores"] }
      ]
    };

    expect(estruturaEfetiva(estruturaLegada).secoes[1]?.ids).toEqual([
      "departamento_pessoal",
      "admissoes_processos",
      "colaboradores",
      "conplus_folha_05",
      "conplus_adiantamento_20",
      "conplus_rescisoes",
      "conplus_ferias"
    ]);
  });

  it("mantém os quatro itens Conplus dentro do DP quando a estrutura salva já tem a Central", () => {
    const estrutura: EstruturaMenu = {
      versao: 1,
      idsOcultos: [],
      secoes: [{ id: "dp", titulo: "Departamento pessoal", ids: ["departamento_pessoal", "admissoes_processos"] }]
    };

    expect(estruturaEfetiva(estrutura).secoes[0]?.ids).toContain("conplus_folha_05");
    expect(estruturaEfetiva(estrutura).secoes[0]?.ids).toContain("conplus_ferias");
  });

  it("converte os quatro itens Conplus nas rotas independentes oficiais", () => {
    expect(rotaTela("conplus_folha_05")).toBe("/conplus/folha-05");
    expect(rotaTela("conplus_adiantamento_20")).toBe("/conplus/adiantamento-20");
    expect(rotaTela("conplus_rescisoes")).toBe("/conplus/rescisoes");
    expect(rotaTela("conplus_ferias")).toBe("/conplus/ferias");
  });

  it("oculta somente o atalho do menu, sem alterar a lista de permissões", () => {
    const estrutura: EstruturaMenu = {
      versao: 1,
      idsOcultos: ["caixa"],
      secoes: [{ id: "x", titulo: "Operação", ids: ["caixa", "entradas"] }]
    };
    const ids = agruparTelasMenu(
      telasDe(["menu_caixa_mostrar", "caixa_operar", "menu_entradas_mostrar"]),
      estrutura.secoes,
      estrutura.idsOcultos
    ).flatMap((grupo) => grupo.itens.map((item) => item.id));

    expect(ids).not.toContain("caixa");
    expect(telasDe(["menu_caixa_mostrar", "caixa_operar", "menu_entradas_mostrar"]).map((tela) => tela.id)).toContain(
      "caixa"
    );
  });
});
