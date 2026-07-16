import type { DadosExternos } from "@padaria/shared/api";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  or,
  sum
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { colaboradores, gruposDespesas, pdvs, perfisUsuarios, turnos } from "@padaria/db/schema/cadastro";
import { ajustesFechamentoCaixa, debitosColaboradores, edicoesCaixa, fechamentosCaixa } from "@padaria/db/schema/caixa";
import { despesas, despesasItens } from "@padaria/db/schema/despesa";
import { mercadorias } from "@padaria/db/schema/mercadoria";
import { retiradas } from "@padaria/db/schema/retirada";
import { transferencias } from "@padaria/db/schema/transferencia";
import { vendas } from "@padaria/db/schema/venda";
import type { TotaisCaixaCentavos } from "@padaria/shared/caixa";
import { centavosParaDecimalBanco, paraCentavos } from "@padaria/shared/dinheiro";
import { banco, executarComTransacaoOpcional, type ExecutorBanco } from "../banco/conexao.js";

export async function buscarGrupoQuebraCaixa(
  empresaId: string,
  db: ExecutorBanco = banco
): Promise<{ id: string } | null> {
  const [grupo] = await db
    .select({ id: gruposDespesas.id })
    .from(gruposDespesas)
    .where(and(eq(gruposDespesas.empresaId, empresaId), ilike(gruposDespesas.nome, "Quebra de caixa")))
    .limit(1);

  return grupo ?? null;
}

export async function buscarPdvEmpresaRepository(pdvId: string, empresaId: string, db: ExecutorBanco = banco) {
  const [pdv] = await db
    .select({
      id: pdvs.id,
      empresaId: pdvs.empresaId,
      nome: pdvs.nome,
      codigo: pdvs.codigo,
      contaId: pdvs.contaId,
      ativo: pdvs.ativo
    })
    .from(pdvs)
    .where(and(eq(pdvs.id, pdvId), eq(pdvs.empresaId, empresaId)))
    .limit(1);
  return pdv ?? null;
}

export async function buscarColaboradorPorUsuarioRepository(
  usuarioId: string,
  empresaId?: string,
  db: ExecutorBanco = banco
) {
  const filtros = [eq(colaboradores.usuarioId, usuarioId)];
  if (empresaId) filtros.push(eq(colaboradores.empresaId, empresaId));
  const [colaborador] = await db
    .select({
      id: colaboradores.id,
      empresaId: colaboradores.empresaId,
      nome: colaboradores.nome,
      usuarioId: colaboradores.usuarioId,
      turnoPadraoId: colaboradores.turnoPadraoId
    })
    .from(colaboradores)
    .where(and(...filtros))
    .limit(1);
  return colaborador ?? null;
}

export async function buscarPerfilUsuarioCaixaRepository(usuarioId: string, db: ExecutorBanco = banco) {
  const [usuario] = await db
    .select({ usuarioId: perfisUsuarios.usuarioId, nome: perfisUsuarios.nome })
    .from(perfisUsuarios)
    .where(eq(perfisUsuarios.usuarioId, usuarioId))
    .limit(1);
  return usuario ?? null;
}

