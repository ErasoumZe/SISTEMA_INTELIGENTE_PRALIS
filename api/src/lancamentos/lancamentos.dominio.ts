import type { DadosExternos } from "@padaria/shared/api";
import { temPermissao, type DominioLancamentoPagavel, type Permissao, type PerfilUsuario } from "@padaria/shared";
import {
  centavosParaDecimalBanco,
  deCentavos,
  jurosCentavos,
  paraCentavos,
  type TipoJuros
} from "@padaria/shared/dinheiro";
import {
  calcularDiscriminacao,
  conferirDiscriminacao,
  type ItemDiscriminacao,
  type TipoDesconto
} from "@padaria/shared/discriminacao";
import { naoProcessavel, proibido } from "../erros.js";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { obterCaixaAbertoParaLancamento } from "../caixa/caixa.service.js";
import { and, eq, inArray, type SQL } from "drizzle-orm";
import {
  colaboradores,
  contas,
  fornecedores,
  formasPagamento,
  gruposDespesas,
  gruposMercadorias,
  gruposPatrimonio,
  gruposRetiradas,
  pdvs,
  produtos,
  sociosGestores,
  unidadesMedida
} from "@padaria/db/schema/cadastro";
import type { DespesaItemPayload, DespesaPayload } from "@padaria/shared/despesas";
import type { MercadoriaItemPayload, MercadoriaPayload } from "@padaria/shared/mercadorias";
import type { RetiradaPayload } from "@padaria/shared/retiradas";
import type { Recorrencia } from "@padaria/shared/recorrencia";
import type { TransferenciaPayload } from "@padaria/shared/transferencias";
import type { VendaPayload } from "@padaria/shared/vendas";
import { banco, type ExecutorBanco } from "../banco/conexao.js";

export type QueryEmpresa = { empresaId?: string | undefined };
type BasePayload = {
  empresaId: string;
  dataReferencia: string;
  dataPagamento?: string | null | undefined;
  descricao: string;
  observacao?: string | null | undefined;
  valorOriginal: number;
  valorAcrescimo: number;
  descricaoAcrescimo?: string | null | undefined;
  valorDesconto: number;
  descricaoDesconto?: string | null | undefined;
  contaOrigemId?: string | null | undefined;
};

async function existeNaEmpresa<Tabela extends { id: DadosExternos; empresaId: DadosExternos }>(
  tabela: Tabela,
  id: string,
  empresaId: string,
  db: ExecutorBanco = banco
) {
  const [linha] = await db
    .select({ id: tabela.id as never })
    .from(tabela as never)
    .where(and(eq(tabela.id as never, id), eq(tabela.empresaId as never, empresaId)))
    .limit(1);
  return Boolean(linha);
}

export function filtrosEmpresa<T extends { empresaId: DadosExternos }>(
  tabela: T,
  query: QueryEmpresa,
  empresasPermitidasIds: string[] | null
): SQL[] {
  const filtros: SQL[] = [];
  if (query.empresaId) filtros.push(eq(tabela.empresaId as never, query.empresaId));
  else if (empresasPermitidasIds !== null) filtros.push(inArray(tabela.empresaId as never, empresasPermitidasIds));
  return filtros;
}

