// Logica PURA do cockpit do caixa (as 6 secoes por categoria), extraida para ser testavel sem Vue.
// O cockpit e uma VISAO: reaproveita os totais da API (resumo ao vivo / detalhe / historico) e os
// modais e listagens existentes. Nao recalcula nada de lancamento — so escolhe fonte e monta a config.
import type { Permissao } from "@padaria/shared";
import { temPermissao } from "@padaria/shared";
import type {
  CaixaOperacional,
  DetalheCaixaResponse,
  LancamentoCaixa,
  LinhaHistoricoCaixa,
  StatusCaixa
} from "@padaria/shared";
import type { EntidadeOperacional, OperacaoResumo, ResumoCaixa } from "~/types/padaria";

export type CategoriaLancavel = "entradas" | "transferencias" | "despesas" | "mercadorias" | "retiradas";

// Cores do Xmind para o cockpit (fonte unica). Entradas amarelo, Transferencias laranja, Despesas
// vermelho, Mercadorias verde, Retiradas azul, Resultado/Diferenca roxo.
export const CORES_COCKPIT = {
  entradas: "#ca8a04",
  transferencias: "#ea580c",
  despesas: "#dc2626",
  mercadorias: "#16a34a",
  retiradas: "#2563eb",
  resultado: "#7c3aed"
} as const satisfies Record<CategoriaLancavel | "resultado", string>;

export type TotaisPorCategoria = Record<CategoriaLancavel, number>;

interface DefinicaoCategoria {
  categoria: CategoriaLancavel;
  titulo: string;
  icone: string;
  entidade: EntidadeOperacional;
  endpoint: string;
  permissaoVisualizar: Permissao;
  // null = categoria NAO aceita "+ Lancar" manual (Entradas: so venda por integracao).
  permissaoCriar: Permissao | null;
  permissaoDiscriminar: Permissao | null;
}

// Ordem e identidade das 5 categorias com lista/lancamento. O bloco "Resultado" (roxo) e a 6a secao,
// mas tem conteudo proprio (acerto/fechamento ou saldo+trilha) e vive num componente a parte.
const DEFINICOES: DefinicaoCategoria[] = [
  {
    categoria: "entradas",
    titulo: "Entradas",
    icone: "mdi-cash-plus",
    entidade: "venda",
    endpoint: "vendas",
    permissaoVisualizar: "entradas_visualizar",
    permissaoCriar: null,
    permissaoDiscriminar: null
  },
  {
    categoria: "transferencias",
    titulo: "Transferencias",
    icone: "mdi-swap-horizontal",
    entidade: "transferencia",
    endpoint: "transferencias",
    permissaoVisualizar: "transferencias_visualizar",
    permissaoCriar: "transferencias_criar",
    permissaoDiscriminar: null
  },
  {
    categoria: "despesas",
    titulo: "Despesas",
    icone: "mdi-receipt-text",
    entidade: "despesa",
    endpoint: "despesas",
    permissaoVisualizar: "despesas_visualizar",
    permissaoCriar: "despesas_criar",
    permissaoDiscriminar: "despesas_discriminar"
  },
  {
    categoria: "mercadorias",
    titulo: "Mercadorias",
    icone: "mdi-package-variant-closed",
    entidade: "mercadoria",
    endpoint: "mercadorias",
    permissaoVisualizar: "mercadorias_visualizar",
    permissaoCriar: "mercadorias_criar",
    permissaoDiscriminar: "mercadorias_discriminar"
  },
  {
    categoria: "retiradas",
    titulo: "Retiradas",
    icone: "mdi-wallet",
    entidade: "retirada",
    endpoint: "retiradas",
    permissaoVisualizar: "retiradas_visualizar",
    permissaoCriar: "retiradas_criar",
    permissaoDiscriminar: null
  }
];

export interface SecaoCockpit {
  categoria: CategoriaLancavel;
  titulo: string;
  icone: string;
  cor: string;
  entidade: EntidadeOperacional;
  endpoint: string;
  total: number;
  podeDiscriminar: boolean;
  // "+ Lancar" so aparece quando a categoria aceita lancamento manual, o usuario tem a permissao de
  // criar E o caixa selecionado e o proprio caixa aberto (nao se lanca no caixa de outro nem em fechado).
  podeLancar: boolean;
}

// As secoes que o usuario PODE ver (respeita *_visualizar; secao sem permissao nao renderiza), ja com
// o total resolvido da fonte certa e as flags de acao.
export function montarSecoesCockpit(
  permissoes: readonly Permissao[],
  totais: TotaisPorCategoria,
  ehProprioAberto: boolean
): SecaoCockpit[] {
  return DEFINICOES.filter((def) => temPermissao(permissoes, def.permissaoVisualizar)).map((def) => ({
    categoria: def.categoria,
    titulo: def.titulo,
    icone: def.icone,
    cor: CORES_COCKPIT[def.categoria],
    entidade: def.entidade,
    endpoint: def.endpoint,
    total: totais[def.categoria],
    podeDiscriminar: def.permissaoDiscriminar ? temPermissao(permissoes, def.permissaoDiscriminar) : false,
    podeLancar: def.permissaoCriar !== null && temPermissao(permissoes, def.permissaoCriar) && ehProprioAberto
  }));
}

