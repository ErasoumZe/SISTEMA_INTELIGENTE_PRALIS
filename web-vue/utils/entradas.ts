// Regras da tela de ENTRADAS (PROJECT_BRAIN/17, D7 — S6): "a tela lista TODAS as entradas do DIA".
//
// Extraidas do AppWorkspace para serem testaveis sem runtime Nuxt (mesma ideia de caixa-acoes.ts):
// aqui so ha funcao PURA — quem guarda estado e o componente. O que estas funcoes decidem e o
// recorte da consulta: qual dia, qual pagina e quem pode trocar de dia.
import { temPermissao, type Permissao } from "@padaria/shared";
import { permissaoMenuSomenteCaixaAberto } from "~/utils/domain";

// 50 por pagina. A paginacao virou consulta de verdade (servidor) e nao mais um slice em memoria,
// entao este numero passou a valer dinheiro: um dia de padaria tem centenas de vendas — com 10 a
// conferencia viraria dezenas de cliques, e sem paginar a tela renderizaria a lista inteira.
export const TAMANHO_PAGINA_OPERACOES = 50;

/**
 * Dia LOCAL em "yyyy-MM-dd".
 *
 * NAO usa toISOString(): em fuso negativo (BRT) ele devolve o dia em UTC e, das 21h em diante, ja
 * teria virado — a tela abriria no dia SEGUINTE e apareceria vazia para quem esta fechando o caixa
 * a noite. Mesma armadilha documentada em formatarDataSomenteDia.
 */
export function diaLocal(agora: Date = new Date()): string {
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${agora.getFullYear()}-${mes}-${dia}`;
}

/**
 * Quem pode consultar OUTROS dias. Falso para o perfil preso ao caixa aberto
 * (menu_entradas_somente_caixa_aberto): para ele o servidor forca o dia do caixa
 * (resolverEscopoEntradasDoDia), entao o filtro de data seria decorativo — a tela o mostra
 * desabilitado em vez de fingir que funciona.
 */
export function podeConsultarOutrosDias(permissoesUsuario: readonly Permissao[]): boolean {
  return !temPermissao(permissoesUsuario, permissaoMenuSomenteCaixaAberto("entradas"));
}

/**
 * Dia em que a tela de Entradas abre.
 *
 * Para o perfil preso ao caixa e o dia CONTABIL do caixa (dataMovimento), nao "hoje": num caixa que
 * virou a meia-noite o dia do operador continua sendo o da abertura, e e esse que o servidor vai
 * listar — mostrar "hoje" no campo enquanto a lista traz o dia anterior seria mentira na tela.
 */
export function diaInicialEntradas(entrada: {
  podeConsultarOutrosDias: boolean;
  dataMovimentoCaixa?: string | null;
  agora?: Date;
}): string {
  if (!entrada.podeConsultarOutrosDias && entrada.dataMovimentoCaixa) return entrada.dataMovimentoCaixa;
  return diaLocal(entrada.agora ?? new Date());
}

/** Total de paginas a partir do total do FILTRO INTEIRO (o que o servidor devolve), nunca da pagina. */
export function totalPaginasOperacoes(total: number, tamanhoPagina = TAMANHO_PAGINA_OPERACOES): number {
  if (tamanhoPagina <= 0) return 1;
  return Math.max(1, Math.ceil(Math.max(0, total) / tamanhoPagina));
}

export type FiltroListagemOperacoes = {
  empresaId: string;
  pagina: number;
  /** Fila de pendencias de discriminacao: visao de retaguarda, ignora caixa E dia. */
  pendenteDiscriminacao?: boolean;
  caixaId?: string;
  /** Dia "yyyy-MM-dd" da tela de Entradas. Vazio nas demais telas, que nao recortam por dia. */
  dia?: string;
  tamanhoPagina?: number;
};

/**
 * Query da listagem de operacoes. Sempre com page/pageSize: sem eles a API devolve o default de 10
 * e a tela paginava em memoria por cima desses 10 — ou seja, a lista NUNCA passava de 10 registros
 * e o controle de pagina nao tinha para onde ir.
 */
export function paramsListagemOperacoes(filtro: FiltroListagemOperacoes): URLSearchParams {
  const params = new URLSearchParams({ empresaId: filtro.empresaId });
  if (filtro.pendenteDiscriminacao) {
    params.set("pendenteDiscriminacao", "true");
  } else if (filtro.caixaId) {
    params.set("caixaId", filtro.caixaId);
  }
  // dataInicio == dataFim porque o recorte da tela e UM dia — o mesmo par que o servidor forca para
  // o perfil preso ao caixa. A fila de pendencias fica de fora: ela e de outro escopo.
  if (filtro.dia && !filtro.pendenteDiscriminacao) {
    params.set("dataInicio", filtro.dia);
    params.set("dataFim", filtro.dia);
  }
  params.set("page", String(Math.max(1, filtro.pagina)));
  params.set("pageSize", String(filtro.tamanhoPagina ?? TAMANHO_PAGINA_OPERACOES));
  return params;
}