// JUROS (R-041/R-042) das TRES tabelas de lancamento. Fica fora de valoresBase de proposito:
// valoresBase tambem serve transferencias, que nao tem as colunas de juros.
//
// O SERVIDOR RECALCULA e nao confia no cliente. Um valorAcrescimo que chega pronto do front e um
// valor que o front pode mentir — mandar jurosTipo='percentual', jurosValorInformado=2 e
// valorAcrescimo=999999 nao passa: o acrescimo e derivado aqui, do valor e do percentual.
//
// Sem jurosTipo (venda, transferencia, historico, lancamento sem juros) o acrescimo generico segue
// intacto e as colunas de juros vao a null — importante na EDICAO, para limpar o juros de verdade
// quando a pessoa apaga o campo.
export function valoresJuros(dados: {
  valorOriginal: number;
  valorAcrescimo: number;
  jurosTipo?: TipoJuros | null | undefined;
  jurosValorInformado?: number | null | undefined;
}) {
  if (!dados.jurosTipo) {
    return { valorAcrescimo: String(dados.valorAcrescimo), jurosTipo: null, jurosValorInformado: null };
  }
  const centavos = jurosCentavos({
    valorOriginal: dados.valorOriginal,
    jurosValorInformado: dados.jurosValorInformado,
    jurosTipo: dados.jurosTipo
  });
  return {
    valorAcrescimo: centavosParaDecimalBanco(centavos),
    jurosTipo: dados.jurosTipo,
    jurosValorInformado: String(dados.jurosValorInformado ?? 0)
  };
}

// Campos editaveis comuns aos lancamentos. Na edicao, empresa, caixa e criadoPor NUNCA mudam.
export function valoresBaseEdicao(dados: BasePayload, computar: boolean) {
  return {
    dataReferencia: dados.dataReferencia,
    dataPagamento: dados.dataPagamento ?? null,
    descricao: dados.descricao,
    observacao: dados.observacao ?? null,
    valorOriginal: String(dados.valorOriginal),
    valorAcrescimo: String(dados.valorAcrescimo),
    descricaoAcrescimo: dados.descricaoAcrescimo ?? null,
    valorDesconto: String(dados.valorDesconto),
    descricaoDesconto: dados.descricaoDesconto ?? null,
    contaOrigemId: dados.contaOrigemId ?? null,
    computar
  };
}

export function valoresBase(
  dados: BasePayload,
  computar: boolean,
  criadoPor: string,
  caixaId?: string | null,
  // Vinculo com a serie que gerou o lancamento (D3). So despesas/mercadorias/retiradas tem essas
  // colunas — por isso o spread e CONDICIONAL: venda e transferencia chamam sem o argumento e nao
  // recebem as chaves.
  recorrencia?: { id: string; ordem: number } | null
) {
  return {
    empresaId: dados.empresaId,
    caixaId: caixaId ?? null,
    criadoPor,
    ...(recorrencia ? { recorrenciaId: recorrencia.id, recorrenciaOrdem: recorrencia.ordem } : {}),
    ...valoresBaseEdicao(dados, computar)
  };
}

// Converte o decimal do banco (string) para o numero em reais do contrato wire.
export function numeroDecimal(valor: string | number | null | undefined): number {
  return deCentavos(paraCentavos(valor));
}

function normalizarCargo(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .trim()
    .toLowerCase();
}

// Perfis de RETAGUARDA: lancam sem estar presos a um caixa e escolhem a conta livremente. Era
// `podeTransferirSemCaixa`, exclusiva da transferencia (R-032); virou a fonte unica das QUATRO
// saidas para que "quem e livre" nao tenha duas definicoes que divergem com o tempo.
export function podeLancarSemCaixa(perfil: PerfilUsuario) {
  if (perfil.role === "usuario_admin" || perfil.role === "admin") return true;
  const prefixosLiberados = ["tesouraria", "gerencia", "gerente", "financeiro", "diretor geral"];
  return perfil.cargos.some((cargo) =>
    prefixosLiberados.some((prefixo) => normalizarCargo(cargo.nome).startsWith(prefixo))
  );
}

