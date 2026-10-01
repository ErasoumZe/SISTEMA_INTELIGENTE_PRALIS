import { describe, expect, it } from "vitest";
import { ehPermissaoRestricao, permissoesAcessoTotal, permissoesRestricao, type Permissao } from "@padaria/shared";
import { acoesNovoPermitidas, categoriaInicialSaida, itemPorTela, podeExecutarAcaoCadastro } from "./domain";
import { CATEGORIA_LANCAMENTOS, agruparTelasMenu } from "./menu";
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

// Tudo que fica na RAIZ do menu (nao entra aqui o que esta dentro de uma categoria).
function idsNaRaiz(menu: ReturnType<typeof menuDoPerfil>) {
  return menu.flatMap((secao) => secao.itens).map((no) => no.id);
}

// A categoria "Lancamentos" e as telas que ela guarda (undefined = categoria nao aparece).
function categoriaLancamentos(menu: ReturnType<typeof menuDoPerfil>) {
  const no = menu.flatMap((secao) => secao.itens).find((item) => item.id === CATEGORIA_LANCAMENTOS.id);
  return no?.tipo === "categoria" ? no : undefined;
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

describe("Socios e Gestores", () => {
  it("tem permissao administrativa propria e nao aparece para quem so opera retiradas", () => {
    expect(itemPorTela.socios_gestores?.permissao).toBe("cadastro_socios_gestores_visualizar");
    expect(idsDaSecao(menuDoPerfil(["retiradas_visualizar"]), "Configuração")).not.toContain("socios_gestores");
  });

  it("aparece em Configuracao e respeita criar/editar independentes de Retiradas", () => {
    const item = itemPorTela.socios_gestores!;
    expect(idsDaSecao(menuDoPerfil(["cadastro_socios_gestores_visualizar"]), "Configuração")).toContain(
      "socios_gestores"
    );
    expect(podeExecutarAcaoCadastro(["cadastro_socios_gestores_criar"], item, "criar")).toBe(true);
    expect(podeExecutarAcaoCadastro(["retiradas_criar"], item, "criar")).toBe(false);
    expect(podeExecutarAcaoCadastro(["cadastro_socios_gestores_editar"], item, "editar")).toBe(true);
  });
});

// PROJECT_BRAIN/17, D6 + §4: as tres telas de lancamento deixam de existir soltas no menu e passam
// a viver DENTRO da categoria "Lancamentos". A visibilidade continua vindo das permissoes de cada
// tela: papeis de gestao veem sempre; o cargo Caixa so com o caixa aberto (menu_*_somente_caixa_aberto).
describe("categoria Lancamentos no menu", () => {
  const acessoLancamentos: Permissao[] = ["despesas_visualizar", "mercadorias_visualizar", "retiradas_visualizar"];

  // Espelho do db/src/referencia-permissoes.ts (so o que importa para a visibilidade do menu).
  const papeisDeGestao: Record<string, Permissao[]> = {
    Gerencia: [...acessoLancamentos, "caixa_operar", "caixas_gerenciar", "entradas_visualizar"],
    Tesouraria: [...acessoLancamentos, "transferencias_visualizar"],
    Financeiro: [...acessoLancamentos, "contas_pagar_visualizar", "relatorio_vendas_visualizar"],
    // Diretor Geral opera como usuario_admin: recebe acesso TOTAL, que e o catalogo MENOS as
    // restricoes `_somente_caixa_aberto` (o dono do sistema nao herda restricao).
    "Diretor Geral / Admin": [...permissoesAcessoTotal]
  };

  // Cargo Caixa: tem acesso as tres telas, mas com a flag que as prende ao caixa aberto.
  const cargoCaixa: Permissao[] = [
    ...acessoLancamentos,
    "caixa_operar",
    "menu_despesas_somente_caixa_aberto",
    "menu_mercadorias_somente_caixa_aberto",
    "menu_retiradas_somente_caixa_aberto"
  ];

  it("guarda Despesas, Mercadorias e Retiradas dentro dela, na secao Saidas", () => {
    const menu = menuDoPerfil(acessoLancamentos);
    expect(idsDaSecao(menu, "Saidas")).toEqual([CATEGORIA_LANCAMENTOS.id]);
    expect(categoriaLancamentos(menu)?.itens.map((tela) => tela.id)).toEqual(["despesas", "mercadorias", "retiradas"]);
  });

  it("mata o caminho antigo: os tres itens nao existem mais soltos na raiz do menu", () => {
    const raiz = idsNaRaiz(menuDoPerfil(acessoLancamentos));
    expect(raiz).not.toContain("despesas");
    expect(raiz).not.toContain("mercadorias");
    expect(raiz).not.toContain("retiradas");
  });

  it("mantem as listagens separadas por categoria (cada tela guarda a sua rota e o seu titulo)", () => {
    const itens = categoriaLancamentos(menuDoPerfil(acessoLancamentos))?.itens ?? [];
    expect(itens.map((tela) => tela.titulo)).toEqual(["Despesas", "Mercadorias", "Retiradas"]);
  });

  for (const [papel, permissoesDoPapel] of Object.entries(papeisDeGestao)) {
    it(`aparece para ${papel} mesmo com o caixa FECHADO`, () => {
      const menu = menuDoPerfil(permissoesDoPapel, false);
      expect(categoriaLancamentos(menu)?.itens.map((tela) => tela.id)).toEqual([
        "despesas",
        "mercadorias",
        "retiradas"
      ]);
    });
  }

  // Regressao: enquanto "todas as permissoes" era o catalogo INTEIRO, o admin herdava as flags
  // `_somente_caixa_aberto` (que sao RESTRICOES) e perdia Lancamentos com o caixa fechado.
  it("acesso total nao carrega nenhuma restricao de caixa aberto", () => {
    expect(permissoesAcessoTotal.filter((permissao) => ehPermissaoRestricao(permissao))).toEqual([]);
    expect(permissoesRestricao.length).toBeGreaterThan(0);
  });

  it("aparece para o cargo Caixa com o caixa ABERTO", () => {
    const menu = menuDoPerfil(cargoCaixa, true);
    expect(categoriaLancamentos(menu)?.itens.map((tela) => tela.id)).toEqual(["despesas", "mercadorias", "retiradas"]);
  });

  it("some inteira para o cargo Caixa com o caixa FECHADO (nem categoria, nem itens soltos)", () => {
    const menu = menuDoPerfil(cargoCaixa, false);
    expect(categoriaLancamentos(menu)).toBeUndefined();
    expect(idsNaRaiz(menu)).not.toContain("despesas");
  });

  it("mostra so as telas que o cargo tem: quem ve apenas Despesas (DP) nao ganha as outras duas", () => {
    const menu = menuDoPerfil(["despesas_visualizar"]);
    expect(categoriaLancamentos(menu)?.itens.map((tela) => tela.id)).toEqual(["despesas"]);
  });

  it("nao aparece para quem nao lanca nada (RH/Fiscal)", () => {
    expect(categoriaLancamentos(menuDoPerfil(["avaliacao_qualidade_visualizar"]))).toBeUndefined();
  });
});

describe("categoria Departamento pessoal no menu", () => {
  const permissoesDepartamentoPessoal: Permissao[] = [
    "admissoes_processos_visualizar",
    "admissoes_testes_visualizar",
    "cadastro_colaboradores_visualizar",
    "cadastro_funcoes_visualizar",
    "cadastro_areas_setores_visualizar",
    "cadastro_turnos_visualizar"
  ];

  it("concentra as telas de admissão e cadastros de pessoas em menu principal próprio", () => {
    const menu = menuDoPerfil(permissoesDepartamentoPessoal);
    expect(idsDaSecao(menu, "Departamento pessoal")).toEqual([
      "departamento_pessoal",
      "admissoes",
      "colaboradores",
      "cadastros_dp"
    ]);
    const secao = menu.find((grupo) => grupo.titulo === "Departamento pessoal");
    const admissoes = secao?.itens.find((item) => item.id === "admissoes");
    const cadastros = secao?.itens.find((item) => item.id === "cadastros_dp");
    expect(admissoes?.tipo === "categoria" ? admissoes.itens.map((item) => item.id) : []).toEqual([
      "admissoes_processos",
      "admissoes_testes"
    ]);
    expect(cadastros?.tipo === "categoria" ? cadastros.itens.map((item) => item.id) : []).toEqual([
      "funcoes_operacionais",
      "areas_setores",
      "turnos"
    ]);
    expect(idsDaSecao(menu, "Configuração")).toEqual([]);
  });

  it("não replica telas em Configuração nem cria permissão nova", () => {
    const raiz = idsNaRaiz(menuDoPerfil(permissoesDepartamentoPessoal));
    expect(raiz).toContain("colaboradores");
    expect(raiz).toContain("cadastros_dp");
    expect(idsDaSecao(menuDoPerfil(permissoesDepartamentoPessoal), "Configuração")).toEqual([]);
  });

  it("não aparece para perfil sem nenhuma tela de departamento pessoal", () => {
    expect(idsDaSecao(menuDoPerfil(["cadastro_clientes_visualizar"]), "Departamento pessoal")).toEqual([]);
  });
});

// PROJECT_BRAIN/17 §4: o "+ NOVO" tem TRES itens (um por eixo). Entradas NAVEGA (venda so entra por
// integracao, D7); Transferencias e Saidas abrem modal — Saidas alterna a categoria por dentro.
describe("+ NOVO por papel", () => {
  it("tem exatamente Entradas, Transferencias e Saidas — nada por categoria", () => {
    const acoes = acoesNovoPermitidas([...permissoesAcessoTotal]);
    expect(acoes.map((acao) => acao.id)).toEqual(["entradas", "transferencias", "saidas"]);
    expect(acoes.map((acao) => acao.titulo)).toEqual(["Entradas", "Transferências", "Saídas"]);
  });

  it("Entradas navega para a tela (nao abre modal) e Saidas abre o lancamento", () => {
    const acoes = acoesNovoPermitidas([...permissoesAcessoTotal]);
    const entradas = acoes.find((acao) => acao.id === "entradas");
    const saidas = acoes.find((acao) => acao.id === "saidas");
    expect(entradas).toMatchObject({ telaDestino: "entradas" });
    expect(entradas?.entidade).toBeUndefined();
    expect(saidas).toMatchObject({ entidade: "despesa" });
    expect(saidas?.telaDestino).toBeUndefined();
  });

  it("Tesouraria (so transferencia) ve Transferencias, nao ve Saidas", () => {
    const acoes = acoesNovoPermitidas(["transferencias_criar", "transferencias_visualizar"]);
    expect(acoes.map((acao) => acao.id)).toEqual(["transferencias"]);
  });

  it("basta UMA permissao de saida para ver o item Saidas (quem so cria retirada)", () => {
    const acoes = acoesNovoPermitidas(["retiradas_criar"]);
    expect(acoes.map((acao) => acao.id)).toEqual(["saidas"]);
  });

  it("Saidas abre na categoria que o perfil pode criar (quem so cria retirada nao cai na despesa)", () => {
    expect(categoriaInicialSaida(["despesas_criar", "retiradas_criar"])).toBe("despesa");
    expect(categoriaInicialSaida(["mercadorias_criar", "retiradas_criar"])).toBe("mercadoria");
    expect(categoriaInicialSaida(["retiradas_criar"])).toBe("retirada");
  });

  it("quem nao cria nada nem navega para entradas nao ve nenhum item", () => {
    expect(acoesNovoPermitidas(["avaliacao_qualidade_visualizar"])).toEqual([]);
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
