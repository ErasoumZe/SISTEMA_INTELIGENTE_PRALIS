// Descontos da discriminacao em 3 NIVEIS, com rateio (PROJECT_BRAIN/17 §5, D4).
// Funcao PURA: nenhuma dependencia de banco, HTTP ou Vue. Serve o servidor (que grava) e o front
// (que mostra o preview) — uma conta so, um resultado so.
//
// Os tres niveis sao CUMULATIVOS e se aplicam nesta ordem:
//   1. V.UNIT do item      -> muda o unitario; NAO rateia nada (o desconto ja e por unidade).
//   2. V.TOTAL do item     -> muda o total daquele item; recalcula o unitario dele.
//   3. TOTAL GERAL         -> RATEIA entre os itens proporcionalmente ao valor de cada um.
//
// FONTE DA VERDADE (nao inverta isto):
//   `valorTotalComDescontoCentavos` e AUTORITATIVO — e a soma dele que reconcilia com o lancamento.
//   `valorUnitarioComDescontoCentavos` e DERIVADO (total / quantidade, arredondado em centavos) e
//   existe para custo e exibicao. unitario x quantidade PODE NAO reconciliar com o total por
//   arredondamento (3,30 / 4 = 0,825 -> 0,83; 0,83 x 4 = 3,32) e isso e ESPERADO. Nunca recalcule
//   o total a partir do unitario.
import { paraCentavos } from "../dinheiro/index.js";

export type TipoDesconto = "percentual" | "valor";

type Numerico = number | string | null | undefined;

export type ItemDiscriminacao = {
  quantidade: Numerico;
  valorUnitario: Numerico;
  // Nivel 1 — desconto no V.UNIT (R$ POR UNIDADE quando tipo 'valor').
  descontoTipo?: TipoDesconto | null;
  descontoValor?: Numerico;
  // Nivel 2 — desconto no V.TOTAL do item.
  descontoTotalTipo?: TipoDesconto | null;
  descontoTotalValor?: Numerico;
};

export type ItemDiscriminacaoCalculado = {
  // Bruto: quantidade x valor unitario informado, sem desconto nenhum.
  valorBrutoCentavos: number;
  // Liquido dos descontos DE ITEM (niveis 1 e 2). E a soma DESTE campo que a validacao D5 compara
  // com o valor do lancamento, e e ele que vai para a coluna valor_total.
  valorTotalCentavos: number;
  // Quanto do desconto GERAL (nivel 3) coube a este item no rateio.
  rateioDescontoGeralCentavos: number;
  // AUTORITATIVO: liquido dos tres niveis.
  valorTotalComDescontoCentavos: number;
  // DERIVADO do campo acima (total / quantidade). Para custo e exibicao.
  valorUnitarioComDescontoCentavos: number;
};

export type DiscriminacaoCalculada = {
  itens: ItemDiscriminacaoCalculado[];
  // Soma dos valorTotalCentavos — o numero que a D5 confronta com o valor do lancamento.
  totalItensCentavos: number;
  // Desconto geral resolvido em R$ (centavos). Vai para a coluna valor_desconto do cabecalho.
  descontoGeralCentavos: number;
  // Soma dos valorTotalComDescontoCentavos. Igual a totalItens - descontoGeral, por construcao.
  totalComDescontoCentavos: number;
};

// Arredondamento monetario: meio para cima (0,825 -> 0,83), o que a padaria espera ver na tela.
function arredondar(valor: number): number {
  return Math.round(valor);
}

function naoNegativo(centavos: number): number {
  return centavos > 0 ? centavos : 0;
}

function numero(valor: Numerico): number {
  if (valor === null || valor === undefined || valor === "") return 0;
  const convertido = typeof valor === "number" ? valor : Number(String(valor).replace(",", "."));
  return Number.isFinite(convertido) ? convertido : 0;
}

// Desconto de UM nivel sobre uma base ja em centavos. Percentual usa a base; valor e R$ direto.
function descontoCentavos(base: number, tipo: TipoDesconto | null | undefined, valor: Numerico): number {
  if (!tipo || valor === null || valor === undefined || valor === "") return 0;
  if (tipo === "percentual") return arredondar((base * numero(valor)) / 100);
  return paraCentavos(valor);
}