// R-121: o operador de Caixa lanca TODA saida (despesa, mercadoria, retirada) — desde que saia da
// conta do caixa aberto. Sem esta amarracao o valor debita a conta escolhida no saldo de contas E
// debita o caixa no fechamento ao mesmo tempo: divergencia silenciosa que volta como quebra de
// caixa falsa no colo do operador (R-015).
//
// Conta VAZIA e preenchida com a do PDV — o front trava o campo, mas payload sem conta nao pode
// virar lancamento orfao. Conta DIFERENTE e recusada.
//
// Diferente da transferencia de proposito: la a conta do PDV vale como origem OU destino (dinheiro
// entra e sai); aqui e saida, entao so ORIGEM.
export function exigirContaDoCaixaNoLancamento<T extends { contaOrigemId?: string | null | undefined }>(
  dados: T,
  caixa: { pdvContaId: string | null },
  perfil: PerfilUsuario
): T {
  if (podeLancarSemCaixa(perfil)) return dados;
  if (!caixa.pdvContaId) throw new Error("Caixa operacional invalido");
  if (!dados.contaOrigemId) return { ...dados, contaOrigemId: caixa.pdvContaId };
  if (dados.contaOrigemId !== caixa.pdvContaId) {
    throw new Error("Lancamento do operador Caixa precisa sair da conta do PDV aberto");
  }
  return dados;
}

// R-123: as ocorrencias FUTURAS de uma serie nascem fora de qualquer caixa aberto
// (lancamentos.recorrencia.ts: so a 1a recebe caixaId). Amarrar essas ocorrencias a conta de um PDV
// que talvez nem exista em tres meses cria lancamento orfao por construcao — entao recorrencia e
// ato de retaguarda. A permissao `lancamentos_recorrencia_criar` ja barra por outro caminho; esta
// checagem existe para a recusa dizer o MOTIVO em vez de "permissao insuficiente".
// A checagem e do OPERADOR DE CAIXA especificamente (`caixa_operar` sem ser retaguarda), nao de
// "qualquer um sem a permissao": para os demais continua valendo a R-075, que responde 403 apontando
// `lancamentos_recorrencia_criar`. Sem esse recorte, um perfil que apenas nao tem a permissao — e
// nem opera caixa — receberia um motivo que nao e o dele.
export function exigirRecorrenciaDeRetaguarda(perfil: PerfilUsuario, recorrencia: Recorrencia | undefined) {
  if (!recorrencia || podeLancarSemCaixa(perfil)) return;
  if (!temPermissao(perfil.permissoes, "caixa_operar")) return;
  throw new Error("Lancamento recorrente e ato de Tesouraria/Financeiro");
}

// Regras de edicao de lancamento: o registro precisa existir na empresa acessivel,
// nao pode trocar de empresa e precisa pertencer ao caixa aberto do usuario.
// Serve venda, transferencia e as tres saidas — nao mexer no status daqui sem olhar os quatro.
export async function validarEdicaoNoCaixaAberto(
  existente: { empresaId: string; caixaId: string | null } | null,
  dados: { empresaId: string },
  perfil: PerfilUsuario,
  tx?: ExecutorBanco
) {
  if (!existente || !podeAcessarEmpresa(perfil, existente.empresaId)) throw new Error("Registro nao encontrado");
  if (existente.empresaId !== dados.empresaId) throw new Error("Nao e possivel mover o lancamento de empresa");
  const caixa = await obterCaixaParaLancamento(dados.empresaId, perfil.usuarioId, tx);
  if (existente.caixaId !== caixa.id) throw new Error("Lancamento nao pertence ao seu caixa aberto");
  return caixa;
}

