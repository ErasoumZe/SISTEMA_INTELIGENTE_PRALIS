import { describe, expect, it } from "vitest";
import type { Permissao } from "@padaria/shared";
import { CATEGORIA_LANCAMENTOS, SECOES_MENU, agruparTelasMenu } from "./menu";
import { grupoDaTela, gruposIniciais, idDoGrupo } from "./sanfona-menu";
import { usePermissoes } from "~/composables/usePermissoes";

// Ate a Etapa 7 NENHUM teste cobria abrir/fechar no menu — nem `aria-expanded`, nem ordem de Tab,
// nem o watch que abre a categoria da tela ativa. A garantia era o comentario no codigo. Este
// arquivo fecha a metade que e REGRA: qual grupo nasce aberto, e o id que o `aria-controls` aponta.
// A metade que e CSS (visibilidade, altura animada) continua sem teste, e isso esta dito no
// relatorio em vez de escondido.

function menuDoPerfil(permissoesUsuario: Permissao[], caixaAberto = true) {
  const { telasPermitidas } = usePermissoes(permissoesUsuario, caixaAberto);
  return agruparTelasMenu(telasPermitidas.value);
}

describe("idDoGrupo", () => {
  // `aria-controls` casa por id LITERAL. Titulo de secao e texto de tela: "Configuração" tem cedilha
  // e til, e um id com acento e o tipo de coisa que funciona no Chrome e falha no leitor de tela.
  it("tira acento, cedilha e espaco", () => {
    expect(idDoGrupo("Configuração")).toBe("sidebar-grupo-configuracao");
    expect(idDoGrupo("Transferencias")).toBe("sidebar-grupo-transferencias");
    expect(idDoGrupo("Contas a pagar")).toBe("sidebar-grupo-contas-a-pagar");
  });

  it("gera id valido para TODAS as secoes que existem de verdade", () => {
    for (const secao of SECOES_MENU) {
      expect(idDoGrupo(secao.titulo), secao.titulo).toMatch(/^sidebar-grupo-[a-z0-9-]+$/);
    }
    // Anti-falso-verde: sem isto o `for` acima passaria sobre uma lista vazia.
    expect(SECOES_MENU).toHaveLength(5);
  });

  it("nao colide entre as secoes existentes", () => {
    const ids = SECOES_MENU.map((secao) => idDoGrupo(secao.titulo));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("grupoDaTela", () => {
  it("acha o grupo de uma tela solta na raiz", () => {
    const menu = menuDoPerfil(["entradas_visualizar"]);
    expect(grupoDaTela(menu, "entradas")).toBe("Entradas");
  });

  // O caso que se erra: /despesas nao esta solta em "Saidas", esta DENTRO da categoria Lancamentos.
  // Sem olhar dentro da categoria, o grupo da tela ativa nasceria fechado justamente para quem usa
  // lancamentos — e o item ativo ficaria escondido.
  it("acha o grupo de uma tela que vive DENTRO da categoria Lancamentos", () => {
    const menu = menuDoPerfil(["despesas_visualizar"]);
    expect(grupoDaTela(menu, "despesas")).toBe("Saidas");
    // e a tela realmente esta dentro da categoria, nao solta na raiz
    const saidas = menu.find((grupo) => grupo.titulo === "Saidas");
    expect(saidas?.itens.some((no) => no.tipo === "categoria" && no.id === CATEGORIA_LANCAMENTOS.id)).toBe(true);
  });

  it("devolve null quando a tela ativa nao esta no menu", () => {
    const menu = menuDoPerfil(["entradas_visualizar"]);
    expect(grupoDaTela(menu, "tela_que_nao_existe")).toBeNull();
  });
});

describe("gruposIniciais", () => {
  // A decisao que a MEDICAO corrigiu. A primeira versao abria so o grupo da tela ativa; medindo no
  // navegador, quem entra cai no Painel — que nao e tela de menu — e o menu inteiro nascia
  // recolhido, escondendo 33 itens de quem nunca pediu isso. A sanfona ACRESCENTA a possibilidade
  // de recolher; ela nao recolhe por conta propria.
  it("no primeiro uso todos nascem abertos — igual ao menu de hoje", () => {
    const menu = menuDoPerfil([
      "entradas_visualizar",
      "transferencias_visualizar",
      "cadastro_colaboradores_visualizar"
    ]);
    const estado = gruposIniciais(menu, "entradas");
    expect(menu.length).toBeGreaterThan(1);
    for (const grupo of menu) expect(estado[grupo.titulo], grupo.titulo).toBe(true);
  });

  it("conhece todos os grupos do menu, nao so o da tela ativa", () => {
    const menu = menuDoPerfil([
      "entradas_visualizar",
      "transferencias_visualizar",
      "cadastro_colaboradores_visualizar"
    ]);
    const estado = gruposIniciais(menu, "entradas");
    expect(Object.keys(estado).sort()).toEqual(menu.map((grupo) => grupo.titulo).sort());
  });

  it("o que o usuario fechou continua fechado depois de navegar", () => {
    const menu = menuDoPerfil([
      "entradas_visualizar",
      "transferencias_visualizar",
      "cadastro_colaboradores_visualizar"
    ]);
    const anterior = gruposIniciais(menu, "entradas");
    anterior["Configuração"] = false; // o usuario recolheu na mao

    const depoisDeNavegar = gruposIniciais(menu, "transferencias", anterior);
    expect(depoisDeNavegar["Configuração"]).toBe(false); // a escolha sobreviveu
    expect(depoisDeNavegar["Transferencias"]).toBe(true); // o grupo da tela nova esta aberto
  });

  // O grupo da tela ativa nao pode ficar escondido nem quando o usuario o fechou: se ficasse, os
  // tres sinais do item ativo do 67 §9 sumiriam com ele.
  it("reabre o grupo da tela ativa mesmo que o usuario o tenha fechado", () => {
    const menu = menuDoPerfil([
      "entradas_visualizar",
      "transferencias_visualizar",
      "cadastro_colaboradores_visualizar"
    ]);
    const anterior = gruposIniciais(menu, "entradas");
    anterior["Transferencias"] = false;

    expect(gruposIniciais(menu, "transferencias", anterior)["Transferencias"]).toBe(true);
  });

  // Grupo que aparece depois (permissao nova) nasce aberto: esconder o que acabou de ser liberado
  // seria o oposto do que a pessoa espera.
  it("grupo desconhecido nasce aberto, sem atropelar o que o usuario fechou", () => {
    const menu = menuDoPerfil([
      "entradas_visualizar",
      "transferencias_visualizar",
      "cadastro_colaboradores_visualizar"
    ]);
    // So "Configuração" e conhecido, e o usuario o fechou. Os outros dois sao novos para o estado.
    const estado = gruposIniciais(menu, "entradas", { Configuração: false });
    expect(estado["Configuração"]).toBe(false); // conhecido e fechado: respeitado
    expect(estado["Transferencias"]).toBe(true); // desconhecido: nasce aberto
    expect(estado["Entradas"]).toBe(true); // desconhecido E da tela ativa
  });

  it("nao quebra quando a tela ativa nao esta no menu (o caso do Painel)", () => {
    const menu = menuDoPerfil(["entradas_visualizar"]);
    const estado = gruposIniciais(menu, "tela_que_nao_existe");
    expect(Object.values(estado).every((aberto) => aberto === true)).toBe(true);
  });

  // O caso extremo do prompt: dp@email.com ve pouca coisa.
  it("com um grupo so, ele nasce aberto", () => {
    const menu = menuDoPerfil(["entradas_visualizar"]);
    expect(menu).toHaveLength(1);
    expect(gruposIniciais(menu, "entradas")[menu[0]!.titulo]).toBe(true);
  });
});