export async function buscarCaixaAbertoUsuarioRepository(
  empresaId: string,
  usuarioCaixaId: string,
  db: ExecutorBanco = banco
) {
  const [caixa] = await db
    .select({
      id: fechamentosCaixa.id,
      empresaId: fechamentosCaixa.empresaId,
      pdvId: fechamentosCaixa.pdvId,
      pdvNome: pdvs.nome,
      pdvContaId: pdvs.contaId,
      usuarioId: fechamentosCaixa.usuarioId,
      usuarioCaixaId: fechamentosCaixa.usuarioCaixaId,
      usuarioCaixaNome: perfisUsuarios.nome,
      colaboradorId: fechamentosCaixa.colaboradorId,
      dataMovimento: fechamentosCaixa.dataMovimento,
      dataHoraAbertura: fechamentosCaixa.dataHoraAbertura,
      abertoEm: fechamentosCaixa.abertoEm,
      dataHoraFechamento: fechamentosCaixa.dataHoraFechamento,
      fechadoEm: fechamentosCaixa.fechadoEm,
      tokenEdicao: fechamentosCaixa.tokenEdicao,
      turnoId: fechamentosCaixa.turnoId,
      observacao: fechamentosCaixa.observacao,
      status: fechamentosCaixa.status
    })
    .from(fechamentosCaixa)
    .innerJoin(pdvs, eq(pdvs.id, fechamentosCaixa.pdvId))
    .leftJoin(perfisUsuarios, eq(perfisUsuarios.usuarioId, fechamentosCaixa.usuarioCaixaId))
    .where(
      and(
        eq(fechamentosCaixa.empresaId, empresaId),
        eq(fechamentosCaixa.usuarioCaixaId, usuarioCaixaId),
        eq(fechamentosCaixa.status, "aberto")
      )
    )
    .orderBy(desc(fechamentosCaixa.criadoEm))
    .limit(1);
  return caixa ?? null;
}

export async function buscarCaixaPorIdRepository(caixaId: string, db: ExecutorBanco = banco) {
  const [caixa] = await db
    .select({
      id: fechamentosCaixa.id,
      empresaId: fechamentosCaixa.empresaId,
      pdvId: fechamentosCaixa.pdvId,
      pdvNome: pdvs.nome,
      pdvContaId: pdvs.contaId,
      usuarioId: fechamentosCaixa.usuarioId,
      usuarioCaixaId: fechamentosCaixa.usuarioCaixaId,
      usuarioCaixaNome: perfisUsuarios.nome,
      colaboradorId: fechamentosCaixa.colaboradorId,
      dataMovimento: fechamentosCaixa.dataMovimento,
      dataHoraAbertura: fechamentosCaixa.dataHoraAbertura,
      abertoEm: fechamentosCaixa.abertoEm,
      dataHoraFechamento: fechamentosCaixa.dataHoraFechamento,
      fechadoEm: fechamentosCaixa.fechadoEm,
      tokenEdicao: fechamentosCaixa.tokenEdicao,
      turnoId: fechamentosCaixa.turnoId,
      observacao: fechamentosCaixa.observacao,
      status: fechamentosCaixa.status
    })
    .from(fechamentosCaixa)
    .innerJoin(pdvs, eq(pdvs.id, fechamentosCaixa.pdvId))
    .leftJoin(perfisUsuarios, eq(perfisUsuarios.usuarioId, fechamentosCaixa.usuarioCaixaId))
    .where(eq(fechamentosCaixa.id, caixaId))
    .limit(1);
  return caixa ?? null;
}

export async function existeCaixaAbertoPdvRepository(
  pdvId: string,
  caixaIgnoradoId?: string,
  db: ExecutorBanco = banco
) {
  const filtros = [eq(fechamentosCaixa.pdvId, pdvId), eq(fechamentosCaixa.status, "aberto")];
  if (caixaIgnoradoId) filtros.push(ne(fechamentosCaixa.id, caixaIgnoradoId));
  const [caixa] = await db
    .select({ id: fechamentosCaixa.id })
    .from(fechamentosCaixa)
    .where(and(...filtros))
    .limit(1);
  return Boolean(caixa);
}

export async function existePeriodoCaixaRepository(
  pdvId: string,
  dataHoraAbertura: Date,
  caixaIgnoradoId?: string,
  db: ExecutorBanco = banco
) {
  const filtros = [eq(fechamentosCaixa.pdvId, pdvId)];
  if (caixaIgnoradoId) filtros.push(ne(fechamentosCaixa.id, caixaIgnoradoId));
  const caixas = await db
    .select({
      status: fechamentosCaixa.status,
      dataHoraAbertura: fechamentosCaixa.dataHoraAbertura,
      dataHoraFechamento: fechamentosCaixa.dataHoraFechamento
    })
    .from(fechamentosCaixa)
    .where(and(...filtros));
  return caixas.some((caixa) => {
    if (caixa.status === "aberto") return true;
    if (!caixa.dataHoraFechamento) return false;
    return dataHoraAbertura <= new Date(caixa.dataHoraFechamento);
  });
}