// R-122: edicao das SAIDAS (despesa/mercadoria/retirada). O operador de Caixa corrige o proprio
// lancamento enquanto AQUELE caixa estiver aberto — as tres condicoes andam juntas: caixa aberto
// proprio, lancamento daquele caixa e conta ainda a do PDV. Recusa e 403 (e uma questao de
// autorizacao, nao de payload malformado) e a mensagem diz QUAL condicao falhou.
//
// Perfil de retaguarda cai no caminho de sempre, sem mudanca: unificar o comportamento dos outros
// cargos e outra decisao, fora deste escopo.
export async function validarEdicaoDeSaidaNoCaixa(
  existente: { empresaId: string; caixaId: string | null } | null,
  dados: { empresaId: string; contaOrigemId?: string | null | undefined },
  perfil: PerfilUsuario,
  tx?: ExecutorBanco
) {
  if (podeLancarSemCaixa(perfil)) return validarEdicaoNoCaixaAberto(existente, dados, perfil, tx);

  if (!existente || !podeAcessarEmpresa(perfil, existente.empresaId)) throw new Error("Registro nao encontrado");
  if (existente.empresaId !== dados.empresaId) throw new Error("Nao e possivel mover o lancamento de empresa");

  let caixa;
  try {
    caixa = await obterCaixaParaLancamento(dados.empresaId, perfil.usuarioId, tx);
  } catch {
    // Fechado o caixa, acabou: corrigir vira ato de tesouraria. E o que protege os totais ja
    // congelados em `fechamentos_caixa`.
    throw proibido("Caixa fechado: correcao de lancamento passa a ser da Tesouraria");
  }
  if (existente.caixaId !== caixa.id) throw proibido("Lancamento nao pertence ao seu caixa aberto");
  if (dados.contaOrigemId && dados.contaOrigemId !== caixa.pdvContaId) {
    throw proibido("Lancamento do operador Caixa precisa sair da conta do PDV aberto");
  }
  return caixa;
}

async function validarConta(
  dados: { empresaId: string; contaOrigemId?: string | null | undefined },
  db: ExecutorBanco = banco
) {
  if (dados.contaOrigemId && !(await existeNaEmpresa(contas, dados.contaOrigemId, dados.empresaId, db))) {
    return "Conta de origem";
  }
  return null;
}

export async function validarReferenciasVenda(dados: VendaPayload, db: ExecutorBanco = banco): Promise<string | null> {
  const conta = await validarConta(dados, db);
  if (conta) return conta;
  if (dados.pdvId && !(await existeNaEmpresa(pdvs, dados.pdvId, dados.empresaId, db))) return "PDV";
  if (dados.colaboradorId && !(await existeNaEmpresa(colaboradores, dados.colaboradorId, dados.empresaId, db)))
    return "Colaborador";

  const produtosIds = [...new Set(dados.itensVenda.map((item) => item.produtoId).filter(Boolean))];
  for (const produtoId of produtosIds) {
    if (produtoId && !(await existeNaEmpresa(produtos, produtoId, dados.empresaId, db))) return "Produto";
  }

  const formasPagamentoIds = [...new Set(dados.tiposPagamento.map((item) => item.formaPagamentoId).filter(Boolean))];
  for (const formaPagamentoId of formasPagamentoIds) {
    if (formaPagamentoId && !(await existeNaEmpresa(formasPagamento, formaPagamentoId, dados.empresaId, db))) {
      return "Forma de pagamento";
    }
  }

  return null;
}

export async function validarReferenciasDespesa(
  dados: DespesaPayload,
  db: ExecutorBanco = banco
): Promise<string | null> {
  const conta = await validarConta(dados, db);
  if (conta) return conta;
  if (dados.fornecedorId && !(await existeNaEmpresa(fornecedores, dados.fornecedorId, dados.empresaId, db)))
    return "Fornecedor";
  if (dados.colaboradorId && !(await existeNaEmpresa(colaboradores, dados.colaboradorId, dados.empresaId, db)))
    return "Colaborador";
  if (dados.grupoDespesaId && !(await existeNaEmpresa(gruposDespesas, dados.grupoDespesaId, dados.empresaId, db))) {
    return "Grupo de despesa";
  }

  for (const grupoId of [...new Set(dados.itensDespesa.map((item) => item.grupoDespesaId).filter(Boolean))]) {
    if (grupoId && !(await existeNaEmpresa(gruposDespesas, grupoId, dados.empresaId, db))) return "Grupo de despesa";
  }

  // Grupo de PATRIMONIO no item (§5, item 6): mesma checagem de empresa dos demais — id valido de
  // OUTRA empresa nao entra.
  for (const grupoId of [...new Set(dados.itensDespesa.map((item) => item.grupoPatrimonioId).filter(Boolean))]) {
    if (grupoId && !(await existeNaEmpresa(gruposPatrimonio, grupoId, dados.empresaId, db)))
      return "Grupo de patrimonio";
  }

  for (const colaboradorId of [...new Set(dados.itensDespesa.map((item) => item.colaboradorId).filter(Boolean))]) {
    if (colaboradorId && !(await existeNaEmpresa(colaboradores, colaboradorId, dados.empresaId, db)))
      return "Colaborador";
  }

  return null;
}

