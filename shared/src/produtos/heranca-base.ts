/**
 * Heranca BASE -> loja, igual ao app oficial (`CAMPOS_HERDADOS` e `propagarParaLojas` do
 * ProductService), traduzida para os nomes do ERP.
 *
 * O produto nasce na BASE (so o admin cria) e a loja recebe uma COPIA. Quando o admin edita a BASE,
 * cada campo herdado desce para a copia apenas se a copia ainda tinha o valor ANTIGO da BASE — ou
 * seja, se ainda seguia aquele campo. Onde a loja tem valor proprio, ele fica. Nao precisa de coluna
 * nova: "a loja sobrescreveu" e exatamente "o valor dela e diferente do que a BASE tinha".
 *
 * Fiscal, estoque, custo, preco, setores e promocoes NAO sao herdados: sao da loja.
 */

export type TransformacaoHerdada = {
  precisao: string | null;
  quantidade: number | null;
  unidade: string | null;
  produtoReceituario: string | null;
  refReceituario: string | null;
} | null;

/** Os campos herdados de um produto, ja resolvidos para a empresa da copia (unidade e grupo por id). */
export interface ValoresHerdados {
  descricao: string;
  nomeCatalogo: string | null;
  quantidadeIndividual: number;
  unidadeIndividualId: string;
  pesavel: boolean | null;
  teclaBalanca: number | null;
  validadeBalanca: number | null;
  codigoBarras: string | null;
  marca: string | null;
  embalagem: string | null;
  cDe: string | null;
  quantidadeCaixa: number;
  medidaCompra: string | null;
  compraAproximada: boolean;
  codigoInterno: string | null;
  fotoUrl: string | null;
  grupoMercadoriaId: string | null;
  grupoIdExterno: string | null;
  tipo: "revenda" | "transformacao";
  habilitarAjuda: boolean;
  transformacao: TransformacaoHerdada;
}

export type CampoHerdado = keyof ValoresHerdados;

/** Ordem e rotulos da tela oficial (selo "nao segue mais a base"). */
export const CAMPOS_HERDADOS_DA_BASE: ReadonlyArray<{ campo: CampoHerdado; rotulo: string }> = [
  { campo: "nomeCatalogo", rotulo: "Nome" },
  { campo: "descricao", rotulo: "Nome" },
  { campo: "quantidadeIndividual", rotulo: "Quantidade" },
  { campo: "unidadeIndividualId", rotulo: "Medida base" },
  { campo: "pesavel", rotulo: "Vai para balança" },
  { campo: "teclaBalanca", rotulo: "Tecla da balança" },
  { campo: "validadeBalanca", rotulo: "Validade da balança" },
  { campo: "codigoBarras", rotulo: "Código de barras" },
  { campo: "marca", rotulo: "Marca" },
  { campo: "embalagem", rotulo: "Embalagem" },
  { campo: "cDe", rotulo: "C/DE" },
  { campo: "quantidadeCaixa", rotulo: "Qt. cadastro" },
  { campo: "medidaCompra", rotulo: "Medida de compra" },
  { campo: "compraAproximada", rotulo: "Compra aproximada" },
  { campo: "codigoInterno", rotulo: "Código interno" },
  { campo: "fotoUrl", rotulo: "Foto" },
  { campo: "grupoMercadoriaId", rotulo: "Grupo" },
  { campo: "grupoIdExterno", rotulo: "Grupo" },
  { campo: "tipo", rotulo: "Tipo" },
  { campo: "habilitarAjuda", rotulo: "Habilitar ajuda" },
  { campo: "transformacao", rotulo: "Transformação" }
];

/** Comparacao estrutural, com `undefined` e `null` iguais (oficial `mesmoValor`). */
export function mesmoValorHerdado(
  a: ValoresHerdados[CampoHerdado] | undefined,
  b: ValoresHerdados[CampoHerdado] | undefined
): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * O que a copia recebe de uma edicao da BASE: so os campos que a BASE mudou E que a copia ainda
 * seguia (igual ao valor antigo da BASE). Vazio = nada a gravar nesta loja.
 */
export function patchDeHeranca(
  antes: ValoresHerdados,
  depois: ValoresHerdados,
  copia: ValoresHerdados
): Partial<ValoresHerdados> {
  const patch: Partial<Record<CampoHerdado, ValoresHerdados[CampoHerdado]>> = {};
  for (const { campo } of CAMPOS_HERDADOS_DA_BASE) {
    if (mesmoValorHerdado(antes[campo], depois[campo])) continue; // a BASE nao mexeu neste campo
    if (!mesmoValorHerdado(copia[campo], antes[campo])) continue; // a loja tem valor proprio aqui
    patch[campo] = depois[campo];
  }
  return patch as Partial<ValoresHerdados>;
}

/** Rotulos (sem repeticao) dos campos em que a copia tem valor proprio — pararam de seguir a base. */
export function camposQueNaoSeguemABase(copia: ValoresHerdados, base: ValoresHerdados): string[] {
  const rotulos = CAMPOS_HERDADOS_DA_BASE.filter(({ campo }) => !mesmoValorHerdado(copia[campo], base[campo])).map(
    ({ rotulo }) => rotulo
  );
  return [...new Set(rotulos)];
}