export async function criarCaixaRepository(
  input: {
    empresaId: string;
    pdvId: string;
    usuarioId: string;
    usuarioCaixaId: string;
    colaboradorId: string;
    dataHoraAbertura: Date;
    tokenEdicao: string;
    turnoId: string | null;
    observacao: string | null;
  },
  db: ExecutorBanco = banco
) {
  const [caixa] = await db
    .insert(fechamentosCaixa)
    .values({
      empresaId: input.empresaId,
      pdvId: input.pdvId,
      usuarioId: input.usuarioId,
      usuarioCaixaId: input.usuarioCaixaId,
      colaboradorId: input.colaboradorId,
      turnoId: input.turnoId,
      dataMovimento: input.dataHoraAbertura.toISOString().slice(0, 10),
      dataHoraAbertura: input.dataHoraAbertura,
      abertoEm: new Date(),
      tokenEdicao: input.tokenEdicao,
      observacao: input.observacao,
      status: "aberto",
      criadoPor: input.usuarioId
    })
    .returning({ id: fechamentosCaixa.id });
  if (!caixa) throw new Error("Caixa nao criado");
  return caixa;
}

export async function atualizarAberturaCaixaRepository(
  input: {
    caixaId: string;
    pdvId: string;
    usuarioCaixaId: string;
    colaboradorId: string;
    dataHoraAbertura: Date;
    observacao: string | null;
    tokenEdicao: string;
  },
  db: ExecutorBanco = banco
) {
  await db
    .update(fechamentosCaixa)
    .set({
      pdvId: input.pdvId,
      usuarioCaixaId: input.usuarioCaixaId,
      colaboradorId: input.colaboradorId,
      dataMovimento: input.dataHoraAbertura.toISOString().slice(0, 10),
      dataHoraAbertura: input.dataHoraAbertura,
      observacao: input.observacao,
      tokenEdicao: input.tokenEdicao
    })
    .where(eq(fechamentosCaixa.id, input.caixaId));
}

export async function registrarEdicaoCaixaRepository(
  input: {
    caixaId: string;
    tokenUsado: string | null;
    autorizadorId?: string | null;
    observacao?: string | null;
    editadoPor: string;
    valoresAntigos: Record<string, DadosExternos>;
    valoresNovos: Record<string, DadosExternos>;
  },
  db: ExecutorBanco = banco
) {
  await db.insert(edicoesCaixa).values(input);
}

// Auditoria de alteracoes de horario de UM caixa: quem editou, quando, motivo e quem autorizou.
// Dois joins na mesma tabela de perfis (editor e autorizador) exigem alias.
const perfilEditor = alias(perfisUsuarios, "perfil_editor");
const perfilAutorizador = alias(perfisUsuarios, "perfil_autorizador");

export async function listarEdicoesCaixaRepository(caixaId: string, db: ExecutorBanco = banco) {
  return db
    .select({
      id: edicoesCaixa.id,
      editadoPor: edicoesCaixa.editadoPor,
      editadoPorNome: perfilEditor.nome,
      autorizadorId: edicoesCaixa.autorizadorId,
      autorizadorNome: perfilAutorizador.nome,
      observacao: edicoesCaixa.observacao,
      editadoEm: edicoesCaixa.editadoEm,
      tokenUsado: edicoesCaixa.tokenUsado,
      valoresAntigos: edicoesCaixa.valoresAntigos,
      valoresNovos: edicoesCaixa.valoresNovos
    })
    .from(edicoesCaixa)
    .leftJoin(perfilEditor, eq(perfilEditor.usuarioId, edicoesCaixa.editadoPor))
    .leftJoin(perfilAutorizador, eq(perfilAutorizador.usuarioId, edicoesCaixa.autorizadorId))
    .where(eq(edicoesCaixa.caixaId, caixaId))
    .orderBy(desc(edicoesCaixa.editadoEm));
}