export async function validarReferenciasMercadoria(
  dados: MercadoriaPayload,
  db: ExecutorBanco = banco
): Promise<string | null> {
  const conta = await validarConta(dados, db);
  if (conta) return conta;
  if (!(await existeNaEmpresa(fornecedores, dados.fornecedorId, dados.empresaId, db))) return "Fornecedor";
  if (
    dados.grupoMercadoriaId &&
    !(await existeNaEmpresa(gruposMercadorias, dados.grupoMercadoriaId, dados.empresaId, db))
  ) {
    return "Grupo de mercadoria";
  }

  for (const grupoId of [...new Set(dados.itensMercadoria.map((item) => item.grupoMercadoriaId).filter(Boolean))]) {
    if (grupoId && !(await existeNaEmpresa(gruposMercadorias, grupoId, dados.empresaId, db)))
      return "Grupo de mercadoria";
  }

  // Grupo de PATRIMONIO no item (§5, item 6): mesma checagem de empresa dos demais.
  for (const grupoId of [...new Set(dados.itensMercadoria.map((item) => item.grupoPatrimonioId).filter(Boolean))]) {
    if (grupoId && !(await existeNaEmpresa(gruposPatrimonio, grupoId, dados.empresaId, db)))
      return "Grupo de patrimonio";
  }

  for (const produtoId of [...new Set(dados.itensMercadoria.map((item) => item.produtoId).filter(Boolean))]) {
    if (produtoId && !(await existeNaEmpresa(produtos, produtoId, dados.empresaId, db))) return "Produto";
  }

  for (const unidadeId of [...new Set(dados.itensMercadoria.map((item) => item.unidadeMedidaId).filter(Boolean))]) {
    if (unidadeId && !(await existeNaEmpresa(unidadesMedida, unidadeId, dados.empresaId, db)))
      return "Unidade de medida";
  }

  return null;
}

export async function validarReferenciasRetirada(
  dados: RetiradaPayload,
  db: ExecutorBanco = banco
): Promise<string | null> {
  const conta = await validarConta(dados, db);
  if (conta) return conta;
  // R-047: o credor da retirada e colaborador OU socio/gestor — o zod ja garante que e exatamente
  // um dos dois; aqui so confirmamos que o escolhido existe NA EMPRESA.
  if (dados.colaboradorId && !(await existeNaEmpresa(colaboradores, dados.colaboradorId, dados.empresaId, db))) {
    return "Colaborador";
  }
  if (dados.socioGestorId && !(await existeNaEmpresa(sociosGestores, dados.socioGestorId, dados.empresaId, db))) {
    return "Socio/gestor";
  }
  if (dados.grupoRetiradaId && !(await existeNaEmpresa(gruposRetiradas, dados.grupoRetiradaId, dados.empresaId, db))) {
    return "Grupo de retirada";
  }
  return null;
}

export async function validarReferenciasTransferencia(
  dados: TransferenciaPayload,
  db: ExecutorBanco = banco
): Promise<string | null> {
  if (!(await existeNaEmpresa(contas, dados.contaOrigemId, dados.empresaId, db))) return "Conta de origem";
  if (!(await existeNaEmpresa(contas, dados.contaDestinoId, dados.empresaId, db))) return "Conta de destino";
  return null;
}

export class PermissaoLancamentoInsuficienteError extends Error {
  constructor(readonly permissao: Permissao) {
    super("Permissao insuficiente");
  }
}

