import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Le do DISCO, e nao por import: `main.css?raw` volta vazio (a config de teste do web-vue
// neutraliza CSS). Mesmo motivo e mesmo molde de `web-vue/utils/cores-categoria.test.ts`, que
// explica a armadilha na linha 13 dele. Os dois caminhos cobrem rodar a suite da raiz do repo
// ou de dentro de web-vue.
const caminho = [resolve("assets/main.css"), resolve("web-vue/assets/main.css")].find((p) => existsSync(p));
if (!caminho) throw new Error("main.css nao encontrado — o guardiao de cor nao pode passar sem ler o CSS");
const mainCss = readFileSync(caminho, "utf8");

// Este arquivo e a regra §0.1 da DIRECAO_VISUAL_CICLUZ_PROPOSTA virando guardiao mecanico:
// "nenhuma cor do sistema muda, zero hex novo entra nesta frente". Enquanto ela era so texto,
// dependia de alguem lembrar dela na hora de escrever CSS. Agora falha o build.
//
// O escopo e deliberadamente estreito: SO os blocos datados desta frente (INICIO SHELL-* e
// INICIO VIS-*). O resto do main.css tem 2.300 linhas de blocos historicos cheios de hex
// legitimo — varrer o arquivo inteiro daria vermelho eterno e o guardiao seria desligado no
// primeiro dia.

const ABRE = /INICIO\s+((?:SHELL|VIS)-[A-Za-z0-9]+)/u;
const FECHA = /FIM\s+((?:SHELL|VIS)-[A-Za-z0-9]+)/u;

// Hex em qualquer notacao CSS: #rgb, #rgba, #rrggbb, #rrggbbaa.
const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/gu;
// rgb()/rgba()/hsl()/hsla() COM numero literal dentro. `color-mix()` e `var()` nao entram aqui
// de proposito: sao as formas permitidas de compor cor a partir de token.
//
// FALSO POSITIVO CONHECIDO, registrado para nao ser redescoberto: `rgb(var(--cx-e-1))` CASARIA,
// porque `[^)]*\d[^)]*` fecha no primeiro `)` e o `1` do nome do token serve de digito. Nao ha
// ocorrencia assim hoje, e mexer no padrao sem um caso real e chutar — fica anotado, nao consertado.
const FUNCAO_COR = /\b(?:rgba?|hsla?)\([^)]*\d[^)]*\)/giu;

// NOME DE COR CSS. Era o buraco maior do guardiao: ele pegava `#dc2626` e deixava passar `red`,
// `white` e `rebeccapurple`, que cravam cor exatamente do mesmo jeito.
//
// AS FRONTEIRAS `(?<![\w-])` E `(?![\w-])` SAO OBRIGATORIAS, e nao zelo: sem elas `--cx-brand-red`
// casaria com `red`, `srgb` casaria com `rgb`, e o guardiao reprovaria o proprio `color-mix`.
//
// `transparent`, `currentColor` e `inherit` FICAM DE FORA de proposito. Nao sao cor cravada: sao
// palavras-chave de composicao, e o `color-mix(..., transparent)` e a forma que este arquivo usa
// para esmaecer token. Sem essa excecao o teste ficaria vermelho na hora, em tres pontos ja
// existentes dos blocos guardados.
const NOMES_DE_COR = [
  "aliceblue",
  "antiquewhite",
  "aqua",
  "aquamarine",
  "azure",
  "beige",
  "bisque",
  "black",
  "blanchedalmond",
  "blue",
  "blueviolet",
  "brown",
  "burlywood",
  "cadetblue",
  "chartreuse",
  "chocolate",
  "coral",
  "cornflowerblue",
  "cornsilk",
  "crimson",
  "cyan",
  "darkblue",
  "darkcyan",
  "darkgoldenrod",
  "darkgray",
  "darkgreen",
  "darkgrey",
  "darkkhaki",
  "darkmagenta",
  "darkolivegreen",
  "darkorange",
  "darkorchid",
  "darkred",
  "darksalmon",
  "darkseagreen",
  "darkslateblue",
  "darkslategray",
  "darkslategrey",
  "darkturquoise",
  "darkviolet",
  "deeppink",
  "deepskyblue",
  "dimgray",
  "dimgrey",
  "dodgerblue",
  "firebrick",
  "floralwhite",
  "forestgreen",
  "fuchsia",
  "gainsboro",
  "ghostwhite",
  "gold",
  "goldenrod",
  "gray",
  "green",
  "greenyellow",
  "grey",
  "honeydew",
  "hotpink",
  "indianred",
  "indigo",
  "ivory",
  "khaki",
  "lavender",
  "lavenderblush",
  "lawngreen",
  "lemonchiffon",
  "lightblue",
  "lightcoral",
  "lightcyan",
  "lightgoldenrodyellow",
  "lightgray",
  "lightgreen",
  "lightgrey",
  "lightpink",
  "lightsalmon",
  "lightseagreen",
  "lightskyblue",
  "lightslategray",
  "lightslategrey",
  "lightsteelblue",
  "lightyellow",
  "lime",
  "limegreen",
  "linen",
  "magenta",
  "maroon",
  "mediumaquamarine",
  "mediumblue",
  "mediumorchid",
  "mediumpurple",
  "mediumseagreen",
  "mediumslateblue",
  "mediumspringgreen",
  "mediumturquoise",
  "mediumvioletred",
  "midnightblue",
  "mintcream",
  "mistyrose",
  "moccasin",
  "navajowhite",
  "navy",
  "oldlace",
  "olive",
  "olivedrab",
  "orange",
  "orangered",
  "orchid",
  "palegoldenrod",
  "palegreen",
  "paleturquoise",
  "palevioletred",
  "papayawhip",
  "peachpuff",
  "peru",
  "pink",
  "plum",
  "powderblue",
  "purple",
  "rebeccapurple",
  "red",
  "rosybrown",
  "royalblue",
  "saddlebrown",
  "salmon",
  "sandybrown",
  "seagreen",
  "seashell",
  "sienna",
  "silver",
  "skyblue",
  "slateblue",
  "slategray",
  "slategrey",
  "snow",
  "springgreen",
  "steelblue",
  "tan",
  "teal",
  "thistle",
  "tomato",
  "turquoise",
  "violet",
  "wheat",
  "white",
  "whitesmoke",
  "yellow",
  "yellowgreen"
];
const NOME_COR = new RegExp(`(?<![\\w-])(?:${NOMES_DE_COR.join("|")})(?![\\w-])`, "giu");

