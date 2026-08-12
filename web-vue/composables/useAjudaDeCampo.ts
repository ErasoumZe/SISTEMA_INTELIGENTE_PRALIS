/**
 * Ajuda contextual do cadastro de produto: 31 dicas de campo, ligadas por um interruptor.
 *
 * **A preferencia e do USUARIO, nao do produto.** No app antigo ela vivia na coluna
 * `habilitar_ajuda` da tabela de produtos — o que significava que a mesma pessoa via dica num
 * produto e nao via no seguinte. Aqui a chave do `localStorage` carrega o id do usuario, entao a
 * escolha acompanha quem esta usando a tela, e nao exige coluna nem migration.
 */

const DICAS: Record<string, string> = {
  status: "Produto inativo some das operacoes, mas continua no historico. Nao existe exclusao.",
  codigoBarras: "Codigo de barras (EAN) do produto. Leitor USB digita direto aqui; a camera esta no botao ao lado.",
  marca: "Marca ou fabricante. Campo livre — ainda nao ha cadastro de marcas.",
  descricao: "Como o produto aparece nas listas e nos lancamentos.",
  quantidadeIndividual: "Gramatura/peso de UMA unidade. Ex.: 25 para um pacote de 25 g.",
  unidadeIndividual: "Unidade da gramatura, vinda do cadastro de Unidades (UN, KG, G, LT, ML...).",
  grupoMercadoria: "Grupo de mercadoria do produto. Define relatorio e, no futuro, a margem padrao.",
  tipo: "Revenda: compra e vende. Transformacao: vira ingrediente de uma receita.",
  codigo: "Codigo externo (do fornecedor ou do PDV). O codigo INTERNO e gerado pelo sistema.",
  embalagem: "Como o produto CHEGA na compra: saco, caixa, pacote, fardo...",
  cDe: 'C/ = "com" (caixa COM 12). DE = "de" (saco DE 25 kg).',
  quantidadeCaixa: "Quantas unidades ou medidas vem na embalagem de compra.",
  medidaCompra: "Unidade da embalagem de compra (UN, KG, LT).",
  custo: "Preco de custo da EMBALAGEM inteira, nao da unidade.",
  margem: "Margem do produto, em %. Ex.: 70 = 70%. Vazio usa a margem do grupo.",
  auto: "Ligado, o servidor calcula o preco (custo unitario x margem). Desligado, voce digita.",
  precoVenda: "Preco de venda digitado. So vale com o calculo automatico desligado.",
  quantidadeEstoque: "Saldo atual. So muda por movimentacao de estoque, nunca aqui.",
  estoqueMin: "Quando o saldo chega aqui, o pedido automatico sugere reposicao.",
  estoqueMax: "Ate onde o pedido automatico enche o estoque. Precisa ser >= o minimo.",
  setorEstoque: "Onde o produto fica guardado (LJ - CAIXAS, PROD. - PANIFICACAO...).",
  precisao: "EXATOS: peso fixo. APROXIMADOS: varia um pouco de unidade para unidade.",
  quantidadeTransformacao: "Quanto do produto entra na receita.",
  unidadeTransformacao: "Unidade da quantidade da transformacao.",
  produtoReceituario: "Produto/ingrediente do receituario, quando houver.",
  ncm: "Codigo NCM. Dado fiscal e SEMPRE digitado aqui — nunca vem da planilha.",
  cest: "Codigo CEST, quando o produto exige.",
  categoriaFiscal: "Categoria fiscal do produto.",
  cstPisCofins: "CST de PIS/COFINS.",
  aliquotas: "Aliquotas em %. O sistema apenas armazena: nao ha calculo tributario.",
  promocao: "Promocao vale so para revenda. Duas promocoes do mesmo produto nao podem se sobrepor.",
  conversoes: "Equivalencias de unidade do mesmo produto. A unidade nao pode repetir."
};

const CHAVE = "cicluz:produtos:ajuda";

export function useAjudaDeCampo(usuarioId: Ref<string | null | undefined>) {
  const ligada = ref(false);

  const chaveDoUsuario = computed(() => `${CHAVE}:${usuarioId.value ?? "anonimo"}`);

  function carregar() {
    if (typeof window === "undefined") return;
    ligada.value = window.localStorage.getItem(chaveDoUsuario.value) === "1";
  }

  function alternar() {
    ligada.value = !ligada.value;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(chaveDoUsuario.value, ligada.value ? "1" : "0");
    }
  }

  /** Dica do campo, ou `undefined` quando a ajuda esta desligada — assim a tela nao fica poluida. */
  function dica(campo: string): string | undefined {
    return ligada.value ? DICAS[campo] : undefined;
  }

  onMounted(carregar);
  watch(chaveDoUsuario, carregar);

  return { ligada, alternar, dica, totalDeDicas: Object.keys(DICAS).length };
}