export function exigirPermissaoLancamento(permissoes: readonly Permissao[], permissao: Permissao) {
  if (!temPermissao(permissoes, permissao)) throw new PermissaoLancamentoInsuficienteError(permissao);
}

// ADR-004: campos sensiveis sao decisao de servidor. Cliente comum nao marca lancamento
// como nao-computavel nem como ja pago na criacao/edicao; a excecao exige caixas_gerenciar
// (politica provisoria ate o modulo Financeiro definir permissoes proprias de baixa).
export function resolverComputarLancamento(computarSolicitado: boolean, permissoes: readonly Permissao[]): boolean {
  if (computarSolicitado) return true;
  return temPermissao(permissoes, "caixas_gerenciar") ? false : true;
}

export function resolverDataPagamentoLancamento(
  dataPagamento: string | null | undefined,
  permissoes: readonly Permissao[]
): string | null {
  if (!dataPagamento) return null;
  return temPermissao(permissoes, "caixas_gerenciar") ? dataPagamento : null;
}

// --- Ciclo de vida R7/R10 (Fase 1): enforcement ADITIVO de PAGAR e D/Pago ----------------------
// So despesas/mercadorias/retiradas tem dataPagamento (transferencia = movimento imediato; entradas
// = venda por integracao). Retrocompativel: nada muda para quem ja podia.
//
// TODO(M3 / R9 e ciclo de vida): "efetuar" (V), "conferir" (CONF) e a EXCLUSAO (nao ha rota DELETE
// hoje) dependem de campos/rotas que ainda nao existem. Os codigos *_efetuar/*_conferir/*_excluir_
// dpago ja estao no catalogo e distribuidos por cargo; o enforcement entra quando as rotas/campos
// existirem (ver doc 09 P1/P2 e SPEC de 9 acoes). A notificacao de diferenca (R9/D8 / P2) tambem e M3.

// pagar: ADITIVO. Alem do novo *_pagar, mantemos o caminho legado (caixas_gerenciar) que HOJE ja
// libera dataPagamento — a Fase 1 nao remove regra mais fraca existente (a Fase 3 tira o fallback).
export function podePagarLancamento(permissoes: readonly Permissao[], dominio: DominioLancamentoPagavel): boolean {
  return temPermissao(permissoes, `${dominio}_pagar` as Permissao) || temPermissao(permissoes, "caixas_gerenciar");
}

// Exige *_pagar SOMENTE quando o payload DEFINE ou ALTERA a dataPagamento (comparando com o atual).
// Editar outros campos de um lancamento ja pago NAO cai aqui (isso e *_editar_dpago).
export function exigirPermissaoPagar(
  permissoes: readonly Permissao[],
  dominio: DominioLancamentoPagavel,
  dataPagamentoNova: string | null | undefined,
  dataPagamentoAtual: string | null = null
): void {
  const nova = dataPagamentoNova ?? null;
  if (nova === (dataPagamentoAtual ?? null)) return; // nao mexeu no pagamento
  if (!podePagarLancamento(permissoes, dominio)) {
    throw new PermissaoLancamentoInsuficienteError(`${dominio}_pagar` as Permissao);
  }
}

// _dpago: editar um lancamento JA PAGO (dataPagamento preenchida no registro atual) exige a variante
// *_editar_dpago — sem ela, 403 mesmo tendo *_editar.
export function exigirPermissaoEditarPago(
  permissoes: readonly Permissao[],
  dominio: DominioLancamentoPagavel,
  dataPagamentoAtual: string | null | undefined
): void {
  if (!dataPagamentoAtual) return; // nao pago -> o gate normal (*_editar) basta
  if (!temPermissao(permissoes, `${dominio}_editar_dpago` as Permissao)) {
    throw new PermissaoLancamentoInsuficienteError(`${dominio}_editar_dpago` as Permissao);
  }
}

