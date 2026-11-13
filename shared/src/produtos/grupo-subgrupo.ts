/**
 * Grupo e subgrupo de mercadoria (decisão do José, 13/11/2026, igual ao S2).
 *
 * No S1 cada grupo de mercadoria é UM registro com o nome completo da planilha oficial, ex.:
 * "MER BEBIDAS - SUCOS". O nome não muda: a integração com o PDV procura o ID do grupo por esse nome
 * (R-222). A divisão é só de leitura: o grupo é o texto antes do primeiro " - " (sem o prefixo "MER")
 * e o subgrupo é o resto. Grupo sem " - " (ex.: "Insumos") não tem subgrupo.
 */
import { chaveDeGrupo } from "./grupo-id.js";

export interface GrupoMercadoriaNomeado {
  id: string;
  nome: string;
}

export interface GrupoMercadoriaSeparado {
  grupo: string;
  subgrupo: string;
}

export interface SubgrupoDeMercadoria {
  /** ID do registro de grupo de mercadoria (o que o produto guarda). */
  id: string;
  /** Nome completo do registro, como está no banco. */
  nome: string;
  /** "" quando o registro é o próprio grupo, sem subgrupo. */
  subgrupo: string;
}

export interface GrupoDeMercadoriaComSubgrupos {
  /** Chave estável do grupo (sem acento, maiúsculas): dois registros do mesmo grupo caem na mesma chave. */
  chave: string;
  grupo: string;
  subgrupos: SubgrupoDeMercadoria[];
}

const SEPARADOR = " - ";

/** Tira os caracteres invisíveis (a planilha traz U+2060 em vários nomes) e os espaços repetidos. */
function limpar(nome: string | null | undefined): string {
  return String(nome ?? "")
    .replace(/\p{Cf}/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

/** Chave de comparação: a mesma do ID do grupo no PDV (sem acento, maiúsculas e espaços simples). */
export const chaveDeGrupoMercadoria = chaveDeGrupo;

export function separarGrupoMercadoria(nome: string | null | undefined): GrupoMercadoriaSeparado {
  const texto = limpar(nome).replace(/^MER\.?\s+/iu, "");
  const posicao = texto.indexOf(SEPARADOR);
  if (posicao < 0) return { grupo: texto, subgrupo: "" };
  return {
    grupo: texto.slice(0, posicao).trim(),
    subgrupo: texto.slice(posicao + SEPARADOR.length).trim()
  };
}

/** Rótulo de leitura: "BEBIDAS › SUCOS" (ou só "Insumos" quando não há subgrupo). */
export function rotuloGrupoMercadoria(nome: string | null | undefined): string {
  const { grupo, subgrupo } = separarGrupoMercadoria(nome);
  return subgrupo ? `${grupo} › ${subgrupo}` : grupo;
}

/**
 * Agrupa os registros pelo grupo, em ordem alfabética de grupo e de subgrupo. O registro sem subgrupo vem
 * primeiro dentro do seu grupo.
 */
export function arvoreGruposMercadoria(grupos: readonly GrupoMercadoriaNomeado[]): GrupoDeMercadoriaComSubgrupos[] {
  const porChave = new Map<string, GrupoDeMercadoriaComSubgrupos>();
  for (const registro of grupos) {
    const { grupo, subgrupo } = separarGrupoMercadoria(registro.nome);
    if (!grupo) continue;
    const chave = chaveDeGrupoMercadoria(grupo);
    const atual = porChave.get(chave) ?? { chave, grupo, subgrupos: [] };
    // O nome do grupo mostrado vem do registro com prefixo "MER" quando existe (a forma oficial).
    if (registro.nome.trim().toUpperCase().startsWith("MER")) atual.grupo = grupo;
    atual.subgrupos.push({ id: registro.id, nome: registro.nome, subgrupo });
    porChave.set(chave, atual);
  }
  const ordem = (a: string, b: string) => a.localeCompare(b, "pt-BR", { sensitivity: "base" });
  return [...porChave.values()]
    .map((item) => ({
      ...item,
      subgrupos: [...item.subgrupos].sort((a, b) =>
        a.subgrupo === b.subgrupo
          ? ordem(a.nome, b.nome)
          : !a.subgrupo
            ? -1
            : !b.subgrupo
              ? 1
              : ordem(a.subgrupo, b.subgrupo)
      )
    }))
    .sort((a, b) => ordem(a.grupo, b.grupo));
}

/** Grupo (da árvore) do registro com este ID, ou null. */
export function grupoDoRegistro(
  arvore: readonly GrupoDeMercadoriaComSubgrupos[],
  id: string | null | undefined
): GrupoDeMercadoriaComSubgrupos | null {
  if (!id) return null;
  return arvore.find((item) => item.subgrupos.some((sub) => sub.id === id)) ?? null;
}
