/**
 * Inspeciona a planilha operacional e imprime O QUE EXISTE em cada aba/coluna. NAO grava nada e
 * nao toca no banco — e a etapa anterior ao seeding (S7).
 *
 * Existe porque o mapa de colunas do PROJECT_BRAIN/17 §3 NAO bate com o arquivo que temos (ver o
 * relatorio no fim da execucao). Semear cadastro de producao a partir de um mapa errado criaria
 * grupos e contas com nome trocado — e cadastro errado e pior que cadastro faltando, porque ninguem
 * desconfia dele. Este script serve para o Jose confirmar coluna por coluna ANTES de existir apply.
 *
 * Uso:
 *   npm run planilha:inspecionar --workspace @padaria/db
 *   npm run planilha:inspecionar --workspace @padaria/db -- --arquivo "caminho/outro.xlsx"
 */
import { abrirPlanilha, type Planilha } from "./planilha-xlsx.js";

const ARQUIVO_PADRAO =
  "../CADASTRO DE PRODUTOS/tabela/Cópia de CENTRAL PRODUTOS (BASE) - CICLUZ GESTÃO PROFISSIONAL  (1).xlsx";

function argumento(nome: string): string | undefined {
  const indice = process.argv.indexOf(`--${nome}`);
  return indice >= 0 ? process.argv[indice + 1] : undefined;
}

const letraDaColuna = (indice: number): string => {
  let restante = indice;
  let letra = "";
  do {
    letra = String.fromCharCode(65 + (restante % 26)) + letra;
    restante = Math.floor(restante / 26) - 1;
  } while (restante >= 0);
  return letra;
};

// Descarta o ruido do export do Google Sheets: indices numericos de linha e letras soltas de
// cabecalho ("E", "F", ...) que nao sao dado de negocio.
const ehRuido = (valor: string) => /^\d+([.,]\d+)?$/.test(valor) || valor.length <= 2;

type ResumoColuna = { coluna: string; distintos: number; prefixo: string; exemplos: string[] };

function resumirColunas(linhas: string[][], pularCabecalho: number): ResumoColuna[] {
  const corpo = linhas.slice(pularCabecalho);
  const larguraMaxima = corpo.reduce((maior, linha) => Math.max(maior, linha.length), 0);
  const resumo: ResumoColuna[] = [];

  for (let coluna = 0; coluna < larguraMaxima; coluna += 1) {
    const valores = [...new Set(corpo.map((linha) => (linha[coluna] ?? "").trim()).filter((v) => v && !ehRuido(v)))];
    if (!valores.length) continue;
    // Prefixo dominante ("DES", "MER", "CNT"...) — e ele que identifica o dominio da coluna.
    const contagem = new Map<string, number>();
    for (const valor of valores) {
      const prefixo = valor.split(/[\s⁠]/)[0] ?? "";
      contagem.set(prefixo, (contagem.get(prefixo) ?? 0) + 1);
    }
    const dominante = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    resumo.push({
      coluna: letraDaColuna(coluna),
      distintos: valores.length,
      prefixo: dominante,
      exemplos: valores.slice(0, 3)
    });
  }
  return resumo;
}

function inspecionarAba(planilha: Planilha, nome: string, pularCabecalho: number) {
  const aba = planilha.ler(nome);
  const comConteudo = aba.linhas.filter((linha) => linha.some((celula) => celula));
  const quebradas = comConteudo.filter((linha) => linha.some((celula) => celula.includes("#REF"))).length;

  console.log(`\n===== ${nome}`);
  console.log(`  linhas com conteudo: ${comConteudo.length}${quebradas ? `  |  COM #REF!: ${quebradas}` : ""}`);
  if (quebradas && comConteudo.length <= quebradas + 1) {
    console.log("  !! ABA QUEBRADA: as formulas apontam para intervalo apagado. Este arquivo nao serve.");
    return;
  }
  console.log("  COLUNA | DISTINTOS | PREFIXO   | EXEMPLOS");
  for (const linha of resumirColunas(comConteudo, pularCabecalho)) {
    const exemplos = linha.exemplos.map((exemplo) => exemplo.slice(0, 38)).join(" · ");
    console.log(
      `  ${linha.coluna.padEnd(6)} | ${String(linha.distintos).padStart(9)} | ${linha.prefixo.slice(0, 9).padEnd(9)} | ${exemplos}`
    );
  }
}

function main() {
  const caminho = argumento("arquivo") ?? ARQUIVO_PADRAO;
  console.log(`Planilha: ${caminho}\n(NENHUMA gravacao — inspecao apenas)`);

  const planilha = abrirPlanilha(caminho);
  console.log(`\nAbas (${planilha.abas.length}):`);
  for (const aba of planilha.abas) console.log(`  - ${aba}`);

  // Pula as 4 primeiras linhas: o export do Sheets traz indices e rotulos de coluna antes do dado.
  for (const aba of planilha.abas) {
    if (aba.includes("GRUPOSREF") || aba.includes("PATRIMONIO") || aba.includes("FOLHA PAGAME")) {
      inspecionarAba(planilha, aba, 4);
    }
  }

  console.log(`
--------------------------------------------------------------------------
CONFERIR ANTES DE QUALQUER GRAVACAO (PROJECT_BRAIN/17 §3 x arquivo real):
  o §3 mapeia contas em "G/Z/AA" e retiradas em "X/Y", mas neste arquivo as
  CONTAS estao em X/Y ("CNT CONTA - ...") e nao ha coluna com prefixo "RET".
  O §3 tambem aponta tipos de produto em "V", onde estao os "INVESTIMENTO - ".
  Enquanto o mapa nao for confirmado pelo Jose, NAO existe caminho de apply.
--------------------------------------------------------------------------`);
}

main();