// visualizar_dpago: sem a permissao, a listagem esconde os lancamentos JA PAGOS (server-side).
export function podeVerLancamentosPagos(permissoes: readonly Permissao[], dominio: DominioLancamentoPagavel): boolean {
  return temPermissao(permissoes, `${dominio}_visualizar_dpago` as Permissao);
}

// Confere soma de itens contra o total em centavos inteiros (sem float).
// Cada valor e convertido individualmente, espelhando como cada linha e gravada no banco.
export function somaConfereCentavos(valores: number[], total: number): boolean {
  const soma = valores.reduce((acumulado, valor) => acumulado + paraCentavos(valor), 0);
  return soma === paraCentavos(total);
}

// --- Discriminacao com descontos em 3 niveis (PROJECT_BRAIN/17 §5) ----------------------------
// O nivel 3 (geral) RATEIA entre os itens, entao o calculo e da LISTA INTEIRA, nunca item a item.
// A regra mora no shared (calcularDiscriminacao); aqui so se traduz o payload de cada dominio.

// Item de despesa aceita a forma curta "descricao + valor": sem quantidade, e 1 x valor.
export function itemDespesaParaDiscriminacao(item: DespesaItemPayload): ItemDiscriminacao {
  const quantidade = item.quantidade ?? 1;
  return {
    quantidade,
    valorUnitario: item.valorUnitario ?? (quantidade > 0 ? item.valor / quantidade : 0),
    descontoTipo: item.descontoTipo ?? null,
    descontoValor: item.descontoValor ?? null,
    descontoTotalTipo: item.descontoTotalTipo ?? null,
    descontoTotalValor: item.descontoTotalValor ?? null
  };
}

export function itemMercadoriaParaDiscriminacao(item: MercadoriaItemPayload): ItemDiscriminacao {
  return {
    quantidade: item.quantidade,
    valorUnitario: item.valorUnitario,
    descontoTipo: item.descontoTipo ?? null,
    descontoValor: item.descontoValor ?? null,
    descontoTotalTipo: item.descontoTotalTipo ?? null,
    descontoTotalValor: item.descontoTotalValor ?? null
  };
}

type CabecalhoComDescontoGeral = {
  descontoGeralTipo?: TipoDesconto | null | undefined;
  descontoGeralValor?: number | null | undefined;
};

export function calcularDiscriminacaoDespesa(
  dados: { itensDespesa: DespesaItemPayload[] } & CabecalhoComDescontoGeral
) {
  return calcularDiscriminacao({
    itens: dados.itensDespesa.map(itemDespesaParaDiscriminacao),
    descontoGeralTipo: dados.descontoGeralTipo ?? null,
    descontoGeralValor: dados.descontoGeralValor ?? null
  });
}

export function calcularDiscriminacaoMercadoria(
  dados: { itensMercadoria: MercadoriaItemPayload[] } & CabecalhoComDescontoGeral
) {
  return calcularDiscriminacao({
    itens: dados.itensMercadoria.map(itemMercadoriaParaDiscriminacao),
    descontoGeralTipo: dados.descontoGeralTipo ?? null,
    descontoGeralValor: dados.descontoGeralValor ?? null
  });
}

// D5 (BLOQUEANTE): a soma da discriminacao tem de bater com o Valor do lancamento. Quando nao bate,
// levanta 422 com ONDE diverge — diferenca em R$ e a linha provavel — em vez de um 400 seco.
export function exigirDiscriminacaoConferida(itens: readonly ItemDiscriminacao[], valorLancamento: number): void {
  const divergencia = conferirDiscriminacao(itens, valorLancamento);
  if (!divergencia) return;
  const diferenca = deCentavos(divergencia.diferencaCentavos);
  const sobra = divergencia.diferencaCentavos > 0;
  throw naoProcessavel(
    `A discriminacao ${sobra ? "excede" : "nao alcanca"} o valor do lancamento em ${dinheiroBr(Math.abs(diferenca))}.` +
      (divergencia.linhaProvavel ? ` Confira a linha ${divergencia.linhaProvavel} (a de maior valor).` : ""),
    "DISCRIMINACAO_DIVERGENTE",
    {
      diferenca,
      totalItens: deCentavos(divergencia.totalItensCentavos),
      valorLancamento: deCentavos(divergencia.valorLancamentoCentavos),
      linhaProvavel: divergencia.linhaProvavel,
      campoProvavel: divergencia.campoProvavel
    }
  );
}

