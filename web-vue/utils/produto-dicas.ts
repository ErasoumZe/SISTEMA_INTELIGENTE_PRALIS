const DICAS_PRODUTO: Record<string, string> = {
  marca: "Marca/fabricante do produto.",
  codigoBarras: "Código de barras (EAN) do produto, se houver.",
  descricao: 'Nome do produto, sem a gramatura. Ex.: "Talento Meio Amargo".',
  quantidadeIndividual: "Gramatura/peso da unidade. Ex.: 25 (para 25 g).",
  unidadeIndividual: "Unidade da gramatura: UN, KG, G, LT ou ML.",
  embalagem: "Embalagem de compra: saco, caixa, pacote, fardo...",
  cDe: 'C/ = "com" (caixa com 12). DE = "de" (saco de 25 kg).',
  quantidadeCaixa: "Quantas unidades/medidas vêm na embalagem de compra.",
  medidaCompra: "Unidade da embalagem de compra (UN, KG, LT).",
  grupoMercadoria: "Grupo de mercadorias. Define a regra fiscal e a margem padrão.",
  compraAproximada: 'Aproximado escreve "aproximadamente" na frase. Use para peso variável, como caixa de queijo.',
  setorEstoque: "Onde o produto fica armazenado.",
  setorVenda1: "Setor em que o produto é vendido. Não é o setor de estoque.",
  setorVenda2: "Segundo setor de venda, quando o produto for vendido em mais de um.",
  localVenda1: "Onde o produto é exposto para venda.",
  localVenda2: "Segundo local de exposição, quando houver.",
  estoqueMin: "Quantidade mínima desejada no estoque.",
  estoqueMax: "Quantidade máxima desejada no estoque.",
  custo: "Preço de custo do produto (R$).",
  precoVenda: "Preço de venda definido na mão (quando o cálculo automático está desligado).",
  precisao: "EXATOS (peso fixo) ou APROXIMADOS (varia um pouco).",
  quantidadeTransformacao: "Quantidade usada na ficha de transformação ou receita.",
  unidadeTransformacao: "Unidade da quantidade de transformação, como UN, G ou ML.",
  produtoReceituario: "Produto ou ingrediente relacionado ao receituário.",
  refReceituario: "Referência do item no receituário.",
  ncm: "Código NCM do produto.",
  cest: "Código CEST, quando aplicável.",
  categoriaFiscal: "Categoria fiscal do produto.",
  cstPisCofins: "CST de PIS e COFINS.",
  aliquotaCheia: "Alíquota cheia, em percentual.",
  aliquotaFcp: "Alíquota do FCP, em percentual.",
  icms: "Alíquota de ICMS, em percentual.",
  aliquotaPis: "Alíquota de PIS, em percentual.",
  aliquotaCofins: "Alíquota de COFINS, em percentual.",
  reducaoIcms: "Percentual de redução da base de ICMS."
};

export function dicaProduto(
  campo: string,
  habilitarAjuda: boolean,
  dicaPersonalizada?: (campo: string) => string | undefined
): string | undefined {
  return dicaPersonalizada?.(campo) || (habilitarAjuda ? DICAS_PRODUTO[campo] : undefined);
}
