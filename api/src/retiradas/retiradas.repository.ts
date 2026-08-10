import { and, eq, isNull } from "drizzle-orm";
import { debitosColaboradores } from "@padaria/db/schema/caixa";
import { retiradas } from "@padaria/db/schema/retirada";
import type { RetiradaDetalheDto, RetiradaDto, RetiradaPayload, RetiradasQuery } from "@padaria/shared/retiradas";
import { banco, executarComTransacaoOpcional, type ExecutorBanco } from "../banco/conexao.js";
import {
  filtrosEmpresa,
  numeroDecimal,
  valoresBase,
  valoresBaseEdicao,
  valoresJuros
} from "../lancamentos/lancamentos.dominio.js";
import { textoDoMovimento } from "../lancamentos/texto-movimento.js";

export async function listarRetiradasRepository(
  query: RetiradasQuery,
  empresasPermitidasIds: string[] | null,
  esconderPagos = false
): Promise<RetiradaDto[]> {
  const filtros = filtrosEmpresa(retiradas, query, empresasPermitidasIds);
  if (query.caixaId) filtros.push(eq(retiradas.caixaId, query.caixaId));
  // visualizar_dpago: sem a permissao (esconderPagos), so retiradas NAO pagas saem da listagem.
  if (esconderPagos) filtros.push(isNull(retiradas.dataPagamento));
  return banco
    .select({
      id: retiradas.id,
      empresaId: retiradas.empresaId,
      dataReferencia: retiradas.dataReferencia,
      descricao: textoDoMovimento(retiradas),
      valorOriginal: retiradas.valorOriginal,
      computar: retiradas.computar,
      status: retiradas.status
    })
    .from(retiradas)
    .where(filtros.length ? and(...filtros) : undefined);
}

export async function atualizarFotoRetiradaRepository(
  id: string,
  empresaId: string,
  campo: "documento" | "nota",
  caminho: string,
  db: ExecutorBanco = banco
): Promise<void> {
  await db
    .update(retiradas)
    .set(campo === "nota" ? { fotoNotaUrl: caminho } : { fotoDocumentoUrl: caminho })
    .where(and(eq(retiradas.id, id), eq(retiradas.empresaId, empresaId)));
}

export async function criarRetiradaRepository(
  dados: RetiradaPayload,
  computar: boolean,
  criadoPor: string,
  caixaId?: string | null,
  db?: ExecutorBanco,
  recorrencia?: { id: string; ordem: number } | null
): Promise<{ id: string }> {
  return executarComTransacaoOpcional(db, async (tx) => {
    const [retirada] = await tx
      .insert(retiradas)
      .values({
        ...valoresBase(dados, computar, criadoPor, caixaId, recorrencia),
        // R-041: DEPOIS do valoresBase de proposito — sobrescreve o valorAcrescimo do cliente.
        ...valoresJuros(dados),
        dataVencimento: dados.dataVencimento,
        grupoRetiradaId: dados.grupoRetiradaId ?? null,
        // R-128: o tipo e DERIVADO de qual credor veio. `colaborador` continua no leque porque o
        // historico tem retirada gravada assim e ela precisa reabrir e salvar sem virar invalida.
        credorTipo: dados.socioGestorId ? "socio_gestor" : dados.fornecedorId ? "fornecedor" : "colaborador",
        fornecedorId: dados.fornecedorId ?? null,
        colaboradorId: dados.colaboradorId ?? null,
        socioGestorId: dados.socioGestorId ?? null,
        dataDocumentoFiscal: dados.dataDocumentoFiscal ?? null,
        numeroDocumentoFiscal: dados.numeroDocumentoFiscal ?? null,
        fotoDocumentoUrl: dados.fotoDocumentoUrl ?? null,
        fotoNotaUrl: dados.fotoNotaUrl ?? null
      })
      .returning({ id: retiradas.id });
    if (!retirada) throw new Error("Retirada nao criada");

    // R-047: o debito de colaborador so existe quando o credor E um colaborador. Retirada de
    // socio/gestor e pro-labore, nao divida de funcionario — e debitos_colaboradores.colaborador_id
    // e NOT NULL, entao inventar um colaborador aqui seria mentir no banco para satisfazer o tipo.
    if (dados.colaboradorId) {
      await tx.insert(debitosColaboradores).values({
        empresaId: dados.empresaId,
        colaboradorId: dados.colaboradorId,
        tipo: "RETIRADA",
        retiradaId: retirada.id,
        caixaId: caixaId ?? null,
        valor: String(dados.valorOriginal),
        observacao: dados.observacao ?? null,
        criadoPor
      });
    }

    return retirada;
  });
}

/**
 * Trava a linha da retirada para a EDICAO — ver a nota em `travarDespesaRepository`.
 *
 * Aqui a corrida e pior que a da despesa: sem lock, a segunda edicao nao so reintroduz o credor
 * legado como RECRIA o `debitos_colaboradores` que a primeira tinha apagado — ou seja, ressuscita
 * divida de funcionario ja quitada.
 *
 * `NO KEY UPDATE` pelo mesmo motivo: `debitos_colaboradores.retirada_id` referencia esta linha.
 */