interface Bloco {
  nome: string;
  inicio: number;
  fim: number;
}

interface Achado {
  bloco: string;
  linha: number;
  valor: string;
}

/**
 * Apaga o CONTEUDO dos comentarios mantendo as quebras de linha, para que o numero de linha
 * do achado continue batendo com o arquivo. Sem isso o guardiao reprovaria o proprio SHELL-02b,
 * cujo comentario cita hex, versao e linha de arquivo no texto explicativo.
 */
function semComentarios(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//gu, (comentario) => comentario.replace(/[^\n]/gu, " "));
}

function blocosDaFrente(css: string): Bloco[] {
  const linhas = css.split("\n");
  const blocos: Bloco[] = [];
  let aberto: { nome: string; inicio: number } | null = null;

  for (const [indice, linha] of linhas.entries()) {
    const texto = linha ?? "";
    const abre = ABRE.exec(texto);
    if (abre?.[1] !== undefined && aberto === null) {
      aberto = { nome: abre[1], inicio: indice + 1 };
      continue;
    }
    const fecha = FECHA.exec(texto);
    if (fecha?.[1] !== undefined && aberto !== null && fecha[1] === aberto.nome) {
      blocos.push({ nome: aberto.nome, inicio: aberto.inicio, fim: indice + 1 });
      aberto = null;
    }
  }

  if (aberto !== null) {
    throw new Error(`bloco ${aberto.nome} abriu na linha ${aberto.inicio} e nunca fechou — banner quebrado`);
  }
  return blocos;
}

/** Varre um CSS JA sem comentarios e devolve todo valor de cor literal, com a linha real. */
function achadosEm(cssSemComentarios: string, blocos: Bloco[]): Achado[] {
  const linhas = cssSemComentarios.split("\n");
  const achados: Achado[] = [];

  for (const bloco of blocos) {
    for (let n = bloco.inicio; n <= bloco.fim; n += 1) {
      const linha = linhas[n - 1] ?? "";
      // O padrao novo entra AQUI, e nao so nos casos sinteticos: um guardiao que so reprova no
      // proprio teste e teatro — a varredura de verdade continuaria cega.
      for (const padrao of [HEX, FUNCAO_COR, NOME_COR]) {
        padrao.lastIndex = 0;
        for (const encontrado of linha.matchAll(padrao)) {
          achados.push({ bloco: bloco.nome, linha: n, valor: encontrado[0] });
        }
      }
    }
  }
  return achados;
}

