import {
  agruparProdutosCentral,
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

  const nomesPorFonteChave = new Map<string, { chave: string; nomes: Set<string> }>();
  for (const item of itens) {
    const chave = item.codigoBarras.replace(/\D/gu, "").replace(/^0+(?=\d)/u, "");
    if (!chave) continue;
    const chaveFonte = `${item.fonte}:${chave}`;
    const registro = nomesPorFonteChave.get(chaveFonte) ?? { chave, nomes: new Set<string>() };
    const nome = normalizarNomeCentral(item.nome);
    if (nome) registro.nomes.add(nome);
    nomesPorFonteChave.set(chaveFonte, registro);
  }
  const conflitos = [...nomesPorFonteChave.values()].filter(({ nomes }) => nomes.size > 1);
  const nomesDeConflitosPorChave = new Map<string, Set<string>>();
  for (const { chave, nomes } of conflitos) {
    const nomesDaChave = nomesDeConflitosPorChave.get(chave) ?? new Set<string>();
    for (const nome of nomes) nomesDaChave.add(nome);
    nomesDeConflitosPorChave.set(chave, nomesDaChave);
  }
  const barrasConflitantes = [...nomesDeConflitosPorChave].map(([chave, nomes]) => ({
    chave,
    nomes: [...nomes].sort()
  }));

  const grupos = agruparProdutosCentral(itens, new Set(barrasConflitantes.map((conflito) => conflito.chave)));
  return { itens, grupos, fontes, barrasConflitantes };
}
