import { and, asc, desc, eq, ilike, ne } from "drizzle-orm";
import { colaboradores, gruposDespesas, pdvs, perfisUsuarios } from "@padaria/db/schema/cadastro";
import {
  ajustesFechamentoCaixa,
  debitosColaboradores,
  edicoesCaixa,
  fechamentosCaixa
} from "@padaria/db/schema/caixa";
import { despesas, despesasItens, mercadorias, retiradas, transferencias } from "@padaria/db/schema/movimentacao";
import { vendas } from "@padaria/db/schema/venda";
import type { AjusteSaldoPayload, ResumoCaixaQuery } from "@padaria/shared/caixa";
import { banco, type ExecutorBanco } from "../banco/conexao.js";

export type TotaisCaixaLinha = {
  totalEntradas: string;
  totalTransferencias: string;
  totalDespesas: string;
  totalRetiradas: string;
};

export type TotaisCaixaOperacionalLinha = TotaisCaixaLinha & {
  totalTransferenciasEntrada: string;
  totalTransferenciasSaida: string;
  totalMercadorias: string;
};

export async function obterTotaisCaixa(query: ResumoCaixaQuery): Promise<TotaisCaixaLinha> {
  const filtroVendas = [eq(vendas.empresaId, query.empresaId), eq(vendas.dataReferencia, query.data)];
  const filtroDespesas = [eq(despesas.empresaId, query.empresaId), eq(despesas.dataReferencia, query.data)];
  const filtroRetiradas = [eq(retiradas.empresaId, query.empresaId), eq(retiradas.dataReferencia, query.data)];
  const filtroTransferencias = [eq(transferencias.empresaId, query.empresaId), eq(transferencias.dataReferencia, query.data)];
  if (query.colaboradorId) {
    filtroVendas.push(eq(vendas.colaboradorId, query.colaboradorId));
    filtroDespesas.push(eq(despesas.colaboradorId, query.colaboradorId));
    filtroRetiradas.push(eq(retiradas.colaboradorId, query.colaboradorId));
  }

  const [linhasVendas, linhasTransferencias, linhasDespesas, linhasRetiradas] = await Promise.all([
    banco.select({ valorOriginal: vendas.valorOriginal }).from(vendas).where(and(...filtroVendas)),
    query.colaboradorId
      ? Promise.resolve([])
      : banco.select({ valorOriginal: transferencias.valorOriginal }).from(transferencias).where(and(...filtroTransferencias)),
    banco.select({ valorOriginal: despesas.valorOriginal }).from(despesas).where(and(...filtroDespesas)),
    banco.select({ valorOriginal: retiradas.valorOriginal }).from(retiradas).where(and(...filtroRetiradas))
  ]);

  const soma = (linhas: Array<{ valorOriginal: string }>) =>
    linhas.reduce((total, movimento) => total + Number(movimento.valorOriginal), 0);
  const totais = {
    totalEntradas: soma(linhasVendas),
    totalTransferencias: soma(linhasTransferencias),
    totalDespesas: soma(linhasDespesas),
    totalRetiradas: soma(linhasRetiradas)
  };

  return {
    totalEntradas: totais.totalEntradas.toFixed(2),
    totalTransferencias: totais.totalTransferencias.toFixed(2),
    totalDespesas: totais.totalDespesas.toFixed(2),
    totalRetiradas: totais.totalRetiradas.toFixed(2)
  };
}

export async function buscarGrupoQuebraCaixa(empresaId: string, db: ExecutorBanco = banco): Promise<{ id: string } | null> {
  const [grupo] = await db
    .select({ id: gruposDespesas.id })
    .from(gruposDespesas)
    .where(and(eq(gruposDespesas.empresaId, empresaId), ilike(gruposDespesas.nome, "Quebra de caixa")))
    .limit(1);

  return grupo ?? null;
}