/** Atalho para os testes sinteticos: um bloco fabricado, medido do inicio ao fim do texto. */
function achadosNoTrecho(css: string): Achado[] {
  const limpo = semComentarios(css);
  return achadosEm(limpo, [{ nome: "TRECHO", inicio: 1, fim: limpo.split("\n").length }]);
}

function descrever(achados: Achado[]): string {
  return achados.map((a) => `${a.bloco} · main.css:${a.linha} · ${a.valor}`).join("\n");
}

/**
 * Os dois blocos `:root` — o claro e o escuro. Precisa de extrator proprio porque o
 * `blocosDaFrente` so entende banner `INICIO`/`FIM`, e o `:root` nao tem banner.
 *
 * Conta chaves em vez de procurar o primeiro `}`: um `color-mix()` ou uma sombra composta nao tem
 * chave, mas o dia em que alguem aninhar algo ali dentro, parar no primeiro `}` cortaria o bloco
 * pela metade e o snapshot passaria a mentir por omissao.
 */
function tokensDoRoot(css: string, seletor: string): string[] {
  const inicio = css.indexOf(`${seletor} {`);
  if (inicio === -1) throw new Error(`nao achei o bloco ${seletor} em main.css`);
  let profundidade = 0;
  let fim = inicio;
  for (let i = css.indexOf("{", inicio); i < css.length; i += 1) {
    if (css[i] === "{") profundidade += 1;
    if (css[i] === "}") {
      profundidade -= 1;
      if (profundidade === 0) {
        fim = i;
        break;
      }
    }
  }
  return semComentarios(css.slice(inicio, fim))
    .split("\n")
    .map((linha) => linha.trim())
    .filter((linha) => linha.startsWith("--cx-"))
    .map((linha) => linha.replace(/;\s*$/u, ""));
}

const BLOCOS = blocosDaFrente(mainCss);
const ACHADOS = achadosEm(semComentarios(mainCss), BLOCOS);

describe("VIS-00 · guardiao de cor: os blocos desta frente nao podem cravar cor", () => {
  // O modo de falha mais perigoso de um guardiao nao e o vermelho: e o verde por nao ter olhado
  // nada. Se o banner mudar de formato e o regex parar de casar, BLOCOS vira [] e todos os testes
  // abaixo passam vazios. Esta assercao e o que impede isso.
  it("encontrou os blocos datados, incluindo os que ja existem", () => {
    expect(BLOCOS.length).toBeGreaterThan(0);
    expect(BLOCOS.map((b) => b.nome)).toEqual(expect.arrayContaining(["SHELL-01", "SHELL-02"]));
  });

  it("nenhum valor de cor literal dentro dos blocos", () => {
    expect(ACHADOS, `cor cravada nos blocos desta frente:\n${descrever(ACHADOS)}`).toEqual([]);
  });
});

describe("VIS-00 · o guardiao pega o que tem de pegar", () => {
  it.each([
    ["hex de 6", "color: #6515dd;"],
    ["hex de 3", "color: #fff;"],
    ["hex com alfa", "background: #6515dd1a;"],
    ["rgb()", "color: rgb(101, 21, 221);"],
    ["rgba()", "background: rgba(101, 21, 221, 0.1);"],
    ["hsl()", "color: hsl(266, 83%, 47%);"],
    ["hsla()", "background: hsla(266, 83%, 47%, 0.1);"]
  ])("reprova %s", (_rotulo, declaracao) => {
    expect(achadosNoTrecho(`.x {\n  ${declaracao}\n}`)).not.toEqual([]);
  });

  it("aponta a linha certa do achado", () => {
    const achados = achadosNoTrecho(".x {\n  gap: var(--cx-sp-2);\n  color: #dc2626;\n}");
    expect(achados).toHaveLength(1);
    expect(achados[0]?.linha).toBe(3);
    expect(achados[0]?.valor).toBe("#dc2626");
  });
});