// Lancamentos de UM caixa, por categoria. Mesmos criterios de calcularTotaisCaixaOperacionalRepository
// (computar + nao cancelado), para o detalhe bater com os totais da linha.
// Nao reusa /api/vendas e afins de proposito: aquelas rotas aplicam o escopo operacional
// "somente caixa aberto" e, para um usuario_admin (que tem todos os flags), trocariam o caixaId
// pedido pelo caixa aberto do proprio usuario — o detalhe mostraria o caixa errado.
export async function listarLancamentosCaixaRepository(caixaId: string, db: ExecutorBanco = banco) {
  const ativo = (tabela: typeof vendas | typeof despesas | typeof retiradas | typeof mercadorias) =>
    and(eq(tabela.caixaId, caixaId), eq(tabela.computar, true), ne(tabela.status, "cancelado"));

  const [linhasVendas, linhasTransferencias, linhasDespesas, linhasRetiradas, linhasMercadorias] = await Promise.all([
    db
      .select({
        id: vendas.id,
        descricao: vendas.descricao,
        data: vendas.dataReferencia,
        valor: vendas.valorOriginal
      })
      .from(vendas)
      .where(ativo(vendas))
      .orderBy(desc(vendas.dataReferencia)),
    db
      .select({
        id: transferencias.id,
        descricao: transferencias.descricao,
        data: transferencias.dataReferencia,
        valor: transferencias.valorOriginal,
        contaOrigemId: transferencias.contaOrigemId,
        contaDestinoId: transferencias.contaDestinoId
      })
      .from(transferencias)
      .where(
        and(
          eq(transferencias.caixaId, caixaId),
          eq(transferencias.computar, true),
          ne(transferencias.status, "cancelado")
        )
      )
      .orderBy(desc(transferencias.dataReferencia)),
    db
      .select({
        id: despesas.id,
        descricao: despesas.descricao,
        data: despesas.dataReferencia,
        valor: despesas.valorOriginal
      })
      .from(despesas)
      .where(ativo(despesas))
      .orderBy(desc(despesas.dataReferencia)),
    db
      .select({
        id: retiradas.id,
        descricao: retiradas.descricao,
        data: retiradas.dataReferencia,
        valor: retiradas.valorOriginal
      })
      .from(retiradas)
      .where(ativo(retiradas))
      .orderBy(desc(retiradas.dataReferencia)),
    db
      .select({
        id: mercadorias.id,
        descricao: mercadorias.descricao,
        data: mercadorias.dataReferencia,
        valor: mercadorias.valorOriginal
      })
      .from(mercadorias)
      .where(ativo(mercadorias))
      .orderBy(desc(mercadorias.dataReferencia))
  ]);

  return { linhasVendas, linhasTransferencias, linhasDespesas, linhasRetiradas, linhasMercadorias };
}

// Acerto de saldo do caixa (se houve): valor da diferenca e o colaborador que ficou com o debito.
export async function buscarAjusteCaixaRepository(caixaId: string, db: ExecutorBanco = banco) {
  const [ajuste] = await db
    .select({
      id: ajustesFechamentoCaixa.id,
      valorDiferenca: ajustesFechamentoCaixa.valorDiferenca,
      despesaId: ajustesFechamentoCaixa.despesaId,
      criadoEm: ajustesFechamentoCaixa.criadoEm,
      colaboradorId: debitosColaboradores.colaboradorId,
      colaboradorNome: colaboradores.nome,
      observacao: debitosColaboradores.observacao
    })
    .from(ajustesFechamentoCaixa)
    .leftJoin(debitosColaboradores, eq(debitosColaboradores.caixaId, ajustesFechamentoCaixa.fechamentoCaixaId))
    .leftJoin(colaboradores, eq(colaboradores.id, debitosColaboradores.colaboradorId))
    .where(eq(ajustesFechamentoCaixa.fechamentoCaixaId, caixaId))
    .orderBy(desc(ajustesFechamentoCaixa.criadoEm))
    .limit(1);
  return ajuste ?? null;
}