// Totais das secoes a partir do resumo AO VIVO (caixa aberto do proprio operador).
export function totaisDoResumo(resumo: ResumoCaixa | null): TotaisPorCategoria {
  return {
    entradas: resumo?.totalEntradas ?? 0,
    transferencias: resumo?.totalTransferencias ?? 0,
    despesas: resumo?.totalDespesas ?? 0,
    mercadorias: resumo?.totalMercadorias ?? 0,
    retiradas: resumo?.totalRetiradas ?? 0
  };
}

// Totais das secoes a partir do DETALHE (gerente auditando qualquer caixa). O detalhe ja traz o total
// por categoria calculado no servidor (ao vivo p/ aberto, batendo com o persistido p/ fechado).
export function totaisDoDetalhe(detalhe: DetalheCaixaResponse | null): TotaisPorCategoria {
  const porCategoria = new Map((detalhe?.lancamentos ?? []).map((grupo) => [grupo.categoria, grupo.total]));
  return {
    entradas: porCategoria.get("entradas") ?? 0,
    transferencias: porCategoria.get("transferencias") ?? 0,
    despesas: porCategoria.get("despesas") ?? 0,
    mercadorias: porCategoria.get("mercadorias") ?? 0,
    retiradas: porCategoria.get("retiradas") ?? 0
  };
}

// Saldo (Resultado/Diferenca) a partir dos totais: entradas + transferencias (liquido) - despesas -
// retiradas - mercadorias. Mesma formula do saldoCaixaCentavos; aqui em reais so para exibir.
export function saldoDosTotais(totais: TotaisPorCategoria): number {
  return totais.entradas + totais.transferencias - totais.despesas - totais.retiradas - totais.mercadorias;
}

// Item de lista do cockpit, normalizado das duas fontes (endpoints por categoria no modo proprio;
// /detalhe no modo auditoria) para uma so forma que a secao renderiza.
export interface ItemCockpit {
  id: string;
  descricao: string;
  data: string | null;
  valor: number;
  pendenteDiscriminacao: boolean;
}

// Modo proprio (operador no seu caixa aberto): a listagem existente (/api/{categoria}?caixaId=).
export function itemDeOperacao(operacao: OperacaoResumo): ItemCockpit {
  return {
    id: operacao.id,
    descricao: operacao.descricao,
    // Venda integrada tem hora real (dataVenda); as demais so a data contabil.
    data: operacao.dataVenda ?? operacao.dataReferencia,
    // Venda entra pelo liquido (bate com o resumo); as demais pelo valor original.
    valor: Number(operacao.valorLiquido ?? operacao.valorOriginal ?? 0),
    pendenteDiscriminacao: operacao.pendenteDiscriminacao ?? false
  };
}

// Modo auditoria (gerente em qualquer caixa): os itens ja vem agrupados por categoria em /detalhe.
export function itemDeLancamento(lancamento: LancamentoCaixa): ItemCockpit {
  return {
    id: lancamento.id,
    descricao: lancamento.descricao ?? "",
    data: lancamento.dataHora ?? lancamento.data,
    valor: lancamento.valor,
    pendenteDiscriminacao: false
  };
}

export interface OpcaoCaixaSeletor {
  id: string;
  pdvNome: string | null;
  operadorNome: string | null;
  status: StatusCaixa;
  aberto: boolean;
  ehProprioAberto: boolean;
  dataHoraAbertura: string | null;
  dataHoraFechamento: string | null;
}

// Opcoes do seletor de caixa do gerente: o proprio caixa aberto (se houver) em primeiro, depois o
// historico do periodo (abertos e fechados), sem repetir. Fonte: /api/caixa/historico + /status.
export function mapearCaixasSelecionaveis(
  historico: readonly LinhaHistoricoCaixa[],
  caixaProprioAberto: CaixaOperacional | null
): OpcaoCaixaSeletor[] {
  const opcoes: OpcaoCaixaSeletor[] = [];
  const vistos = new Set<string>();
  if (caixaProprioAberto) {
    opcoes.push({
      id: caixaProprioAberto.id,
      pdvNome: caixaProprioAberto.pdvNome,
      operadorNome: caixaProprioAberto.usuarioCaixaNome,
      status: "aberto",
      aberto: true,
      ehProprioAberto: true,
      dataHoraAbertura: caixaProprioAberto.dataHoraAbertura,
      dataHoraFechamento: caixaProprioAberto.dataHoraFechamento
    });
    vistos.add(caixaProprioAberto.id);
  }
  for (const linha of historico) {
    if (vistos.has(linha.id)) continue;
    vistos.add(linha.id);
    opcoes.push({
      id: linha.id,
      pdvNome: linha.pdvNome,
      operadorNome: linha.usuarioCaixaNome,
      status: linha.status,
      aberto: linha.status === "aberto",
      ehProprioAberto: false,
      dataHoraAbertura: linha.dataHoraAbertura,
      dataHoraFechamento: linha.dataHoraFechamento
    });
  }
  return opcoes;
}
