import { describe, expect, it } from "vitest";
import { permissoesAcessoTotal, type Permissao } from "@padaria/shared";
import { CATEGORIA_LANCAMENTOS, agruparTelasMenu } from "./menu";
import { MOTIVO_PADRAO, montarAtalhosHome } from "./atalhos-home";
import { usePermissoes } from "~/composables/usePermissoes";

// Estes testes existem por um motivo so: garantir que o painel NUNCA ofereca atalho para tela que
// o menu nao ofereceria. A entrada e sempre `telasPermitidas` — a mesma do AppShell — e a saida so
// pode reorganizar, nunca acrescentar.
function atalhosDoPerfil(permissoes: Permissao[], caixaAberto = true, desabilitadas: string[] = [], motivos = {}) {
  const { telasPermitidas } = usePermissoes(permissoes, caixaAberto);
  return montarAtalhosHome(telasPermitidas.value, desabilitadas, motivos);
}

function idsDosAtalhos(grupos: ReturnType<typeof atalhosDoPerfil>) {
  return grupos.flatMap((grupo) => grupo.telas.map((tela) => tela.id));
}

describe("o painel nao inventa acesso", () => {
  it("nao oferece nenhuma tela que a lista de entrada nao trouxe", () => {
    const { telasPermitidas } = usePermissoes(["caixa_operar"], true);
    const permitidos = new Set(telasPermitidas.value.map((tela) => tela.id));
    const atalhos = idsDosAtalhos(montarAtalhosHome(telasPermitidas.value));
    for (const id of atalhos) expect(permitidos.has(id), `${id} apareceu no painel sem estar na lista`).toBe(true);
  });

  it("lista vazia devolve painel vazio — nunca um catalogo de telas", () => {
    expect(montarAtalhosHome([])).toEqual([]);
  });

  it("perfil restrito ve menos atalhos que o acesso total", () => {
    const restrito = idsDosAtalhos(atalhosDoPerfil(["caixa_operar"]));
    const total = idsDosAtalhos(atalhosDoPerfil([...permissoesAcessoTotal]));
    expect(restrito.length).toBeGreaterThan(0);
    expect(total.length).toBeGreaterThan(restrito.length);
  });

  it("nenhuma tela aparece em dois grupos", () => {
    const ids = idsDosAtalhos(atalhosDoPerfil([...permissoesAcessoTotal]));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("agrupamento: o painel segue o menu, nao uma organizacao propria", () => {
  it("os grupos sao os do menu, na mesma ordem", () => {
    const { telasPermitidas } = usePermissoes([...permissoesAcessoTotal], true);
    // Comparado contra o `agruparTelasMenu` DE VERDADE, e nao contra o proprio resultado: um teste
    // que compara a funcao com ela mesma passa sempre e nao prova nada.
    const titulosDoMenu = agruparTelasMenu(telasPermitidas.value).map((grupo) => grupo.titulo);
    const titulosDoPainel = montarAtalhosHome(telasPermitidas.value).map((grupo) => grupo.titulo);
    expect(titulosDoPainel).toEqual(titulosDoMenu);
  });

  it("dentro do grupo, a ordem das telas e a do menu", () => {
    const { telasPermitidas } = usePermissoes([...permissoesAcessoTotal], true);
    const doMenu = agruparTelasMenu(telasPermitidas.value).flatMap((grupo) =>
      grupo.itens.flatMap((no) => (no.tipo === "categoria" ? no.itens.map((t) => t.id) : [no.id]))
    );
    expect(idsDosAtalhos(montarAtalhosHome(telasPermitidas.value))).toEqual(doMenu);
  });

  it("grupo sem nenhuma tela liberada nao vira secao vazia", () => {
    const grupos = atalhosDoPerfil(["caixa_operar"]);
    for (const grupo of grupos) expect(grupo.telas.length).toBeGreaterThan(0);
  });

  // Categoria e expansor de menu, nao tem rota: um cartao para ela seria link morto.
  it("a categoria Lancamentos vira as telas de dentro, no lugar dela", () => {
    const ids = idsDosAtalhos(atalhosDoPerfil([...permissoesAcessoTotal]));
    expect(ids).not.toContain(CATEGORIA_LANCAMENTOS.id);
    for (const filho of CATEGORIA_LANCAMENTOS.ids) expect(ids).toContain(filho);
  });
});

describe("tela desabilitada: o painel diz o mesmo que o menu", () => {
  it("continua aparecendo, marcada, em vez de sumir", () => {
    const grupos = atalhosDoPerfil([...permissoesAcessoTotal], true, ["entradas"]);
    const entradas = grupos.flatMap((grupo) => grupo.telas).find((tela) => tela.id === "entradas");
    expect(entradas, "entradas sumiu do painel em vez de aparecer desabilitada").toBeDefined();
    expect(entradas?.desabilitada).toBe(true);
  });

  it("carrega o motivo que o menu carrega", () => {
    const motivo = "Abra um caixa para operar esta tela.";
    const grupos = atalhosDoPerfil([...permissoesAcessoTotal], true, ["entradas"], { entradas: motivo });
    const entradas = grupos.flatMap((grupo) => grupo.telas).find((tela) => tela.id === "entradas");
    expect(entradas?.motivo).toBe(motivo);
  });

  it("sem motivo declarado, cai no mesmo texto padrao do AppWorkspace", () => {
    const grupos = atalhosDoPerfil([...permissoesAcessoTotal], true, ["entradas"]);
    const entradas = grupos.flatMap((grupo) => grupo.telas).find((tela) => tela.id === "entradas");
    expect(entradas?.motivo).toBe(MOTIVO_PADRAO);
  });

  it("tela nao desabilitada nao herda marca de bloqueio", () => {
    const grupos = atalhosDoPerfil([...permissoesAcessoTotal], true, ["entradas"]);
    const outras = grupos.flatMap((grupo) => grupo.telas).filter((tela) => tela.id !== "entradas");
    for (const tela of outras) expect(tela.desabilitada, `${tela.id} veio bloqueada sem motivo`).toBe(false);
  });

  // Desabilitar nao pode virar um jeito torto de esconder: a lista precisa ter o mesmo tamanho.
  it("desabilitar nao remove nada da lista", () => {
    const semBloqueio = idsDosAtalhos(atalhosDoPerfil([...permissoesAcessoTotal]));
    const comBloqueio = idsDosAtalhos(atalhosDoPerfil([...permissoesAcessoTotal], true, ["entradas", "despesas"]));
    expect(comBloqueio).toEqual(semBloqueio);
  });
});
