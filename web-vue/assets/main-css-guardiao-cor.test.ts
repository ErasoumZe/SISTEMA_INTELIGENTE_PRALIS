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
const FUNCAO_COR = /\b(?:rgba?|hsla?)\([^)]*\d[^)]*\)/giu;

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
      for (const padrao of [HEX, FUNCAO_COR]) {
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