// Atualiza o horario de abertura e/ou fechamento (nao mexe em PDV/usuario/token) — usado pelo novo
// fluxo de alteracao por token/permissao. O tokenEdicao do gerente (fluxo antigo) fica intacto.
export async function atualizarHorarioCaixaRepository(
  input: { caixaId: string; dataHoraAbertura?: Date | undefined; dataHoraFechamento?: Date | undefined },
  db: ExecutorBanco = banco
) {
  const campos = {
    ...(input.dataHoraAbertura
      ? {
          dataHoraAbertura: input.dataHoraAbertura,
          dataMovimento: input.dataHoraAbertura.toISOString().slice(0, 10)
        }
      : {}),
    ...(input.dataHoraFechamento ? { dataHoraFechamento: input.dataHoraFechamento } : {})
  };
  if (Object.keys(campos).length === 0) return;
  await db.update(fechamentosCaixa).set(campos).where(eq(fechamentosCaixa.id, input.caixaId));
}

// Revinculacao retroativa das vendas INTEGRADAS ao caixa apos qualquer mudanca de horario.
// ANEXAR: vendas orfas (caixa_id NULL) do mesmo empresa+PDV com data_venda dentro do periodo.
// DESANEXAR: vendas DESTE caixa que ficaram fora do periodo voltam a orfas.
// Garantias: nunca toca venda de OUTRO caixa (anexar exige caixa_id NULL; desanexar filtra caixa_id
// = este) e nunca toca venda MANUAL (exige integracao_chave_id e data_venda preenchidos).
export async function revincularVendasAoCaixaRepository(
  input: { caixaId: string; empresaId: string; pdvId: string; abertura: Date; limiteSuperior: Date },
  db: ExecutorBanco = banco
): Promise<{ anexadas: number; desanexadas: number }> {
  const anexadas = await db
    .update(vendas)
    .set({ caixaId: input.caixaId })
    .where(
      and(
        eq(vendas.empresaId, input.empresaId),
        eq(vendas.pdvId, input.pdvId),
        isNull(vendas.caixaId),
        isNotNull(vendas.integracaoChaveId),
        isNotNull(vendas.dataVenda),
        gte(vendas.dataVenda, input.abertura),
        lte(vendas.dataVenda, input.limiteSuperior)
      )
    )
    .returning({ id: vendas.id });

  const desanexadas = await db
    .update(vendas)
    .set({ caixaId: null })
    .where(
      and(
        eq(vendas.caixaId, input.caixaId),
        isNotNull(vendas.integracaoChaveId),
        isNotNull(vendas.dataVenda),
        or(lt(vendas.dataVenda, input.abertura), gt(vendas.dataVenda, input.limiteSuperior))
      )
    )
    .returning({ id: vendas.id });

  return { anexadas: anexadas.length, desanexadas: desanexadas.length };
}

export async function caixaTemLancamentosRepository(caixaId: string, db: ExecutorBanco = banco) {
  const consultas = await Promise.all([
    db.select({ id: vendas.id }).from(vendas).where(eq(vendas.caixaId, caixaId)).limit(1),
    db.select({ id: transferencias.id }).from(transferencias).where(eq(transferencias.caixaId, caixaId)).limit(1),
    db.select({ id: despesas.id }).from(despesas).where(eq(despesas.caixaId, caixaId)).limit(1),
    db.select({ id: retiradas.id }).from(retiradas).where(eq(retiradas.caixaId, caixaId)).limit(1),
    db.select({ id: mercadorias.id }).from(mercadorias).where(eq(mercadorias.caixaId, caixaId)).limit(1)
  ]);
  return consultas.some((resultado) => resultado.length > 0);
}