function dinheiroBr(valor: number): string {
  return `R$ ${valor.toFixed(2).replace(".", ",")}`;
}

// Total liquido do item de mercadoria. Sem desconto, respeita o valorTotal informado (permite
// lancamento por soma direta / valor cheio). Com desconto, o servidor RECALCULA: bruto (qtd*unit)
// menos o desconto (% quando 'percentual', R$ quando 'valor'), nunca abaixo de zero.
export function calcularTotalItemMercadoria(item: MercadoriaItemPayload): number {
  if (!item.descontoTipo || item.descontoValor == null) return item.valorTotal;
  const bruto = item.quantidade * item.valorUnitario;
  const desconto = item.descontoTipo === "percentual" ? (bruto * item.descontoValor) / 100 : item.descontoValor;
  const liquido = bruto - desconto;
  return liquido > 0 ? liquido : 0;
}

// Referencias dos itens na discriminacao de mercadoria (grupos/produtos/unidades da empresa).
export async function validarReferenciasItensMercadoria(
  empresaId: string,
  itens: MercadoriaItemPayload[],
  db: ExecutorBanco = banco
): Promise<string | null> {
  for (const grupoId of [...new Set(itens.map((item) => item.grupoMercadoriaId).filter(Boolean))]) {
    if (grupoId && !(await existeNaEmpresa(gruposMercadorias, grupoId, empresaId, db))) return "Grupo de mercadoria";
  }
  for (const grupoId of [...new Set(itens.map((item) => item.grupoPatrimonioId).filter(Boolean))]) {
    if (grupoId && !(await existeNaEmpresa(gruposPatrimonio, grupoId, empresaId, db))) return "Grupo de patrimonio";
  }
  for (const produtoId of [...new Set(itens.map((item) => item.produtoId).filter(Boolean))]) {
    if (produtoId && !(await existeNaEmpresa(produtos, produtoId, empresaId, db))) return "Produto";
  }
  for (const unidadeId of [...new Set(itens.map((item) => item.unidadeMedidaId).filter(Boolean))]) {
    if (unidadeId && !(await existeNaEmpresa(unidadesMedida, unidadeId, empresaId, db))) return "Unidade de medida";
  }
  return null;
}

// Referencias dos itens na discriminacao de despesa (grupos/colaboradores da empresa).
export async function validarReferenciasItensDespesa(
  empresaId: string,
  itens: DespesaItemPayload[],
  db: ExecutorBanco = banco
): Promise<string | null> {
  for (const grupoId of [...new Set(itens.map((item) => item.grupoDespesaId).filter(Boolean))]) {
    if (grupoId && !(await existeNaEmpresa(gruposDespesas, grupoId, empresaId, db))) return "Grupo de despesa";
  }
  for (const grupoId of [...new Set(itens.map((item) => item.grupoPatrimonioId).filter(Boolean))]) {
    if (grupoId && !(await existeNaEmpresa(gruposPatrimonio, grupoId, empresaId, db))) return "Grupo de patrimonio";
  }
  for (const colaboradorId of [...new Set(itens.map((item) => item.colaboradorId).filter(Boolean))]) {
    if (colaboradorId && !(await existeNaEmpresa(colaboradores, colaboradorId, empresaId, db))) return "Colaborador";
  }
  return null;
}

export async function obterCaixaParaLancamento(empresaId: string, usuarioId: string, db?: ExecutorBanco) {
  return obterCaixaAbertoParaLancamento(empresaId, usuarioId, db);
}
