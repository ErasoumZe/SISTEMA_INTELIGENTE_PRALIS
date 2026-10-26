import {
  agruparProdutosCentral,
  chaveForteCentral,
  normalizarNomeCentral,
  type GrupoProdutoCentral,
  type ItemFonteCentral
} from "./central-reconciliacao.js";
import { lerFonteProdutosCentral, type FonteArquivoCentral } from "./central-fontes.js";

export interface ArquivoFonteCentral {
  fonte: FonteArquivoCentral;
  conteudo: string;
}

export interface ResultadoPreparacaoCentral {
  itens: ItemFonteCentral[];
  grupos: GrupoProdutoCentral[];
  fontes: Array<{ fonte: FonteArquivoCentral; linhas: number }>;
  barrasConflitantes: Array<{ chave: string; nomes: string[] }>;
}

/**
 * Prepara uma prévia descartável da carga: valida/parseia cada arquivo,
 * identifica EANs ambíguos e propõe grupos para revisão humana. Não persiste,
 * não escolhe decisão e não escreve no catálogo.
 */
export function prepararArquivosCentral(arquivos: ArquivoFonteCentral[]): ResultadoPreparacaoCentral {
  const fontesUnicas = new Set<FonteArquivoCentral>();
  const itens: ItemFonteCentral[] = [];
  const fontes: ResultadoPreparacaoCentral["fontes"] = [];

  for (const arquivo of arquivos) {
    if (fontesUnicas.has(arquivo.fonte)) {
      throw new Error(`A fonte ${arquivo.fonte} foi enviada mais de uma vez.`);
    }
    fontesUnicas.add(arquivo.fonte);
    const linhas = lerFonteProdutosCentral(arquivo.fonte, arquivo.conteudo);
    itens.push(...linhas);
    fontes.push({ fonte: arquivo.fonte, linhas: linhas.length });
  }

  const nomesPorChave = new Map<string, Set<string>>();
  for (const item of itens) {
    const chave = chaveForteCentral(item);
    if (!chave || !item.codigoBarras.trim()) continue;
    const nomes = nomesPorChave.get(chave) ?? new Set<string>();
    const nome = normalizarNomeCentral(item.nome);
    if (nome) nomes.add(nome);
    nomesPorChave.set(chave, nomes);
  }
  const barrasConflitantes = [...nomesPorChave]
    .filter(([, nomes]) => nomes.size > 1)
    .map(([chave, nomes]) => ({ chave, nomes: [...nomes].sort() }));

  const grupos = agruparProdutosCentral(itens, new Set(barrasConflitantes.map((conflito) => conflito.chave)));
  return { itens, grupos, fontes, barrasConflitantes };
}