export async function calcularTotaisCaixaOperacionalRepository(
  caixaId: string,
  pdvContaId: string,
  db: ExecutorBanco = banco
): Promise<TotaisCaixaCentavos> {
  const totais: TotaisCaixaCentavos = {
    entradas: 0,
    transferencias: 0,
    transferenciasEntrada: 0,
    transferenciasSaida: 0,
    despesas: 0,
    retiradas: 0,
    mercadorias: 0
  };

  const [linhasVendas, linhasTransferencias, linhasDespesas, linhasRetiradas, linhasMercadorias] = await Promise.all([
    db
      .select({ valorOriginal: vendas.valorOriginal })
      .from(vendas)
      .where(and(eq(vendas.caixaId, caixaId), eq(vendas.computar, true), ne(vendas.status, "cancelado"))),
    db
      .select({
        valorOriginal: transferencias.valorOriginal,
        contaOrigemId: transferencias.contaOrigemId,
        contaDestinoId: transferencias.contaDestinoId
      })
      .from(transferencias)
      .where(
        and(
          eq(transferencias.caixaId, caixaId),
          eq(transferencias.computar, true),
          ne(transferencias.status, "cancelado")
        )
      ),
    db
      .select({ valorOriginal: despesas.valorOriginal })
      .from(despesas)
      .where(and(eq(despesas.caixaId, caixaId), eq(despesas.computar, true), ne(despesas.status, "cancelado"))),
    db
      .select({ valorOriginal: retiradas.valorOriginal })
      .from(retiradas)
      .where(and(eq(retiradas.caixaId, caixaId), eq(retiradas.computar, true), ne(retiradas.status, "cancelado"))),
    db
      .select({ valorOriginal: mercadorias.valorOriginal })
      .from(mercadorias)
      .where(and(eq(mercadorias.caixaId, caixaId), eq(mercadorias.computar, true), ne(mercadorias.status, "cancelado")))
  ]);

  for (const movimento of linhasVendas) {
    totais.entradas += paraCentavos(movimento.valorOriginal);
  }
  for (const movimento of linhasTransferencias) {
    const valor = paraCentavos(movimento.valorOriginal);
    totais.transferencias += valor;
    if (movimento.contaDestinoId === pdvContaId) totais.transferenciasEntrada += valor;
    if (movimento.contaOrigemId === pdvContaId) totais.transferenciasSaida += valor;
  }
  for (const movimento of linhasDespesas) {
    totais.despesas += paraCentavos(movimento.valorOriginal);
  }
  for (const movimento of linhasRetiradas) {
    totais.retiradas += paraCentavos(movimento.valorOriginal);
  }
  for (const movimento of linhasMercadorias) {
    totais.mercadorias += paraCentavos(movimento.valorOriginal);
  }

  return totais;
}

export async function criarAcertoSaldoCaixaRepository(
  input: {
    caixaId: string;
    empresaId: string;
    colaboradorId: string;
    contaOrigemId: string | null;
    grupoDespesaId: string | null;
    valorDiferencaCentavos: number;
    observacao: string | null;
    criadoPor: string;
    data: string;
  },
  db?: ExecutorBanco
) {
  return executarComTransacaoOpcional(db, async (db) => {
    const valor = centavosParaDecimalBanco(input.valorDiferencaCentavos);
    const [despesa] = await db
      .insert(despesas)
      .values({
        empresaId: input.empresaId,
        dataReferencia: input.data,
        dataVencimento: input.data,
        descricao: "Diferenca de caixa",
        observacao: input.observacao,
        valorOriginal: valor,
        contaOrigemId: input.contaOrigemId,
        colaboradorId: input.colaboradorId,
        grupoDespesaId: input.grupoDespesaId,
        caixaId: input.caixaId,
        criadoPor: input.criadoPor
      })
      .returning({ id: despesas.id });
    if (!despesa) throw new Error("Despesa de diferenca nao criada");

    await db.insert(despesasItens).values({
      despesaId: despesa.id,
      grupoDespesaId: input.grupoDespesaId,
      descricao: "Diferenca de caixa",
      valor
    });

    const [debito] = await db
      .insert(debitosColaboradores)
      .values({
        empresaId: input.empresaId,
        colaboradorId: input.colaboradorId,
        tipo: "FECHAMENTO_CAIXA",
        despesaId: despesa.id,
        caixaId: input.caixaId,
        valor,
        observacao: input.observacao,
        criadoPor: input.criadoPor
      })
      .returning({ id: debitosColaboradores.id });
    if (!debito) throw new Error("Debito de colaborador nao criado");

    await db.insert(ajustesFechamentoCaixa).values({
      fechamentoCaixaId: input.caixaId,
      despesaId: despesa.id,
      valorDiferenca: valor
    });

    return { despesaId: despesa.id, debitoId: debito.id };
  });
}