export async function travarRetiradaRepository(retiradaId: string, db: ExecutorBanco = banco) {
  const [linha] = await db
    .select({ id: retiradas.id })
    .from(retiradas)
    .where(eq(retiradas.id, retiradaId))
    .for("no key update");
  return linha ?? null;
}

export async function buscarRetiradaDetalheRepository(
  retiradaId: string,
  db: ExecutorBanco = banco
): Promise<RetiradaDetalheDto | null> {
  const [retirada] = await db
    .select({
      id: retiradas.id,
      empresaId: retiradas.empresaId,
      caixaId: retiradas.caixaId,
      recorrenciaId: retiradas.recorrenciaId,
      status: retiradas.status,
      dataReferencia: retiradas.dataReferencia,
      dataVencimento: retiradas.dataVencimento,
      dataPagamento: retiradas.dataPagamento,
      descricao: textoDoMovimento(retiradas),
      observacao: retiradas.observacao,
      valorOriginal: retiradas.valorOriginal,
      valorAcrescimo: retiradas.valorAcrescimo,
      descricaoAcrescimo: retiradas.descricaoAcrescimo,
      valorDesconto: retiradas.valorDesconto,
      descricaoDesconto: retiradas.descricaoDesconto,
      contaOrigemId: retiradas.contaOrigemId,
      fornecedorId: retiradas.fornecedorId,
      colaboradorId: retiradas.colaboradorId,
      socioGestorId: retiradas.socioGestorId,
      credorTipo: retiradas.credorTipo,
      dataDocumentoFiscal: retiradas.dataDocumentoFiscal,
      numeroDocumentoFiscal: retiradas.numeroDocumentoFiscal,
      fotoDocumentoUrl: retiradas.fotoDocumentoUrl,
      fotoNotaUrl: retiradas.fotoNotaUrl,
      jurosTipo: retiradas.jurosTipo,
      jurosValorInformado: retiradas.jurosValorInformado,
      grupoRetiradaId: retiradas.grupoRetiradaId,
      computar: retiradas.computar
    })
    .from(retiradas)
    .where(eq(retiradas.id, retiradaId))
    .limit(1);
  if (!retirada) return null;

  return {
    ...retirada,
    valorOriginal: numeroDecimal(retirada.valorOriginal),
    valorAcrescimo: numeroDecimal(retirada.valorAcrescimo),
    jurosValorInformado: retirada.jurosValorInformado == null ? null : numeroDecimal(retirada.jurosValorInformado),
    valorDesconto: numeroDecimal(retirada.valorDesconto)
  };
}

export async function atualizarRetiradaRepository(
  retiradaId: string,
  dados: RetiradaPayload,
  computar: boolean,
  caixaId: string | null,
  criadoPor: string | null,
  db?: ExecutorBanco
): Promise<void> {
  await executarComTransacaoOpcional(db, async (tx) => {
    await tx
      .update(retiradas)
      .set({
        ...valoresBaseEdicao(dados, computar),
        ...valoresJuros(dados),
        dataVencimento: dados.dataVencimento,
        grupoRetiradaId: dados.grupoRetiradaId ?? null,
        // R-128: o tipo e DERIVADO de qual credor veio. `colaborador` continua no leque porque o
        // historico tem retirada gravada assim e ela precisa reabrir e salvar sem virar invalida.
        credorTipo: dados.socioGestorId ? "socio_gestor" : dados.fornecedorId ? "fornecedor" : "colaborador",
        fornecedorId: dados.fornecedorId ?? null,
        colaboradorId: dados.colaboradorId ?? null,
        socioGestorId: dados.socioGestorId ?? null,
        dataDocumentoFiscal: dados.dataDocumentoFiscal ?? null,
        numeroDocumentoFiscal: dados.numeroDocumentoFiscal ?? null,
        fotoDocumentoUrl: dados.fotoDocumentoUrl ?? null,
        fotoNotaUrl: dados.fotoNotaUrl ?? null
      })
      .where(eq(retiradas.id, retiradaId));

    // O debito de colaborador e derivado do lancamento: substitui conforme o novo payload. O DELETE
    // vem sempre — trocar o credor de colaborador para socio/gestor tem de APAGAR o debito antigo,
    // senao sobra divida de um funcionario que nao recebeu mais nada.
    await tx.delete(debitosColaboradores).where(eq(debitosColaboradores.retiradaId, retiradaId));
    if (dados.colaboradorId) {
      await tx.insert(debitosColaboradores).values({
        empresaId: dados.empresaId,
        colaboradorId: dados.colaboradorId,
        tipo: "RETIRADA",
        retiradaId,
        caixaId,
        valor: String(dados.valorOriginal),
        observacao: dados.observacao ?? null,
        criadoPor
      });
    }
  });
}