// Nivel 1 + nivel 2 de UM item, em centavos inteiros.
function calcularTotaisDoItem(item: ItemDiscriminacao) {
  const quantidade = numero(item.quantidade);
  // O unitario tem 4 casas no banco; a conta e feita em centavos com uma unica reducao no total.
  const unitarioCentavos = numero(item.valorUnitario) * 100;
  const valorBrutoCentavos = arredondar(quantidade * unitarioCentavos);

  // Nivel 1 incide no UNITARIO: em 'valor' e R$ por unidade, entao multiplica pela quantidade.
  const descontoUnitario = descontoCentavos(unitarioCentavos, item.descontoTipo, item.descontoValor);
  const aposNivel1 = naoNegativo(valorBrutoCentavos - arredondar(descontoUnitario * quantidade));

  // Nivel 2 incide no TOTAL do item, ja liquido do nivel 1 (cumulativo).
  const descontoTotal = descontoCentavos(aposNivel1, item.descontoTotalTipo, item.descontoTotalValor);
  return { quantidade, valorBrutoCentavos, valorTotalCentavos: naoNegativo(aposNivel1 - descontoTotal) };
}

// Rateio D4: proporcional ao valor de cada item, em centavos, SOBRA NO ULTIMO item. Truncar os
// primeiros e dar o resto ao ultimo garante que a soma das partes seja exatamente o desconto —
// nenhum centavo aparece nem some (10,00 sobre 3 itens iguais = 3,33 + 3,33 + 3,34).
function ratearCentavos(total: number, pesos: number[]): number[] {
  const somaPesos = pesos.reduce((soma, peso) => soma + peso, 0);
  if (total <= 0 || somaPesos <= 0) return pesos.map(() => 0);
  const partes = pesos.map((peso) => Math.floor((total * peso) / somaPesos));
  const distribuido = partes.reduce((soma, parte) => soma + parte, 0);
  const ultimo = partes.length - 1;
  partes[ultimo] = (partes[ultimo] ?? 0) + (total - distribuido);
  return partes;
}

export function calcularDiscriminacao(entrada: {
  itens: readonly ItemDiscriminacao[];
  descontoGeralTipo?: TipoDesconto | null;
  descontoGeralValor?: Numerico;
}): DiscriminacaoCalculada {
  const totais = entrada.itens.map(calcularTotaisDoItem);
  const totalItensCentavos = totais.reduce((soma, item) => soma + item.valorTotalCentavos, 0);

  // Nivel 3 sobre a soma dos itens ja liquidos dos niveis 1 e 2 (cumulativo). Nunca desconta mais
  // do que existe: um desconto geral maior que o total zera o lancamento em vez de virar negativo.
  const descontoGeralBruto = descontoCentavos(
    totalItensCentavos,
    entrada.descontoGeralTipo,
    entrada.descontoGeralValor
  );
  const descontoGeralCentavos = Math.min(descontoGeralBruto, totalItensCentavos);

  const rateio = ratearCentavos(
    descontoGeralCentavos,
    totais.map((item) => item.valorTotalCentavos)
  );

  const itens = totais.map((item, indice) => {
    const rateioDescontoGeralCentavos = rateio[indice] ?? 0;
    const valorTotalComDescontoCentavos = naoNegativo(item.valorTotalCentavos - rateioDescontoGeralCentavos);
    return {
      valorBrutoCentavos: item.valorBrutoCentavos,
      valorTotalCentavos: item.valorTotalCentavos,
      rateioDescontoGeralCentavos,
      valorTotalComDescontoCentavos,
      // DERIVADO — ver a nota de fonte da verdade no topo do arquivo.
      valorUnitarioComDescontoCentavos:
        item.quantidade > 0 ? arredondar(valorTotalComDescontoCentavos / item.quantidade) : 0
    };
  });

  return {
    itens,
    totalItensCentavos,
    descontoGeralCentavos,
    totalComDescontoCentavos: totalItensCentavos - descontoGeralCentavos
  };
}