export async function atualizarFechamentoCaixaRepository(
  input: {
    caixaId: string;
    dataHoraFechamento: Date;
    observacao: string | null;
    totais: TotaisCaixaCentavos;
    saldoCentavos: number;
  },
  db: ExecutorBanco = banco
) {
  await db
    .update(fechamentosCaixa)
    .set({
      dataHoraFechamento: input.dataHoraFechamento,
      fechadoEm: new Date(),
      observacao: input.observacao,
      totalEntradas: centavosParaDecimalBanco(input.totais.entradas),
      totalTransferencias: centavosParaDecimalBanco(
        input.totais.transferenciasEntrada - input.totais.transferenciasSaida
      ),
      totalTransferenciasEntrada: centavosParaDecimalBanco(input.totais.transferenciasEntrada),
      totalTransferenciasSaida: centavosParaDecimalBanco(input.totais.transferenciasSaida),
      totalDespesas: centavosParaDecimalBanco(input.totais.despesas),
      totalRetiradas: centavosParaDecimalBanco(input.totais.retiradas),
      totalMercadorias: centavosParaDecimalBanco(input.totais.mercadorias),
      saldo: centavosParaDecimalBanco(input.saldoCentavos),
      status: "fechado"
    })
    .where(eq(fechamentosCaixa.id, input.caixaId));
}

export type FiltrosHistoricoCaixa = {
  empresaId: string;
  dataInicio?: string;
  dataFim?: string;
  pdvId?: string;
  usuarioCaixaId?: string;
  colaboradorId?: string;
  turnoId?: string;
  status?: string;
};

// Um unico WHERE para pagina, contagem e totais: se divergirem, o rodape mente sobre a lista.
function condicoesHistoricoCaixa(filtros: FiltrosHistoricoCaixa) {
  const condicoes = [eq(fechamentosCaixa.empresaId, filtros.empresaId)];
  if (filtros.dataInicio) condicoes.push(gte(fechamentosCaixa.dataMovimento, filtros.dataInicio));
  if (filtros.dataFim) condicoes.push(lte(fechamentosCaixa.dataMovimento, filtros.dataFim));
  if (filtros.pdvId) condicoes.push(eq(fechamentosCaixa.pdvId, filtros.pdvId));
  if (filtros.usuarioCaixaId) condicoes.push(eq(fechamentosCaixa.usuarioCaixaId, filtros.usuarioCaixaId));
  if (filtros.colaboradorId) condicoes.push(eq(fechamentosCaixa.colaboradorId, filtros.colaboradorId));
  if (filtros.turnoId) condicoes.push(eq(fechamentosCaixa.turnoId, filtros.turnoId));
  if (filtros.status) condicoes.push(eq(fechamentosCaixa.status, filtros.status));
  return and(...condicoes);
}