describe("VIS-00 · o guardiao NAO atrapalha as formas permitidas", () => {
  it.each([
    ["var() puro", "color: var(--cx-ink);"],
    ["var() com fallback de token", "background: var(--cat-entradas-soft, var(--cx-surface-sunken));"],
    ["color-mix sobre token", "background: color-mix(in srgb, var(--cat-despesas-base) 18%, transparent);"],
    ["numero que nao e cor", "min-height: 44px;"],
    ["sombra composta por token", "box-shadow: var(--cx-e-1);"]
  ])("aceita %s", (_rotulo, declaracao) => {
    expect(achadosNoTrecho(`.x {\n  ${declaracao}\n}`)).toEqual([]);
  });

  // O SHELL-02b explica a conta do Vuetify e cita versao e numero de linha no texto. Se o
  // guardiao lesse comentario, ele reprovaria a documentacao que ele proprio pediu que existisse.
  it("ignora o que esta dentro de comentario", () => {
    expect(achadosNoTrecho("/* a marca e #6515dd e o canvas e #f4f6fa */\n.x {\n  color: var(--cx-ink);\n}")).toEqual(
      []
    );
  });

  it("volta a enxergar depois que o comentario fecha", () => {
    const achados = achadosNoTrecho("/* #6515dd */\n.x {\n  color: #35128c;\n}");
    expect(achados).toHaveLength(1);
    expect(achados[0]?.linha).toBe(3);
  });
});

describe("VIS-00 · o guardiao pega NOME de cor, nao so hex", () => {
  it.each([
    ["red", "color: red;"],
    ["white", "background: white;"],
    ["black", "border-color: black;"],
    ["rebeccapurple", "color: rebeccapurple;"]
  ])("reprova %s", (_rotulo, declaracao) => {
    expect(achadosNoTrecho(`.x {\n  ${declaracao}\n}`)).not.toEqual([]);
  });

  it.each([
    ["transparent", "background: color-mix(in srgb, var(--cx-brand) 10%, transparent);"],
    ["currentColor", "fill: currentColor;"],
    ["inherit", "color: inherit;"]
  ])("aceita %s, que e palavra-chave e nao cor cravada", (_rotulo, declaracao) => {
    expect(achadosNoTrecho(`.x {\n  ${declaracao}\n}`)).toEqual([]);
  });

  // As fronteiras. Sem elas o guardiao reprovaria o proprio vocabulario do arquivo.
  it.each([
    ["nome de token que contem 'red'", "color: var(--cx-brand-red);"],
    ["'srgb' contem 'rgb'", "background: color-mix(in srgb, var(--cx-brand) 8%, transparent);"],
    ["'tan' dentro de outra palavra", "font-variant: tabular-nums;"]
  ])("nao confunde %s", (_rotulo, declaracao) => {
    expect(achadosNoTrecho(`.x {\n  ${declaracao}\n}`)).toEqual([]);
  });
});