// --- Descricao por CODIGO DE BARRAS (§5) -----------------------------------------------------
// Item vindo da NF-e traz o EAN (cEAN) e a descricao do FORNECEDOR, que costuma ser abreviada e
// diferente a cada nota ("REFRIG COLA 2L" vs "Refrigerante Cola 2 litros"). Quando o EAN casa com
// produtos.codigoBarras, vale o nome do CADASTRO — e o item ja nasce ligado ao produto e ao grupo
// dele. Sem match, a descricao da nota e mantida e o item fica marcado como NAO CADASTRADO, para a
// pessoa cadastrar o produto depois (nunca inventamos um cadastro a partir da nota).
export type ProdutoPorEan = { id: string; descricao: string; grupoMercadoriaId: string | null };

export type ItemResolvidoPorEan = {
  descricao: string;
  produtoId: string | null;
  grupoMercadoriaId: string | null;
  naoCadastrado: boolean;
};

export function resolverItemPorEan(
  item: { ean?: string | null; descricao?: string | null },
  produtosPorEan: ReadonlyMap<string, ProdutoPorEan>
): ItemResolvidoPorEan {
  const descricaoNota = (item.descricao ?? "").trim();
  const ean = (item.ean ?? "").trim();
  const produto = ean ? produtosPorEan.get(ean) : undefined;
  if (produto) {
    return {
      descricao: produto.descricao,
      produtoId: produto.id,
      grupoMercadoriaId: produto.grupoMercadoriaId,
      naoCadastrado: false
    };
  }
  return {
    descricao: descricaoNota || "Item sem descricao",
    produtoId: null,
    grupoMercadoriaId: null,
    naoCadastrado: true
  };
}

// --- Origem do GRUPO do item (§5, item 6) ----------------------------------------------------
// "Grupo: do cadastro de produtos; se maquinario/manutencao -> do cadastro de patrimonio." Sao
// cadastros em tabelas diferentes, entao o item carrega DOIS campos (grupo proprio + patrimonio) e
// no maximo UM vem preenchido.
//
// NENHUM preenchido e legitimo: item sem grupo sempre foi aceito (o contrato, o servico e a UI
// permitem) e o historico esta cheio deles. A regra e "no maximo um", nunca "exatamente um".
//
// Este predicado e o mesmo do CHECK *_grupo_unico_check no banco, de proposito: aqui a pessoa
// recebe 400 com mensagem util; la o dado nao tem como entrar errado por nenhuma outra porta
// (script, seed, importacao). Regra de dinheiro/integridade se defende nas duas pontas.
export const MENSAGEM_GRUPO_DE_DUAS_ORIGENS =
  "O item aceita grupo de UMA origem so: o do cadastro proprio ou o do patrimonio.";

export function itemTemGrupoDeDuasOrigens(
  grupoProprioId: string | null | undefined,
  grupoPatrimonioId: string | null | undefined
): boolean {
  return Boolean(grupoProprioId) && Boolean(grupoPatrimonioId);
}

// --- Validacao D5 (BLOQUEANTE) ---------------------------------------------------------------
// A soma da discriminacao tem de bater com o Valor do lancamento. Quando nao bate, o servidor NAO
// salva e devolve ONDE diverge: a diferenca em centavos e a linha provavel (a de maior valor, que
// e onde um erro de digitacao costuma estar), para a pessoa conferir em vez de cacar no escuro.
export type DivergenciaDiscriminacao = {
  totalItensCentavos: number;
  valorLancamentoCentavos: number;
  diferencaCentavos: number;
  // 1-based: e o numero da LINHA como a pessoa ve na tela.
  linhaProvavel: number | null;
  campoProvavel: "valorTotal" | null;
};

export function conferirDiscriminacao(
  itens: readonly ItemDiscriminacao[],
  valorLancamento: Numerico
): DivergenciaDiscriminacao | null {
  const calculo = calcularDiscriminacao({ itens });
  const valorLancamentoCentavos = paraCentavos(valorLancamento);
  const diferencaCentavos = calculo.totalItensCentavos - valorLancamentoCentavos;
  if (diferencaCentavos === 0) return null;

  const maiorItem = calculo.itens.reduce(
    (maior, item, indice) =>
      item.valorTotalCentavos > (maior?.valor ?? -1) ? { indice, valor: item.valorTotalCentavos } : maior,
    null as { indice: number; valor: number } | null
  );

  return {
    totalItensCentavos: calculo.totalItensCentavos,
    valorLancamentoCentavos,
    diferencaCentavos,
    linhaProvavel: maiorItem ? maiorItem.indice + 1 : null,
    campoProvavel: maiorItem ? "valorTotal" : null
  };
}
