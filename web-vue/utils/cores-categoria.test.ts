import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CATEGORIA_POR_TELA,
  CORES_CATEGORIA,
  MISTURA_SOFT_ESCURO,
  corDaCategoria,
  type Categoria
} from "./cores-categoria";
import { corCategoriaPorTela } from "./tema";

// Le do DISCO, e nao por import: `main.css?raw` volta vazio (a config de teste do web-vue neutraliza
// CSS) e `import.meta.url` nao e file:// neste ambiente. Os dois caminhos cobrem rodar a suite da
// raiz do repo ou de dentro de web-vue.
const caminho = [resolve("assets/main.css"), resolve("web-vue/assets/main.css")].find((p) => existsSync(p));
if (!caminho) throw new Error("main.css nao encontrado — o guardiao de cor nao pode passar sem ler o CSS");
const mainCss = readFileSync(caminho, "utf8");

function tokenDoCss(nome: string): string | null {
  const achado = new RegExp(`--cat-${nome}:\\s*(#[0-9a-fA-F]{6})`, "u").exec(mainCss);
  return achado?.[1]?.toLowerCase() ?? null;
}

/**
 * Mesma leitura, mas do bloco `:root[data-theme="dark"]` das categorias. O modo escuro redeclara
 * `-soft` e `-tinta` DEPOIS do bloco claro, entao a segunda ocorrencia do token e a escura — e
 * `tokenDoCss` acima, que para na primeira, continua lendo a clara.
 */
function tokenEscuroDoCss(nome: string): string | null {
  const todos = [...mainCss.matchAll(new RegExp(`--cat-${nome}:\\s*(#[0-9a-fA-F]{6})`, "gu"))];
  return todos[1]?.[1]?.toLowerCase() ?? null;
}

