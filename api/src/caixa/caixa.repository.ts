import type { DadosExternos } from "@padaria/shared/api";
import { and, asc, desc, eq, gt, gte, ilike, isNotNull, isNull, lt, lte, ne, or } from "drizzle-orm";
import { colaboradores, gruposDespesas, pdvs, perfisUsuarios } from "@padaria/db/schema/cadastro";
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
      usuarioId: colaboradores.usuarioId
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

// Atualiza SOMENTE o horario de abertura (nao mexe em PDV/usuario/token) — usado pelo novo fluxo de
// alteracao de horario por token/permissao. O tokenEdicao do gerente (fluxo antigo) fica intacto.
export async function atualizarHorarioAberturaCaixaRepository(
  input: { caixaId: string; dataHoraAbertura: Date },
  db: ExecutorBanco = banco
) {
  await db
    .update(fechamentosCaixa)
    .set({
      dataHoraAbertura: input.dataHoraAbertura,
      dataMovimento: input.dataHoraAbertura.toISOString().slice(0, 10)
    })
    .where(eq(fechamentosCaixa.id, input.caixaId));
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

export async function listarHistoricoCaixaRepository(empresaId: string, db: ExecutorBanco = banco) {
  return db
    .select({
      id: fechamentosCaixa.id,
      empresaId: fechamentosCaixa.empresaId,
      pdvId: fechamentosCaixa.pdvId,
      pdvNome: pdvs.nome,
      usuarioId: fechamentosCaixa.usuarioId,
      usuarioCaixaId: fechamentosCaixa.usuarioCaixaId,
      usuarioCaixaNome: perfisUsuarios.nome,
      colaboradorId: fechamentosCaixa.colaboradorId,
      dataHoraAbertura: fechamentosCaixa.dataHoraAbertura,
      abertoEm: fechamentosCaixa.abertoEm,
      dataHoraFechamento: fechamentosCaixa.dataHoraFechamento,
      fechadoEm: fechamentosCaixa.fechadoEm,
      tokenEdicao: fechamentosCaixa.tokenEdicao,
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
    .where(eq(fechamentosCaixa.empresaId, empresaId))
    .orderBy(desc(fechamentosCaixa.dataHoraAbertura), asc(pdvs.nome));
}