describe("VIS-00 · a camada de token nao muda sem alguem ver", () => {
  /*
   * POR QUE ISTO NAO CONTRADIZ A §0.1 ("zero hex novo"): o hex congelado aqui NAO e cor nova — e a
   * REFERENCIA contra a qual se mede. E o mesmo papel do `cores-categoria.test.ts`, que ja guarda
   * os hex das seis categorias para falhar quando o `main.css` divergir.
   *
   * SNAPSHOT DE VALOR, e nao so de nome, e a diferenca e o caso que motivou isto: nome pega token
   * REMOVIDO, mas nao pega token TROCADO. O `--cx-chrome` foi de 72% para 58% sem ninguem ver, e um
   * snapshot de nomes teria passado verde.
   *
   * `toMatchInlineSnapshot` de proposito: nao cria diretorio `__snapshots__` novo, e o valor fica
   * ao lado do teste, onde quem edita o `main.css` ja esta olhando.
   */
  // ATUALIZAR ESTE SNAPSHOT E UM ATO DELIBERADO, e so isso: o guardiao existe para que nenhum token
  // mude em silencio, nao para congelar a paleta para sempre. Quem adiciona ou troca um token
  // atualiza as duas listas no MESMO commit, com o motivo na mensagem — foi assim que
  // `--cx-attention` entrou pela #101 (terceiro estado: nem bom nem ruim, uma etapa ainda aberta).
  it("os tokens do :root claro sao exatamente estes", () => {
    expect(tokensDoRoot(mainCss, ":root")).toMatchInlineSnapshot(`
      [
        "--cx-canvas: var(--empresa-fundo, #f4f6fa)",
        "--cx-surface: var(--empresa-superficie, #ffffff)",
        "--cx-ink: var(--empresa-tinta, #1f2733)",
        "--cx-ink-soft: var(--empresa-tinta-suave, #5b6675)",
        "--cx-line: #e4e8ef",
        "--cx-line-soft: #eef1f6",
        "--cx-surface-sunken: color-mix(in srgb, var(--cx-ink) 4%, var(--cx-surface))",
        "--cx-surface-raised: var(--cx-surface)",
        "--cx-hover: color-mix(in srgb, var(--cx-ink) 6%, transparent)",
        "--cx-pressed: color-mix(in srgb, var(--cx-ink) 11%, transparent)",
        "--cx-brand: #6515dd",
        "--cx-brand-strong: #35128c",
        "--cx-brand-on: #ffffff",
        "--cx-brand-wash: color-mix(in srgb, var(--cx-brand) 10%, var(--cx-surface))",
        "--cx-brand-text: var(--cx-brand-strong)",
        "--cx-focus: var(--cx-brand)",
        "--cx-brand-ring: color-mix(in srgb, var(--cx-focus) 40%, transparent)",
        "--cx-brand-gradiente: linear-gradient(to right, var(--cx-brand), color-mix(in srgb, var(--cx-brand) 80%, white))",
        "--cx-brilho-forca: 8%",
        "--cx-positive: #157f3c",
        "--cx-negative: #c62828",
        "--cx-attention: #9a5b00",
        "--cx-sp-1: 4px",
        "--cx-sp-2: 8px",
        "--cx-sp-3: 12px",
        "--cx-sp-4: 16px",
        "--cx-sp-5: 20px",
        "--cx-sp-6: 24px",
        "--cx-sp-7: 32px",
        "--cx-sp-8: 48px",
        "--cx-r-sm: 8px",
        "--cx-r-md: 12px",
        "--cx-r-lg: 16px",
        "--cx-r-xl: 22px",
        "--cx-r-pill: 999px",
        "--cx-e-1: 0 1px 2px rgb(15 23 42 / 0.05), 0 4px 12px -4px rgb(15 23 42 / 0.08)",
        "--cx-e-2: 0 1px 3px rgb(15 23 42 / 0.06), 0 12px 28px -10px rgb(15 23 42 / 0.14)",
        "--cx-e-3: 0 2px 6px rgb(15 23 42 / 0.07), 0 28px 60px -18px rgb(15 23 42 / 0.2)",
        "--cx-dur-1: 120ms",
        "--cx-dur-2: 180ms",
        "--cx-dur-3: 260ms",
        "--cx-ease: cubic-bezier(0.32, 0.72, 0, 1)",
        "--cx-ease-out: cubic-bezier(0.16, 1, 0.3, 1)",
        "--cx-fs-micro: 11px",
        "--cx-fs-caption: 12px",
        "--cx-fs-body: 14px",
        "--cx-fs-lead: 16px",
        "--cx-fs-title: 20px",
        "--cx-fs-h2: 26px",
        "--cx-fs-h1: 34px",
        "--cx-tracking-tight: -0.018em",
        "--cx-tracking-wide: 0.08em",
        "--cx-chrome: color-mix(in srgb, var(--cx-surface) 58%, transparent)",
        "--cx-chrome-blur: saturate(180%) blur(24px)",
        "--cx-scrim: rgb(15 23 42 / 0.32)",
      ]
    `);
  });

  it("os tokens do :root escuro sao exatamente estes", () => {
    expect(tokensDoRoot(mainCss, ':root[data-theme="dark"]')).toMatchInlineSnapshot(`
      [
        "--cx-canvas: #0f1318",
        "--cx-surface: #191f26",
        "--cx-surface-raised: color-mix(in srgb, var(--cx-surface) 92%, white)",
        "--cx-ink: #e7e9ec",
        "--cx-ink-soft: #a6afba",
        "--cx-line: #2a323c",
        "--cx-line-soft: #232b34",
        "--cx-positive: #4ade80",
        "--cx-negative: #ff8a80",
        "--cx-attention: #f0b45f",
        "--cx-brand-text: color-mix(in srgb, var(--cx-brand) 45%, #ffffff)",
        "--cx-focus: var(--cx-brand-text)",
        "--cx-brilho-forca: 14%",
        "--cx-e-1: 0 1px 2px rgb(0 0 0 / 0.4), 0 4px 12px -4px rgb(0 0 0 / 0.5)",
        "--cx-e-2: 0 1px 3px rgb(0 0 0 / 0.45), 0 12px 28px -10px rgb(0 0 0 / 0.6)",
        "--cx-e-3: 0 2px 6px rgb(0 0 0 / 0.5), 0 28px 60px -18px rgb(0 0 0 / 0.7)",
        "--cx-chrome: color-mix(in srgb, var(--cx-surface) 62%, transparent)",
        "--cx-scrim: rgb(0 0 0 / 0.55)",
      ]
    `);
  });
});
