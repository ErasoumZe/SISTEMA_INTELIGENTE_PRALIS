// R-238: cada linha do resumo do Caixa abre a consulta da tela dela. Quem nao tem a tela (PDV 1, 2 e 3 nao
// tem Entradas nem Saidas) nao ve a linha: um atalho que abre e da "sem permissao" e pior que nenhum.
// A permissao vem da MESMA checagem do menu; sem ela (quem chama nao passou), nada e escondido.
import type { Permissao } from "@padaria/shared";

const PERMISSAO_DA_CATEGORIA: Partial<Record<string, Permissao>> = {
  entradas: "entradas_visualizar",
  despesas: "despesas_visualizar",
  mercadorias: "mercadorias_visualizar",
  retiradas: "retiradas_visualizar"
};

export function categoriasDoCaixaPermitidas<T extends { chave: string }>(
  categorias: T[],
  temPermissao?: (permissao: Permissao) => boolean
): T[] {
  if (!temPermissao) return categorias;
  return categorias.filter((categoria) => {
    const permissao = PERMISSAO_DA_CATEGORIA[categoria.chave];
    return !permissao || temPermissao(permissao);
  });
}