export async function criarAjusteSaldoCaixa(
  dados: AjusteSaldoPayload,
  grupoDespesaId: string | null,
  criadoPor: string
): Promise<{ id: string }> {
  const [despesa] = await banco
    .insert(despesas)
    .values({
      empresaId: dados.empresaId,
      dataReferencia: dados.data,
      dataVencimento: dados.data,
      descricao: "Quebra de caixa",
      valorOriginal: String(Math.abs(dados.valorDiferenca)),
      contaOrigemId: dados.contaOrigemId ?? null,
      colaboradorId: dados.colaboradorId,
      grupoDespesaId,
      criadoPor
    })
    .returning({ id: despesas.id });

  if (!despesa) throw new Error("Ajuste de caixa nao criado");
  return despesa;
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

export async function existeCaixaAbertoPdvRepository(pdvId: string, caixaIgnoradoId?: string, db: ExecutorBanco = banco) {
  const filtros = [eq(fechamentosCaixa.pdvId, pdvId), eq(fechamentosCaixa.status, "aberto")];
  if (caixaIgnoradoId) filtros.push(ne(fechamentosCaixa.id, caixaIgnoradoId));
  const [caixa] = await db.select({ id: fechamentosCaixa.id }).from(fechamentosCaixa).where(and(...filtros)).limit(1);
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
    tokenUsado: string;
    editadoPor: string;
    valoresAntigos: Record<string, unknown>;
    valoresNovos: Record<string, unknown>;
  },
  db: ExecutorBanco = banco
) {
  await db.insert(edicoesCaixa).values(input);
}

export async function caixaTemMovimentosRepository(caixaId: string, db: ExecutorBanco = banco) {
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
): Promise<TotaisCaixaOperacionalLinha> {
  const totais = {
    totalEntradas: 0,
    totalTransferencias: 0,
    totalTransferenciasEntrada: 0,
    totalTransferenciasSaida: 0,
    totalDespesas: 0,
    totalRetiradas: 0,
    totalMercadorias: 0
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
        and(eq(transferencias.caixaId, caixaId), eq(transferencias.computar, true), ne(transferencias.status, "cancelado"))
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
    totais.totalEntradas += Number(movimento.valorOriginal);
  }
  for (const movimento of linhasTransferencias) {
    const valor = Number(movimento.valorOriginal);
    totais.totalTransferencias += valor;
    if (movimento.contaDestinoId === pdvContaId) totais.totalTransferenciasEntrada += valor;
    if (movimento.contaOrigemId === pdvContaId) totais.totalTransferenciasSaida += valor;
  }
  for (const movimento of linhasDespesas) {
    totais.totalDespesas += Number(movimento.valorOriginal);
  }
  for (const movimento of linhasRetiradas) {
    totais.totalRetiradas += Number(movimento.valorOriginal);
  }
  for (const movimento of linhasMercadorias) {
    totais.totalMercadorias += Number(movimento.valorOriginal);
  }

  return {
    totalEntradas: totais.totalEntradas.toFixed(2),
    totalTransferencias: totais.totalTransferencias.toFixed(2),
    totalTransferenciasEntrada: totais.totalTransferenciasEntrada.toFixed(2),
    totalTransferenciasSaida: totais.totalTransferenciasSaida.toFixed(2),
    totalDespesas: totais.totalDespesas.toFixed(2),
    totalRetiradas: totais.totalRetiradas.toFixed(2),
    totalMercadorias: totais.totalMercadorias.toFixed(2)
  };
}

export async function criarAcertoSaldoCaixaRepository(
  input: {
    caixaId: string;
    empresaId: string;
    colaboradorId: string;
    contaOrigemId: string | null;
    grupoDespesaId: string | null;
    valorDiferenca: number;
    observacao: string | null;
    criadoPor: string;
    data: string;
  },
  db: ExecutorBanco = banco
) {
  const valor = input.valorDiferenca.toFixed(2);
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

  return { movimentacaoId: despesa.id, debitoId: debito.id };
}

export async function atualizarFechamentoCaixaRepository(
  input: {
    caixaId: string;
    dataHoraFechamento: Date;
    observacao: string | null;
    totalEntradas: number;
    totalTransferenciasEntrada: number;
    totalTransferenciasSaida: number;
    totalDespesas: number;
    totalRetiradas: number;
    totalMercadorias: number;
    saldo: number;
  },
  db: ExecutorBanco = banco
) {
  await db
    .update(fechamentosCaixa)
    .set({
      dataHoraFechamento: input.dataHoraFechamento,
      fechadoEm: new Date(),
      observacao: input.observacao,
      totalEntradas: input.totalEntradas.toFixed(2),
      totalTransferencias: (input.totalTransferenciasEntrada - input.totalTransferenciasSaida).toFixed(2),
      totalTransferenciasEntrada: input.totalTransferenciasEntrada.toFixed(2),
      totalTransferenciasSaida: input.totalTransferenciasSaida.toFixed(2),
      totalDespesas: input.totalDespesas.toFixed(2),
      totalRetiradas: input.totalRetiradas.toFixed(2),
      totalMercadorias: input.totalMercadorias.toFixed(2),
      saldo: input.saldo.toFixed(2),
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