// Superficie do modo escuro LIDA DO CSS, e nao cravada aqui: se alguem mudar o --cx-surface escuro,
// os contrastes abaixo tem de ser recalculados contra o valor novo — nao contra uma copia velha. No
// claro o token e `var(--empresa-superficie, #ffffff)`, entao a unica ocorrencia em hex puro e a
// escura.
const SUPERFICIE_ESCURA = /--cx-surface:\s*(#[0-9a-fA-F]{6})/u.exec(mainCss)?.[1] ?? "";
const SUPERFICIE_CLARA = "#ffffff";

// --- Contraste WCAG, para a faixa de cabecalho nao virar decisao de gosto -----------------------
function canais(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}
function luminancia(hex: string): number {
  const [r, g, b] = canais(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

const CATEGORIAS = Object.keys(CORES_CATEGORIA) as Categoria[];

// Este arquivo existe porque a "fonte unica" ja foi so um comentario. O main.css nao consegue
// importar TS, entao o unico jeito de a unicidade ser REAL e um teste que le os dois e compara.
describe("cores de categoria: main.css nao pode divergir do modulo TS", () => {
  it.each(CATEGORIAS)("%s tem base, soft, strong, faixa e tinta iguais nos dois lugares", (categoria) => {
    const escala = CORES_CATEGORIA[categoria];
    expect(tokenDoCss(`${categoria}-base`)).toBe(escala.base);
    expect(tokenDoCss(`${categoria}-soft`)).toBe(escala.soft);
    expect(tokenDoCss(`${categoria}-strong`)).toBe(escala.strong);
    expect(tokenDoCss(`${categoria}-faixa`)).toBe(escala.faixa);
    expect(tokenDoCss(`${categoria}-tinta`)).toBe(escala.tinta);
  });

  it.each(CATEGORIAS)("%s tem a tinta do MODO ESCURO igual nos dois lugares", (categoria) => {
    expect(tokenEscuroDoCss(`${categoria}-tinta`)).toBe(CORES_CATEGORIA[categoria].tintaEscura);
  });

  it("toda categoria do modulo existe no CSS (nenhuma fica sem token)", () => {
    for (const categoria of CATEGORIAS) expect(tokenDoCss(`${categoria}-base`), categoria).not.toBeNull();
  });
});

describe("derivadas saem da base por formula, nao por escolha avulsa", () => {
  const hex = (n: number) => n.toString(16).padStart(2, "0");

  it.each(CATEGORIAS)("%s: soft e 8%% da base sobre branco", (categoria) => {
    const { base, soft } = CORES_CATEGORIA[categoria];
    const esperado = `#${canais(base)
      .map((v) => hex(Math.round(255 - (255 - v) * 0.08)))
      .join("")}`;
    expect(soft).toBe(esperado);
  });

  it.each(CATEGORIAS)("%s: strong e 20%% mais escura que a base", (categoria) => {
    const { base, strong } = CORES_CATEGORIA[categoria];
    const esperado = `#${canais(base)
      .map((v) => hex(Math.round(v * 0.8)))
      .join("")}`;
    expect(strong).toBe(esperado);
  });

  it.each(CATEGORIAS)("%s: tinta e 62%% da base sobre PRETO", (categoria) => {
    const { base, tinta } = CORES_CATEGORIA[categoria];
    const esperado = `#${canais(base)
      .map((v) => hex(Math.round(v * 0.62)))
      .join("")}`;
    expect(tinta).toBe(esperado);
  });

  it.each(CATEGORIAS)("%s: tintaEscura e 62%% da base sobre BRANCO", (categoria) => {
    const { base, tintaEscura } = CORES_CATEGORIA[categoria];
    const esperado = `#${canais(base)
      .map((v) => hex(Math.round(v * 0.62 + 255 * 0.38)))
      .join("")}`;
    expect(tintaEscura).toBe(esperado);
  });
});

// A auditoria de 04/08/2026 achou o `-soft` quase-branco sendo usado sem NENHUM tratamento escuro:
// sobre a superficie #191f26 ele virava um bloco branco aceso no meio do modal, e o texto da
// categoria por cima ficava ilegivel. Estes testes sao o que impede isso de voltar.
describe("modo escuro: os tokens que encostam na superficie tem tratamento proprio", () => {
  it("a superficie escura foi encontrada no CSS (senao os contrastes abaixo medem contra o vazio)", () => {
    expect(SUPERFICIE_ESCURA).toMatch(/^#[0-9a-f]{6}$/u);
  });

  it.each(CATEGORIAS)("%s: o soft escuro e uma tinta TRANSLUCIDA da base, nao um hex claro", (categoria) => {
    // Translucido de proposito: o mesmo token pinta faixa, chip e linha de tabela — superficies com
    // elevacoes diferentes. Um hex fixo acertaria uma e erraria as outras.
    const esperado = `--cat-${categoria}-soft: color-mix(in srgb, var(--cat-${categoria}-base) ${MISTURA_SOFT_ESCURO}%, transparent);`;
    expect(mainCss).toContain(esperado);
  });

  it.each(CATEGORIAS)("%s: a tinta escura passa em 4,5:1 sobre a superficie escura", (categoria) => {
    expect(contraste(CORES_CATEGORIA[categoria].tintaEscura, SUPERFICIE_ESCURA)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(CATEGORIAS)("%s: a tinta escura passa em 4,5:1 sobre o proprio soft escuro", (categoria) => {
    const { base, tintaEscura } = CORES_CATEGORIA[categoria];
    const proporcao = MISTURA_SOFT_ESCURO / 100;
    const softComposto = `#${canais(base)
      .map((v, i) => {
        const fundo = canais(SUPERFICIE_ESCURA)[i] as number;
        return Math.round(v * proporcao + fundo * (1 - proporcao))
          .toString(16)
          .padStart(2, "0");
      })
      .join("")}`;
    expect(contraste(tintaEscura, softComposto)).toBeGreaterThanOrEqual(4.5);
  });

  // A base NAO clareia no escuro (ela e preenchimento com texto branco por cima, e clarear
  // reprovaria). Por isso a tinta existe: este teste mostra o problema que ela resolve.
  it("a base sozinha REPROVA como texto no escuro — e o motivo de a tinta existir", () => {
    const reprovam = CATEGORIAS.filter((c) => contraste(CORES_CATEGORIA[c].base, SUPERFICIE_ESCURA) < 4.5);
    expect(reprovam.length).toBeGreaterThan(0);
  });
});

// No modo CLARO a base tambem nunca passou como texto: entradas 2,94 · mercadorias 3,02 ·
// transferencias 3,24 sobre branco. A tabela de discriminacao usava `var(--cat)` como cor de texto
// desde sempre — o modo escuro so tornou o problema visivel.
describe("modo claro: a tinta passa em 4,5:1 onde a base reprovava", () => {
  it.each(CATEGORIAS)("%s sobre a superficie clara", (categoria) => {
    expect(contraste(CORES_CATEGORIA[categoria].tinta, SUPERFICIE_CLARA)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(CATEGORIAS)("%s sobre o proprio soft claro", (categoria) => {
    expect(contraste(CORES_CATEGORIA[categoria].tinta, CORES_CATEGORIA[categoria].soft)).toBeGreaterThanOrEqual(4.5);
  });
});

// A faixa do cabecalho leva texto BRANCO. `base` reprova em entradas (2,94), transferencias (3,56)
// e mercadorias (3,30); em entradas nem o `strong` salva (4,40). Por isso `faixa` e medida, e este
// teste e o que impede alguem "simplificar" trocando faixa por base e deixando o titulo ilegivel.
describe("faixa de cabecalho: branco por cima precisa passar em 4.5:1", () => {
  it.each(CATEGORIAS)("%s", (categoria) => {
    expect(contraste(CORES_CATEGORIA[categoria].faixa, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("corCategoriaPorTela deriva da fonte unica", () => {
  it("nao tem hex proprio: cada tela devolve a base da sua categoria", () => {
    for (const [tela, categoria] of Object.entries(CATEGORIA_POR_TELA)) {
      expect(corCategoriaPorTela[tela], tela).toBe(corDaCategoria(categoria));
    }
  });

  // Era o unico motivo de o item de Despesas ficar cinza no menu enquanto os vizinhos tinham cor.
  it("despesas tem cor (faltava no tema.ts ate 03/08/2026)", () => {
    expect(corCategoriaPorTela["despesas"]).toBe(CORES_CATEGORIA.despesas.base);
  });

  it("relatorio_vendas divide a cor de entradas", () => {
    expect(corCategoriaPorTela["relatorio_vendas"]).toBe(CORES_CATEGORIA.entradas.base);
  });

  // Tela de cadastro/configuracao NAO tem cor de categoria — e decisao (hover neutro no menu),
  // registrada no PROJECT_BRAIN/67. Sem esta linha alguem "completa" o mapa achando que faltou.
  it("tela sem categoria continua sem cor", () => {
    expect(corCategoriaPorTela["contas"]).toBeUndefined();
    expect(corCategoriaPorTela["caixa"]).toBeUndefined();
    expect(corCategoriaPorTela["aparencia"]).toBeUndefined();
  });
});
