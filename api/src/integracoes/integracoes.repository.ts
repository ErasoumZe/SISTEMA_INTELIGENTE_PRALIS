import { and, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";
import { clientes, contas, formasPagamento, pdvs, produtos } from "@padaria/db/schema/cadastro";
import { fechamentosCaixa } from "@padaria/db/schema/caixa";
import {
  integracoesCamposConfig,
  integracoesChaves,
  integracoesHistorico,
  integracoesRegistros,
  integracoesSemNovidade,
  integracoesVinculos,
  vendas,
  vendasPagamentos,
  vendasProdutos
} from "@padaria/db/schema/venda";
import type {
  AtualizarCampoIntegracaoPayload,
  IntegracaoCampoConfigDto,
  IntegracaoHistoricoDto,
  IntegracaoQuery,
  IntegracaoVinculoDto,
  TipoIntegracao,
  TipoRegistroIntegracao,
  VendaIntegracaoAgregadaPayload
} from "@padaria/shared/integracoes";
import { banco, executarComTransacaoOpcional, type ExecutorBanco } from "../banco/conexao.js";

export type IntegracaoChaveLinha = {
  id: string;
  empresaId: string;
  tipo: TipoIntegracao;
  codigo: string;
  codigoHash: string | null;
  ativa: boolean;
};

export type VinculoSistema = {
  id: string;
};

export type RegistroIntegracaoLinha = {
  id: string;
  hashConteudo: string;
  registroSistemaId: string;
};

export async function listarChavesIntegracaoRepository(query: IntegracaoQuery, db: ExecutorBanco = banco) {
  const filtros = query.empresaId ? [eq(integracoesChaves.empresaId, query.empresaId)] : [];
  return db
    .select({
      id: integracoesChaves.id,
      empresaId: integracoesChaves.empresaId,
      tipo: integracoesChaves.tipo,
      codigo: integracoesChaves.codigo,
      codigoHash: integracoesChaves.codigoHash,
      ativa: integracoesChaves.ativa,
      criadoEm: integracoesChaves.criadoEm,
      inativadoEm: integracoesChaves.inativadoEm
    })
    .from(integracoesChaves)
    .where(filtros.length ? and(...filtros) : undefined)
    .orderBy(desc(integracoesChaves.criadoEm));
}

export async function buscarChavePorCodigoHashRepository(codigoHash: string, db: ExecutorBanco = banco) {
  const [chave] = await db
    .select({
      id: integracoesChaves.id,
      empresaId: integracoesChaves.empresaId,
      tipo: integracoesChaves.tipo,
      codigo: integracoesChaves.codigo,
      codigoHash: integracoesChaves.codigoHash,
      ativa: integracoesChaves.ativa
    })
    .from(integracoesChaves)
    .where(and(eq(integracoesChaves.codigoHash, codigoHash), eq(integracoesChaves.ativa, true)))
    .limit(1);
  return chave ?? null;
}

export async function criarChaveIntegracaoRepository(
  input: { empresaId: string; tipo: TipoIntegracao; codigo: string; codigoHash: string; criadoPor?: string },
  db: ExecutorBanco = banco
) {
  const [chave] = await db
    .insert(integracoesChaves)
    .values({ ...input, criadoPor: input.criadoPor ?? null })
    .returning({
      id: integracoesChaves.id,
      empresaId: integracoesChaves.empresaId,
      tipo: integracoesChaves.tipo,
      codigo: integracoesChaves.codigo,
      codigoHash: integracoesChaves.codigoHash,
      ativa: integracoesChaves.ativa,
      criadoEm: integracoesChaves.criadoEm,
      inativadoEm: integracoesChaves.inativadoEm
    });
  return chave;
}

export async function inativarChaveIntegracaoRepository(id: string, empresaId: string, db: ExecutorBanco = banco) {
  await db
    .update(integracoesChaves)
    .set({ ativa: false, inativadoEm: new Date() })
    .where(and(eq(integracoesChaves.id, id), eq(integracoesChaves.empresaId, empresaId)));
}

export async function obterEmpresaDaChaveRepository(id: string, db: ExecutorBanco = banco) {
  const [chave] = await db
    .select({ empresaId: integracoesChaves.empresaId })
    .from(integracoesChaves)
    .where(eq(integracoesChaves.id, id))
    .limit(1);
  return chave ?? null;
}

export async function listarHistoricoIntegracaoRepository(
  query: IntegracaoQuery,
  empresasPermitidas: string[] | null,
  db: ExecutorBanco = banco
): Promise<IntegracaoHistoricoDto[]> {
  const filtros = [];
  if (query.empresaId) filtros.push(eq(integracoesHistorico.empresaId, query.empresaId));
  else if (empresasPermitidas) filtros.push(inArray(integracoesHistorico.empresaId, empresasPermitidas));

  const linhas = await db
    .select({
      tipo: integracoesHistorico.tipo,
      status: integracoesHistorico.status,
      criadoEm: integracoesHistorico.criadoEm
    })
    .from(integracoesHistorico)
    .where(filtros.length ? and(...filtros) : undefined)
    .orderBy(desc(integracoesHistorico.criadoEm));

  const porDiaTipo = new Map<string, IntegracaoHistoricoDto>();
  for (const linha of linhas) {
    const dia = linha.criadoEm.toISOString().slice(0, 10);
    const chave = `${dia}:${linha.tipo}`;
    const atual =
      porDiaTipo.get(chave) ??
      ({
        dia,
        tipo: linha.tipo,
        recebidos: 0,
        novos: 0,
        atualizados: 0,
        semNovidade: 0,
        erros: 0
      } satisfies IntegracaoHistoricoDto);
    atual.recebidos += 1;
    if (linha.status === "criado") atual.novos += 1;
    if (linha.status === "atualizado") atual.atualizados += 1;
    if (linha.status === "sem_novidade") atual.semNovidade += 1;
    if (linha.status === "erro") atual.erros += 1;
    porDiaTipo.set(chave, atual);
  }

  return [...porDiaTipo.values()].sort((a, b) => b.dia.localeCompare(a.dia));
}

export async function listarCamposConfigRepository(
  empresaId: string,
  tipo: TipoIntegracao,
  db: ExecutorBanco = banco
): Promise<IntegracaoCampoConfigDto[]> {
  return db
    .select({
      empresaId: integracoesCamposConfig.empresaId,
      tipo: integracoesCamposConfig.tipo,
      campo: integracoesCamposConfig.campo,
      criarAutomaticamente: integracoesCamposConfig.criarAutomaticamente,
      vincularAutomaticamente: integracoesCamposConfig.vincularAutomaticamente
    })
    .from(integracoesCamposConfig)
    .where(and(eq(integracoesCamposConfig.empresaId, empresaId), eq(integracoesCamposConfig.tipo, tipo)));
}

export async function salvarCampoConfigRepository(input: AtualizarCampoIntegracaoPayload, db: ExecutorBanco = banco) {
  await db
    .insert(integracoesCamposConfig)
    .values(input)
    .onConflictDoUpdate({
      target: [integracoesCamposConfig.empresaId, integracoesCamposConfig.tipo, integracoesCamposConfig.campo],
      set: {
        criarAutomaticamente: input.criarAutomaticamente,
        vincularAutomaticamente: input.vincularAutomaticamente,
        atualizadoEm: new Date()
      }
    });
}

export async function listarVinculosRepository(
  empresaId: string,
  tipo: TipoIntegracao,
  db: ExecutorBanco = banco
): Promise<IntegracaoVinculoDto[]> {
  return db
    .select({
      id: integracoesVinculos.id,
      empresaId: integracoesVinculos.empresaId,
      tipo: integracoesVinculos.tipo,
      tipoRegistro: integracoesVinculos.tipoRegistro,
      identificadorExterno: integracoesVinculos.identificadorExterno,
      descricaoExterna: integracoesVinculos.descricaoExterna,
      registroSistemaId: integracoesVinculos.registroSistemaId,
      pendente: integracoesVinculos.pendente
    })
    .from(integracoesVinculos)
    .where(and(eq(integracoesVinculos.empresaId, empresaId), eq(integracoesVinculos.tipo, tipo)))
    .orderBy(desc(integracoesVinculos.atualizadoEm));
}

export async function upsertVinculoRepository(
  input: {
    empresaId: string;
    tipo: TipoIntegracao;
    tipoRegistro: TipoRegistroIntegracao;
    identificadorExterno: string;
    descricaoExterna?: string | null;
    registroSistemaId?: string | null;
    pendente: boolean;
  },
  db: ExecutorBanco = banco
) {
  await db
    .insert(integracoesVinculos)
    .values({
      empresaId: input.empresaId,
      tipo: input.tipo,
      tipoRegistro: input.tipoRegistro,
      identificadorExterno: input.identificadorExterno,
      descricaoExterna: input.descricaoExterna ?? null,
      registroSistemaId: input.registroSistemaId ?? null,
      pendente: input.pendente
    })
    .onConflictDoUpdate({
      target: [
        integracoesVinculos.empresaId,
        integracoesVinculos.tipo,
        integracoesVinculos.tipoRegistro,
        integracoesVinculos.identificadorExterno
      ],
      set: {
        descricaoExterna: input.descricaoExterna ?? null,
        registroSistemaId: input.registroSistemaId ?? null,
        pendente: input.pendente,
        atualizadoEm: new Date()
      }
    });
}

export async function buscarVinculoResolvidoRepository(
  empresaId: string,
  tipo: TipoIntegracao,
  tipoRegistro: TipoRegistroIntegracao,
  identificadorExterno: string,
  db: ExecutorBanco = banco
): Promise<VinculoSistema | null> {
  const [vinculo] = await db
    .select({ id: integracoesVinculos.registroSistemaId })
    .from(integracoesVinculos)
    .where(
      and(
        eq(integracoesVinculos.empresaId, empresaId),
        eq(integracoesVinculos.tipo, tipo),
        eq(integracoesVinculos.tipoRegistro, tipoRegistro),
        eq(integracoesVinculos.identificadorExterno, identificadorExterno),
        eq(integracoesVinculos.pendente, false),
        isNotNull(integracoesVinculos.registroSistemaId)
      )
    )
    .limit(1);
  return vinculo?.id ? { id: vinculo.id } : null;
}

export async function buscarRegistroIntegracaoRepository(
  chave: IntegracaoChaveLinha,
  tipoRegistro: TipoRegistroIntegracao,
  identificadorExterno: string,
  db: ExecutorBanco = banco
): Promise<RegistroIntegracaoLinha | null> {
  const [registro] = await db
    .select({
      id: integracoesRegistros.id,
      hashConteudo: integracoesRegistros.hashConteudo,
      registroSistemaId: integracoesRegistros.registroSistemaId
    })
    .from(integracoesRegistros)
    .where(
      and(
        eq(integracoesRegistros.empresaId, chave.empresaId),
        eq(integracoesRegistros.integracaoChaveId, chave.id),
        eq(integracoesRegistros.tipoRegistro, tipoRegistro),
        eq(integracoesRegistros.identificadorExterno, identificadorExterno)
      )
    )
    .limit(1);
  return registro ?? null;
}

export async function registrarSemNovidadeRepository(
  chave: IntegracaoChaveLinha,
  identificadorExterno: string,
  hashConteudo: string,
  payload: VendaIntegracaoAgregadaPayload,
  db: ExecutorBanco = banco
) {
  await db.insert(integracoesSemNovidade).values({
    empresaId: chave.empresaId,
    integracaoChaveId: chave.id,
    tipo: chave.tipo,
    identificadorExterno,
    hashConteudo,
    payload
  });
}

export async function registrarHistoricoRepository(
  input: {
    chave: IntegracaoChaveLinha;
    identificadorExterno?: string | null;
    hashConteudo?: string | null;
    status: "criado" | "atualizado" | "sem_novidade" | "erro";
    mensagemErro?: string | null;
    payload: VendaIntegracaoAgregadaPayload;
  },
  db: ExecutorBanco = banco
) {
  await db.insert(integracoesHistorico).values({
    empresaId: input.chave.empresaId,
    integracaoChaveId: input.chave.id,
    tipo: input.chave.tipo,
    identificadorExterno: input.identificadorExterno ?? null,
    hashConteudo: input.hashConteudo ?? null,
    status: input.status,
    mensagemErro: input.mensagemErro ?? null,
    payload: input.payload
  });
}

export async function buscarPdvAutomaticoRepository(
  empresaId: string,
  identificadorExterno: string,
  nome: string,
  db: ExecutorBanco = banco
) {
  const [pdv] = await db
    .select({ id: pdvs.id })
    .from(pdvs)
    .where(and(eq(pdvs.empresaId, empresaId), ilike(pdvs.codigo, identificadorExterno)))
    .limit(1);
  if (pdv) return pdv;

  const [porNome] = await db
    .select({ id: pdvs.id })
    .from(pdvs)
    .where(and(eq(pdvs.empresaId, empresaId), ilike(pdvs.nome, nome)))
    .limit(1);
  return porNome ?? null;
}

export async function criarPdvComContaRepository(empresaId: string, nome: string, codigo: string, db?: ExecutorBanco) {
  return executarComTransacaoOpcional(db, async (db) => {
    const [conta] = await db
      .insert(contas)
      .values({ empresaId, nome: `Conta ${nome}` })
      .returning({ id: contas.id });
    if (!conta) throw new Error("Conta do PDV nao criada");
    const [pdv] = await db
      .insert(pdvs)
      .values({ empresaId, nome, codigo, contaId: conta.id, ativo: true })
      .returning({ id: pdvs.id });
    if (!pdv) throw new Error("PDV nao criado");
    return pdv;
  });
}

export async function buscarClienteAutomaticoRepository(
  empresaId: string,
  documento: string | null | undefined,
  nome: string | null | undefined,
  db: ExecutorBanco = banco
) {
  if (documento) {
    const [cliente] = await db
      .select({ id: clientes.id })
      .from(clientes)
      .where(and(eq(clientes.empresaId, empresaId), ilike(clientes.documento, documento)))
      .limit(1);
    if (cliente) return cliente;
  }
  if (!nome) return null;
  const [cliente] = await db
    .select({ id: clientes.id })
    .from(clientes)
    .where(and(eq(clientes.empresaId, empresaId), ilike(clientes.nome, nome)))
    .limit(1);
  return cliente ?? null;
}

export async function criarClienteRepository(
  empresaId: string,
  nome: string,
  documento: string | null | undefined,
  db: ExecutorBanco = banco
) {
  const [cliente] = await db
    .insert(clientes)
    .values({ empresaId, nome, documento: documento ?? null })
    .returning({ id: clientes.id });
  if (!cliente) throw new Error("Cliente nao criado");
  return cliente;
}

export async function buscarProdutoAutomaticoRepository(
  empresaId: string,
  identificadorExterno: string,
  descricao: string,
  db: ExecutorBanco = banco
) {
  const [porCodigo] = await db
    .select({ id: produtos.id })
    .from(produtos)
    .where(and(eq(produtos.empresaId, empresaId), ilike(produtos.codigo, identificadorExterno)))
    .limit(1);
  if (porCodigo) return porCodigo;
  const [porDescricao] = await db
    .select({ id: produtos.id })
    .from(produtos)
    .where(and(eq(produtos.empresaId, empresaId), ilike(produtos.descricao, descricao)))
    .limit(1);
  return porDescricao ?? null;
}

export async function criarProdutoRepository(
  empresaId: string,
  codigo: string,
  descricao: string,
  db: ExecutorBanco = banco
) {
  const [produto] = await db.insert(produtos).values({ empresaId, codigo, descricao }).returning({ id: produtos.id });
  if (!produto) throw new Error("Produto nao criado");
  return produto;
}

export async function buscarFormaPagamentoAutomaticoRepository(
  empresaId: string,
  nome: string,
  db: ExecutorBanco = banco
) {
  const [forma] = await db
    .select({ id: formasPagamento.id })
    .from(formasPagamento)
    .where(and(eq(formasPagamento.empresaId, empresaId), ilike(formasPagamento.nome, nome)))
    .limit(1);
  return forma ?? null;
}

export async function criarFormaPagamentoRepository(empresaId: string, nome: string, db: ExecutorBanco = banco) {
  const [forma] = await db
    .insert(formasPagamento)
    .values({ empresaId, nome })
    .onConflictDoUpdate({
      target: [formasPagamento.empresaId, formasPagamento.nome],
      set: { nome, atualizadoEm: new Date() }
    })
    .returning({ id: formasPagamento.id });
  if (!forma) throw new Error("Forma de pagamento nao criada");
  return forma;
}

// Caixa que "recebe" a venda integrada: mesmo PDV e a dataVenda dentro do periodo em que o caixa
// esteve aberto ([abertura, fechamento]; enquanto aberto, fechamento e null -> sem limite superior).
// Regra do negocio (Ze, 07/07): a venda alimenta o caixa X se foi feita no PDV do caixa X dentro do
// periodo em que o caixa X estava aberto.
export async function buscarCaixaParaVendaRepository(
  empresaId: string,
  pdvId: string,
  dataVenda: Date,
  db: ExecutorBanco = banco
): Promise<{ id: string } | null> {
  const [caixa] = await db
    .select({ id: fechamentosCaixa.id })
    .from(fechamentosCaixa)
    .where(
      and(
        eq(fechamentosCaixa.empresaId, empresaId),
        eq(fechamentosCaixa.pdvId, pdvId),
        lte(fechamentosCaixa.dataHoraAbertura, dataVenda),
        or(isNull(fechamentosCaixa.dataHoraFechamento), gte(fechamentosCaixa.dataHoraFechamento, dataVenda))
      )
    )
    .orderBy(desc(fechamentosCaixa.dataHoraAbertura))
    .limit(1);
  return caixa ?? null;
}

export async function criarOuAtualizarVendaIntegradaRepository(
  input: {
    chave: IntegracaoChaveLinha;
    payload: VendaIntegracaoAgregadaPayload;
    hashConteudo: string;
    vendaSistemaId?: string;
    pdvId: string | null;
    clienteId: string | null;
    colaboradorId: string | null;
    caixaId: string | null;
    produtosPorIdentificador: Map<string, string | null>;
    formasPagamentoPorIdentificador: Map<string, string | null>;
  },
  db?: ExecutorBanco
) {
  return executarComTransacaoOpcional(db, async (db) => {
    const vendaPayload = input.payload.Venda;
    const dataVenda = vendaPayload.dataHoraVenda;
    const valoresVenda = {
      empresaId: input.chave.empresaId,
      integracaoChaveId: input.chave.id,
      dataReferencia: dataVenda.toISOString().slice(0, 10),
      dataVenda,
      descricao: `Venda ${vendaPayload.idVenda}`,
      valorOriginal: String(vendaPayload.valorOriginal),
      valorAcrescimo: String(vendaPayload.acrescimo),
      valorDesconto: String(vendaPayload.desconto),
      pdvId: input.pdvId,
      caixaId: input.caixaId,
      clienteId: input.clienteId,
      colaboradorId: input.colaboradorId,
      identificadorExterno: vendaPayload.idVenda,
      hashIntegracao: input.hashConteudo,
      statusExterno: vendaPayload.statusVenda,
      status: vendaPayload.statusVenda.toLowerCase().includes("cancel") ? "cancelado" : "aprovado",
      numeroNotaFiscal: vendaPayload.numeroNotaFiscal ?? null,
      pdvAutomacaoId: vendaPayload.idCaixa,
      pdvAutomacao: vendaPayload.nomeCaixa,
      clienteAutomacaoId: vendaPayload.idCliente ?? null,
      clienteAutomacao: vendaPayload.nomeCliente ?? null,
      clienteAutomacaoDocumento: vendaPayload.documentoCliente ?? null,
      automacaoId: input.chave.codigo,
      computar: true,
      atualizadoEm: new Date()
    };

    const vendaId = input.vendaSistemaId
      ? input.vendaSistemaId
      : (await db.insert(vendas).values(valoresVenda).returning({ id: vendas.id }))[0]?.id;

    if (!vendaId) throw new Error("Venda nao criada");

    if (input.vendaSistemaId) {
      await db.update(vendas).set(valoresVenda).where(eq(vendas.id, input.vendaSistemaId));
      await db.delete(vendasProdutos).where(eq(vendasProdutos.vendaId, input.vendaSistemaId));
      await db.delete(vendasPagamentos).where(eq(vendasPagamentos.vendaId, input.vendaSistemaId));
    }

    for (const item of input.payload.ItensVenda) {
      await db.insert(vendasProdutos).values({
        vendaId,
        produtoId: input.produtosPorIdentificador.get(item.idProduto) ?? null,
        produtoAutomacaoId: item.idProduto,
        produtoAutomacaoCodigo: item.idRegistro,
        descricaoProduto: item.descricaoProduto,
        dataHoraItem: item.dataHoraItem,
        quantidade: String(item.quantidade),
        valorUnitario: String(item.valorUnitario),
        valorDesconto: String(item.desconto),
        valorAcrescimo: String(item.acrescimo),
        valorTotal: String(item.total),
        cancelado: item.itemCancelado
      });
    }

    for (const pagamento of input.payload.PagamentosVenda) {
      await db.insert(vendasPagamentos).values({
        vendaId,
        formaPagamentoId: input.formasPagamentoPorIdentificador.get(pagamento.idFormaPagamento) ?? null,
        tipoPagamentoAutomacaoId: pagamento.idFormaPagamento,
        tipoPagamentoAutomacao: pagamento.descricaoFormaPagamento,
        numeroVendas: 1,
        totalPago: String(pagamento.valor)
      });
    }

    return { id: vendaId };
  });
}

export async function upsertRegistroIntegracaoRepository(
  input: {
    chave: IntegracaoChaveLinha;
    identificadorExterno: string;
    hashConteudo: string;
    registroSistemaId: string;
    payload: VendaIntegracaoAgregadaPayload;
  },
  db: ExecutorBanco = banco
) {
  await db
    .insert(integracoesRegistros)
    .values({
      empresaId: input.chave.empresaId,
      integracaoChaveId: input.chave.id,
      tipoRegistro: "venda",
      identificadorExterno: input.identificadorExterno,
      hashConteudo: input.hashConteudo,
      registroSistemaId: input.registroSistemaId,
      payload: input.payload
    })
    .onConflictDoUpdate({
      target: [
        integracoesRegistros.empresaId,
        integracoesRegistros.integracaoChaveId,
        integracoesRegistros.tipoRegistro,
        integracoesRegistros.identificadorExterno
      ],
      set: {
        hashConteudo: input.hashConteudo,
        registroSistemaId: input.registroSistemaId,
        payload: input.payload,
        atualizadoEm: new Date()
      }
    });
}
