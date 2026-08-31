import { describe, expect, it } from "vitest";
import type { Permissao } from "@padaria/shared";
import { permissoesAcessoTotal } from "@padaria/shared";
import { SECOES_MENU, agruparTelasMenu } from "./menu";
import { estruturaEfetiva, estruturaPadrao, normalizarEstrutura } from "./menu-estrutura";
import { usePermissoes } from "~/composables/usePermissoes";
import type { EstruturaMenu } from "./menu-estrutura";

// As telas que o menu recebe já vêm filtradas por permissão — é assim que o AppShell as passa.
// Reproduzir esse caminho aqui é o que torna o teste da regra 1 honesto: se a estrutura pudesse
// mostrar tela sem permissão, ela apareceria mesmo com a lista chegando filtrada.
const telasDe = (permissoes: Permissao[], caixaAberto = true) =>
  usePermissoes(permissoes, caixaAberto).telasPermitidas.value;

const TODAS = telasDe([...permissoesAcessoTotal]);
const titulos = (grupos: { titulo: string }[]) => grupos.map((g) => g.titulo);
const idsDoGrupo = (grupos: ReturnType<typeof agruparTelasMenu>, titulo: string) =>
  grupos.find((g) => g.titulo === titulo)?.itens.map((i) => i.id) ?? [];

describe("estrutura do menu — o padrão de fábrica é o comportamento de hoje", () => {
  it("sem configuração, o menu sai igual ao SECOES_MENU", () => {
    expect(agruparTelasMenu(TODAS)).toEqual(agruparTelasMenu(TODAS, estruturaPadrao()));
  });

  it("configuração ausente cai no padrão", () => {
    expect(estruturaEfetiva(null)).toEqual(estruturaPadrao());
    expect(estruturaEfetiva(undefined)).toEqual(estruturaPadrao());
  });

  // Regra 5. O que chega de fora não é confiável, e "corrompido" tem de reagir como "ausente".
  it.each([
    ["lista vazia", [] as EstruturaMenu],
    ["seção sem título", [{ titulo: "   ", ids: ["caixa"] }] as EstruturaMenu],
    ["seção sem nenhum id", [{ titulo: "Vazia", ids: [] }] as EstruturaMenu],
    // A asserção passa por um tipo COMPATÍVEL em vez de `unknown` — o repo proíbe `unknown` fora de
    // fronteira de dados, e aqui não é preciso: `string[]` é atribuível a `(string | number | null)[]`,
    // então a asserção inversa é legítima. O teste finge ser o que vem do banco, que não tem
    // garantia de tipo nenhuma — é exatamente contra isso que a normalização existe.
    [
      "ids que não são texto",
      [{ titulo: "X", ids: [1, null] as (string | number | null)[] as string[] }] as EstruturaMenu
    ]
  ])("configuração corrompida (%s) cai no padrão", (_rotulo, bruto) => {
    expect(normalizarEstrutura(bruto)).toBeNull();
    expect(estruturaEfetiva(bruto)).toEqual(estruturaPadrao());
  });

  // A poda que evita o defeito silencioso: sem ela a tela apareceria duas vezes na configuração e
  // o agrupador mostraria a primeira e engoliria a segunda sem dizer nada.
  it("id repetido em duas seções fica só na primeira", () => {
    const bruto: EstruturaMenu = [
      { titulo: "A", ids: ["caixa", "entradas"] },
      { titulo: "B", ids: ["caixa", "contas"] }
    ];
    expect(normalizarEstrutura(bruto)).toEqual([
      { titulo: "A", ids: ["caixa", "entradas"] },
      { titulo: "B", ids: ["contas"] }
    ]);
  });
});

describe("estrutura do menu — as regras que a configuração não pode furar", () => {
  // Regra 1. A estrutura organiza; a permissão decide. Aqui a estrutura MANDA a tela para uma
  // seção, e ela continua não aparecendo, porque quem não tem acesso não a recebe na lista.
  it("tela posta numa seção continua invisível para quem não tem a permissão", () => {
    const estrutura: EstruturaMenu = [{ titulo: "Tudo", ids: ["caixa", "relatorio_dre", "colaboradores"] }];
    const semAcesso = telasDe(["menu_caixa_mostrar", "caixa_operar"]);
    const grupos = agruparTelasMenu(semAcesso, estrutura);
    const ids = idsDoGrupo(grupos, "Tudo");
    expect(ids).toContain("caixa");
    expect(ids).not.toContain("relatorio_dre");
    expect(ids).not.toContain("colaboradores");
  });

  // Regra 2 e 3. A rede continua valendo sobre a estrutura salva, e não só sobre a constante.
  it("tela fora da estrutura cai em Geral, e não some", () => {
    const estrutura: EstruturaMenu = [{ titulo: "Só o caixa", ids: ["caixa"] }];
    const grupos = agruparTelasMenu(TODAS, estrutura);
    expect(titulos(grupos)).toContain("Geral");
    const noMenu = grupos.flatMap((g) => g.itens.map((i) => i.id));
    for (const tela of TODAS) expect(noMenu).toContain(tela.id);
  });

  // Regra 4.
  it("seção sem nenhuma tela permitida não aparece", () => {
    const estrutura: EstruturaMenu = [
      { titulo: "Só o caixa", ids: ["caixa"] },
      { titulo: "Nada aqui", ids: ["relatorio_dre"] }
    ];
    const soCaixa = telasDe(["menu_caixa_mostrar", "caixa_operar"]);
    expect(titulos(agruparTelasMenu(soCaixa, estrutura))).not.toContain("Nada aqui");
  });

  it("a ordem das seções é a da configuração", () => {
    const estrutura: EstruturaMenu = [
      { titulo: "Segunda", ids: ["entradas"] },
      { titulo: "Primeira", ids: ["caixa"] }
    ];
    expect(titulos(agruparTelasMenu(TODAS, estrutura)).slice(0, 2)).toEqual(["Segunda", "Primeira"]);
  });

  // Remover uma seção é apagá-la da lista: as telas dela não têm mais casa e caem na rede.
  it("remover uma seção não perde tela nenhuma", () => {
    const completa = estruturaPadrao();
    const semAPrimeira = completa.slice(1);
    const grupos = agruparTelasMenu(TODAS, semAPrimeira);
    const noMenu = grupos.flatMap((g) => g.itens.map((i) => i.id));
    for (const id of completa[0]!.ids) {
      if (TODAS.some((t) => t.id === id)) expect(noMenu).toContain(id);
    }
  });

  it("o padrão de fábrica é uma cópia, e mexer nele não contamina o SECOES_MENU", () => {
    const copia = estruturaPadrao();
    copia[0]!.ids.push("intruso");
    copia[0]!.titulo = "Trocado";
    expect(SECOES_MENU[0]!.ids).not.toContain("intruso");
    expect(estruturaPadrao()[0]!.titulo).toBe(SECOES_MENU[0]!.titulo);
  });
});