// Pagina do historico. Ordena por data_movimento (a data contabil que a tela filtra) e desempata
// pela abertura/PDV. tokenEdicao NAO sai daqui: e segredo do fluxo legado, nao dado de listagem.
export async function listarHistoricoCaixaRepository(
  filtros: FiltrosHistoricoCaixa,
  page: number,
  pageSize: number,
  db: ExecutorBanco = banco
) {
  const where = condicoesHistoricoCaixa(filtros);
  const itens = await db
    .select({
      id: fechamentosCaixa.id,
      empresaId: fechamentosCaixa.empresaId,
      dataMovimento: fechamentosCaixa.dataMovimento,
      pdvId: fechamentosCaixa.pdvId,
      pdvNome: pdvs.nome,
      usuarioCaixaId: fechamentosCaixa.usuarioCaixaId,
      usuarioCaixaNome: perfisUsuarios.nome,
      colaboradorId: fechamentosCaixa.colaboradorId,
      colaboradorNome: colaboradores.nome,
      turnoId: fechamentosCaixa.turnoId,
      turnoNome: turnos.nome,
      dataHoraAbertura: fechamentosCaixa.dataHoraAbertura,
      dataHoraFechamento: fechamentosCaixa.dataHoraFechamento,
      observacao: fechamentosCaixa.observacao,
      totalEntradas: fechamentosCaixa.totalEntradas,
      totalTransferencias: fechamentosCaixa.totalTransferencias,
      totalTransferenciasEntrada: fechamentosCaixa.totalTransferenciasEntrada,
      totalTransferenciasSaida: fechamentosCaixa.totalTransferenciasSaida,
      totalDespesas: fechamentosCaixa.totalDespesas,
      totalRetiradas: fechamentosCaixa.totalRetiradas,
      totalMercadorias: fechamentosCaixa.totalMercadorias,
      saldo: fechamentosCaixa.saldo,
      status: fechamentosCaixa.status
    })
    .from(fechamentosCaixa)
    .innerJoin(pdvs, eq(pdvs.id, fechamentosCaixa.pdvId))
    .leftJoin(perfisUsuarios, eq(perfisUsuarios.usuarioId, fechamentosCaixa.usuarioCaixaId))
    .leftJoin(colaboradores, eq(colaboradores.id, fechamentosCaixa.colaboradorId))
    .leftJoin(turnos, eq(turnos.id, fechamentosCaixa.turnoId))
    .where(where)
    .orderBy(desc(fechamentosCaixa.dataMovimento), desc(fechamentosCaixa.dataHoraAbertura), asc(pdvs.nome))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [contagem] = await db.select({ total: count() }).from(fechamentosCaixa).where(where);
  return { itens, total: contagem?.total ?? 0 };
}

// Totais do FILTRO INTEIRO (nao da pagina) — e o que o rodape promete. Soma as colunas ja
// persistidas em fechamentos_caixa; nada e recalculado a partir dos lancamentos.
export async function totaisHistoricoCaixaRepository(filtros: FiltrosHistoricoCaixa, db: ExecutorBanco = banco) {
  const [totais] = await db
    .select({
      totalEntradas: sum(fechamentosCaixa.totalEntradas),
      totalTransferenciasEntrada: sum(fechamentosCaixa.totalTransferenciasEntrada),
      totalTransferenciasSaida: sum(fechamentosCaixa.totalTransferenciasSaida),
      totalDespesas: sum(fechamentosCaixa.totalDespesas),
      totalRetiradas: sum(fechamentosCaixa.totalRetiradas),
      totalMercadorias: sum(fechamentosCaixa.totalMercadorias),
      saldo: sum(fechamentosCaixa.saldo),
      caixas: count()
    })
    .from(fechamentosCaixa)
    .where(condicoesHistoricoCaixa(filtros));
  return totais ?? null;
}

// Quais caixas tiveram acerto de saldo. O status "ajustado" existe na constraint mas nenhum fluxo
// o escreve; a verdade sobre "houve acerto" e a existencia da linha em ajustes_fechamento_caixa.
export async function caixasComAjusteRepository(caixaIds: string[], db: ExecutorBanco = banco) {
  if (!caixaIds.length) return [];
  return db
    .selectDistinct({ caixaId: ajustesFechamentoCaixa.fechamentoCaixaId })
    .from(ajustesFechamentoCaixa)
    .where(inArray(ajustesFechamentoCaixa.fechamentoCaixaId, caixaIds));
}
