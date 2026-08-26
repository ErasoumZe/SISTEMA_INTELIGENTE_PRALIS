import type { DadosExternos } from "@padaria/shared/api";
import { and, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, ne, or, sum, type SQL } from "drizzle-orm";
import {
  clientes,
  contas,
  empresas,
  formasPagamento,
  pdvs,
  perfisUsuarios,
  produtos,
  usuariosEmpresas
} from "@padaria/db/schema/cadastro";
import { alteracoesPosFechamentoCaixa, fechamentosCaixa } from "@padaria/db/schema/caixa";
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
import { diaNegocio } from "@padaria/shared/datas";
import { banco, executarComTransacaoOpcional, type ExecutorBanco } from "../banco/conexao.js";
import { liquidoCentavos, paraCentavos } from "@padaria/shared/dinheiro";
import {
  resolverRoteamentoDoPagamento,
  somaDosPagamentosFecha,
  vendaAceitaRoteamento,
  type MotivoPendenciaRoteamento,
  type RoteamentoDoPagamento,
  type StatusRoteamento
} from "@padaria/shared/integracoes";
import { buscarRoteamentosDaEmpresaRepository } from "../formas-pagamento/formas-pagamento.repository.js";
import type { RoteamentoDaForma } from "@padaria/shared/formas-pagamento";

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

// Empresas (distintas) que tem ao menos uma chave de integracao ATIVA do tipo dado — o universo
// que deve receber alerta de silencio. Traz o nome para compor o e-mail.
export async function listarEmpresasComChaveAtivaRepository(
  tipo: TipoIntegracao,
  db: ExecutorBanco = banco
): Promise<Array<{ empresaId: string; nome: string }>> {
  return db
    .selectDistinct({ empresaId: integracoesChaves.empresaId, nome: empresas.nome })
    .from(integracoesChaves)
    .innerJoin(empresas, eq(empresas.id, integracoesChaves.empresaId))
    .where(and(eq(integracoesChaves.tipo, tipo), eq(integracoesChaves.ativa, true)));
}

// Quantas vendas RECEBIDAS por integracao (integracao_chave_id preenchido) a empresa teve no dia
// (data_referencia). Zero = dia silencioso. Qualquer status conta (a venda foi recebida).
export async function contarVendasIntegradasNoDiaRepository(
  empresaId: string,
  dia: string,
  db: ExecutorBanco = banco
): Promise<number> {
  const [linha] = await db
    .select({ total: count() })
    .from(vendas)
    .where(and(eq(vendas.empresaId, empresaId), isNotNull(vendas.integracaoChaveId), eq(vendas.dataReferencia, dia)));
  return linha?.total ?? 0;
}

// Vendas do sistema no dia, agrupadas por PDV — o lado "sistema" da conciliacao.
// Regua igual a do CREARE: o dia e data_referencia (que, apos a correcao do fuso, e o dia LOCAL
// derivado de data_venda) e o valor e o LIQUIDO, que corresponde ao VALOR_TOTAL do CREARE.
// Somamos as tres colunas e combinamos em JS: soma e linear, entao da o mesmo que
// SUM(original - desconto + acrescimo), sem expressao aritmetica em SQL.
// Conta TODAS as vendas do PDV no dia (integradas ou nao): a pergunta e "o caixa bate?", nao
// "a integracao entregou?" — para isso ja existe o alerta de silencio.
export async function somarVendasPorPdvNoDiaRepository(
  empresaId: string,
  dia: string,
  pdvIds: string[],
  db: ExecutorBanco = banco
): Promise<
  Array<{
    pdvId: string | null;
    quantidadeVendas: number;
    somaOriginal: string | null;
    somaDesconto: string | null;
    somaAcrescimo: string | null;
  }>
> {
  if (!pdvIds.length) return [];
  return db
    .select({
      pdvId: vendas.pdvId,
      quantidadeVendas: count(),
      somaOriginal: sum(vendas.valorOriginal),
      somaDesconto: sum(vendas.valorDesconto),
      somaAcrescimo: sum(vendas.valorAcrescimo)
    })
    .from(vendas)
    .where(
      and(
        eq(vendas.empresaId, empresaId),
        eq(vendas.dataReferencia, dia),
        ne(vendas.status, "cancelado"),
        inArray(vendas.pdvId, pdvIds)
      )
    )
    .groupBy(vendas.pdvId);
}

export async function listarNomesPdvsRepository(
  pdvIds: string[],
  db: ExecutorBanco = banco
): Promise<Array<{ id: string; nome: string }>> {
  if (!pdvIds.length) return [];
  return db.select({ id: pdvs.id, nome: pdvs.nome }).from(pdvs).where(inArray(pdvs.id, pdvIds));
}

// Dos identificadores externos (idVenda) informados, quais JA foram registrados por esta chave de
// integracao. O complemento (informados - presentes) sao as vendas que o CREARE tem e o sistema nao
// recebeu — o diagnostico do e-mail de divergencia. So le o ledger da integracao (registros).
export async function listarIdsVendaRegistradosRepository(
  empresaId: string,
  integracaoChaveId: string,
  identificadoresExternos: string[],
  db: ExecutorBanco = banco
): Promise<string[]> {
  if (!identificadoresExternos.length) return [];
  const linhas = await db
    .select({ identificadorExterno: integracoesRegistros.identificadorExterno })
    .from(integracoesRegistros)
    .where(
      and(
        eq(integracoesRegistros.empresaId, empresaId),
        eq(integracoesRegistros.integracaoChaveId, integracaoChaveId),
        eq(integracoesRegistros.tipoRegistro, "venda"),
        inArray(integracoesRegistros.identificadorExterno, identificadoresExternos)
      )
    );
  return linhas.map((linha) => linha.identificadorExterno);
}

// E-mails (distintos) dos administradores vinculados a empresa — destinatarios do alerta.
export async function listarEmailsAdminsDaEmpresaRepository(
  empresaId: string,
  db: ExecutorBanco = banco
): Promise<Array<{ nome: string; email: string }>> {
  return db
    .selectDistinct({ nome: perfisUsuarios.nome, email: perfisUsuarios.email })
    .from(perfisUsuarios)
    .innerJoin(usuariosEmpresas, eq(usuariosEmpresas.usuarioId, perfisUsuarios.usuarioId))
    .where(and(eq(usuariosEmpresas.empresaId, empresaId), inArray(perfisUsuarios.role, ["usuario_admin", "admin"])));
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
    const dia = diaNegocio(linha.criadoEm);
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

/**
 * A venda integrada pela MESMA chave do indice unico parcial da R-175:
 * `(empresa_id, identificador_externo) where integracao_chave_id is not null`.
 *
 * POR QUE ISTO EXISTE, se `buscarRegistroIntegracaoRepository` ja responde "ja recebi esta venda?":
 * porque o registro e escopado por `integracao_chave_id` (unique
 * `integracoes_registros_externo_unico`). Depois de uma TROCA DE CREDENCIAL o registro da chave
 * antiga nao e encontrado, `registro` volta nulo e o servico tomava o caminho de INSERT para uma
 * venda que JA EXISTE — duplicata sequencial, sem corrida nenhuma.
 *
 * Ao decidir criar-ou-atualizar pela mesma chave que o BANCO usa para recusar duplicata, os dois
 * lados passam a concordar: o que o indice barra, o codigo ja resolveu antes de tentar.
 *
 * SEM TRAVA de proposito. Este e um pre-retrato, e ele nao autoriza nada: quem manda e a releitura
 * sob `travarVendaRepository`, feita logo adiante na mesma transacao (invariante da S8, R-164). E
 * exatamente o mesmo padrao ja usado para o caixa de ORIGEM.
 */
export async function buscarVendaIntegradaPorIdentificadorRepository(
  empresaId: string,
  identificadorExterno: string,
  db: ExecutorBanco = banco
): Promise<string | null> {
  const [linha] = await db
    .select({ id: vendas.id })
    .from(vendas)
    .where(
      and(
        eq(vendas.empresaId, empresaId),
        eq(vendas.identificadorExterno, identificadorExterno),
        isNotNull(vendas.integracaoChaveId)
      )
    )
    .limit(1);
  return linha?.id ?? null;
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
    // Aceita o payload validado (com Date) no sucesso e o corpo cru no erro de validacao.
    payload: DadosExternos;
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
): Promise<{ id: string; status: string } | null> {
  const [caixa] = await db
    .select({ id: fechamentosCaixa.id, status: fechamentosCaixa.status })
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

// S8: o caixa ATUAL de uma venda ja ingerida — a ORIGEM de um re-envio que pode move-la.
export async function buscarCaixaDaVendaRepository(vendaId: string, db: ExecutorBanco = banco) {
  const [linha] = await db.select({ caixaId: vendas.caixaId }).from(vendas).where(eq(vendas.id, vendaId)).limit(1);
  return linha?.caixaId ?? null;
}

export async function registrarAlteracaoPosFechamentoRepository(
  input: { empresaId: string; fechamentoCaixaId: string; vendaId: string },
  db: ExecutorBanco = banco
) {
  await db
    .insert(alteracoesPosFechamentoCaixa)
    .values(input)
    .onConflictDoNothing({
      target: [alteracoesPosFechamentoCaixa.fechamentoCaixaId, alteracoesPosFechamentoCaixa.vendaId]
    });
}

// Predicado do indice unico parcial `vendas_integracao_identificador_unico_idx` (R-175), repetido
// aqui porque e assim que o Postgres infere qual indice PARCIAL serve de arbitro no ON CONFLICT.
// Precisa IMPLICAR o predicado da migration 0032. Divergir nao devolve 23505: o Postgres nao
// infere arbitro nenhum e levanta 42P10 em TODA insercao — por isso 42P10 tambem entra na
// familia transitoria do servico, e nao no 422 que descartaria a venda.
//
// Montado por OPERADORES do Drizzle, nunca por template de SQL cru — `verificar-arquitetura.mjs`
// proibe SQL cru em api/src. O `as SQL` e necessario, nao cosmetico: `and()` e tipado como
// `SQL | undefined` (o caso de lista vazia, impossivel aqui), e o `exactOptionalPropertyTypes` do
// projeto recusa `undefined` explicito na propriedade opcional `where`.
const PREDICADO_VENDA_INTEGRADA_UNICA = and(
  isNotNull(vendas.integracaoChaveId),
  isNotNull(vendas.identificadorExterno)
) as SQL;

// As contas que HOJE recebem credito DISPONIVEL desta venda.
//
// Existe para a ingestao travar essas contas antes de mexer na venda (P1 de concorrencia): reenviar
// uma venda cancelada, ou reroteada, RETIRA credito que ja esta no saldo — e retirar saldo tem de
// passar pela mesma porta que a R-165 usa para autorizar saida, senao uma despesa aprovada sobre
// R$ 500 pode terminar com a conta em R$ -500 porque o CREARE cancelou a venda em paralelo.
//
// Mesmo predicado da 6a consulta do saldo, de proposito: se um dia divergirem, a trava protegeria um
// conjunto diferente do que o saldo conta.
export async function contasComCreditoDisponivelDaVendaRepository(
  vendaId: string,
  empresaId: string,
  db: ExecutorBanco = banco
): Promise<string[]> {
  const linhas = await db
    .select({ contaFinalId: vendasPagamentos.contaFinalId })
    .from(vendasPagamentos)
    .innerJoin(vendas, eq(vendas.id, vendasPagamentos.vendaId))
    .where(
      and(
        eq(vendasPagamentos.vendaId, vendaId),
        eq(vendas.empresaId, empresaId),
        eq(vendasPagamentos.roteamentoStatus, "roteado"),
        isNotNull(vendasPagamentos.disponivelEm)
      )
    );
  return [...new Set(linhas.map((linha) => linha.contaFinalId).filter((id): id is string => !!id))];
}

// A conta do PDV, escopada pela EMPRESA. O escopo nao e decoracao: e ele que impede o dinheiro de
// uma loja cair na conta de outra caso um id de PDV chegue trocado.
export async function buscarContaDoPdvRepository(
  pdvId: string,
  empresaId: string,
  db: ExecutorBanco = banco
): Promise<string | null> {
  const [linha] = await db
    .select({ contaId: pdvs.contaId })
    .from(pdvs)
    .where(and(eq(pdvs.id, pdvId), eq(pdvs.empresaId, empresaId)))
    .limit(1);
  return linha?.contaId ?? null;
}

// O que a venda virou do ponto de vista financeiro. Vai para o historico interno e para a resposta
// do agente em forma resumida — nunca com id de conta, que e dado financeiro interno.
export type ResumoRoteamentoVenda = {
  aplicavel: boolean;
  somaFecha: boolean;
  diferencaCentavos: number;
  roteados: number;
  pendentes: number;
  motivos: MotivoPendenciaRoteamento[];
};

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
      // Dia CONTABIL no fuso do negocio. Com toISOString() (UTC), venda a partir das 21:00 locais
      // caia no dia seguinte — no caixa errado e divergindo do CREARE (BUG B).
      dataReferencia: diaNegocio(dataVenda),
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
      // Texto cru do vendedor: guardado SEMPRE (mesmo sem vinculo resolvido) para auditoria e pendencia.
      colaboradorAutomacaoId: vendaPayload.vendedor?.identificador ?? null,
      colaboradorAutomacao: vendaPayload.vendedor?.nome ?? null,
      automacaoId: input.chave.codigo,
      computar: true,
      atualizadoEm: new Date()
    };

    let vendaId = input.vendaSistemaId;
    if (!vendaId) {
      // R-175 (#41): o INSERT arbitra pelo indice unico parcial de `vendas` — ver
      // PREDICADO_VENDA_INTEGRADA_UNICA logo acima.
      //
      // DO NOTHING, nunca DO UPDATE. Quem chega aqui acredita estar CRIANDO: calculou
      // `caixaOrigemId = null` e nao travou a linha da venda. Um DO UPDATE atropelaria as
      // invariantes da S8 — trava de origem e destino em ordem deterministica, marca de
      // pos-fechamento no caixa que PERDEU a venda e a deteccao de "a venda mudou de caixa".
      const [criada] = await db
        .insert(vendas)
        .values(valoresVenda)
        .onConflictDoNothing({
          target: [vendas.empresaId, vendas.identificadorExterno],
          where: PREDICADO_VENDA_INTEGRADA_UNICA
        })
        .returning({ id: vendas.id });

      // Zero linhas NAO e falha: outra requisicao criou a mesma venda e commitou primeiro. Quem
      // decide o que isso significa para o HTTP e o servico — repositorio nao conhece taxonomia de
      // erro. O `null` diz "perdi a corrida", e nada foi escrito.
      if (!criada) return null;
      vendaId = criada.id;
    }

    // CORTE HISTORICO (R-166), lido ANTES de apagar os pagamentos — depois do delete a informacao
    // nao existe mais. O marcador e o proprio `roteamento_status`: o codigo novo nunca grava
    // `nao_aplicavel`, entao venda cujos pagamentos estao todos nesse estado e anterior ao
    // roteamento e continua assim, inclusive quando o CREARE a reenvia. Rotear no reenvio seria
    // regularizacao automatica de historico, que a R-166 proibe.
    let statusExistentes: StatusRoteamento[] = [];
    if (input.vendaSistemaId) {
      const linhas = await db
        .select({ status: vendasPagamentos.roteamentoStatus })
        .from(vendasPagamentos)
        .where(eq(vendasPagamentos.vendaId, input.vendaSistemaId));
      statusExistentes = linhas.map((linha) => linha.status as StatusRoteamento);
    }
    const aplicavel = vendaAceitaRoteamento({ criando: !input.vendaSistemaId, statusExistentes });

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

    // --- Roteamento financeiro da venda (R-167/R-168/R-169/R-173) -----------------------------
    //
    // UMA consulta de roteamento por venda, nunca uma por pagamento. Quando a venda nao e aplicavel
    // (historico), nem sequer consultamos: nada muda para ela.
    const formaIds = input.payload.PagamentosVenda.map(
      (pagamento) => input.formasPagamentoPorIdentificador.get(pagamento.idFormaPagamento) ?? null
    );
    const roteamentos: Map<string, RoteamentoDaForma> = aplicavel
      ? await buscarRoteamentosDaEmpresaRepository(
          input.chave.empresaId,
          formaIds.filter((id): id is string => !!id),
          db
        )
      : new Map<string, RoteamentoDaForma>();
    const contaDoPdvId =
      aplicavel && input.pdvId ? await buscarContaDoPdvRepository(input.pdvId, input.chave.empresaId, db) : null;

    // R-173: a soma dos pagamentos tem de bater com o LIQUIDO da venda, com tolerancia ZERO. Uma
    // formula so — a mesma `liquidoCentavos` que o saldo da conta usa desde sempre.
    const soma = somaDosPagamentosFecha({
      liquidoCentavos: liquidoCentavos(valoresVenda),
      pagamentosCentavos: input.payload.PagamentosVenda.map((pagamento) => paraCentavos(pagamento.valor))
    });

    const resumo: ResumoRoteamentoVenda = {
      aplicavel,
      somaFecha: soma.fecha,
      diferencaCentavos: soma.diferencaCentavos,
      roteados: 0,
      pendentes: 0,
      motivos: []
    };

    for (const [indice, pagamento] of input.payload.PagamentosVenda.entries()) {
      const formaPagamentoId = formaIds[indice] ?? null;

      // Tres caminhos, nesta ordem, e a ordem importa:
      //   1. venda historica  -> `nao_aplicavel`, o estado de quem e anterior ao conceito;
      //   2. soma nao fecha   -> a VENDA INTEIRA fica pendente (R-173). Quando a soma nao bate, a
      //      diferenca nao e atribuivel a um pagamento especifico, entao nao ha "parcela divergente"
      //      — nenhum valor entra em conta nenhuma e nasce uma conciliacao;
      //   3. caso normal      -> decisao por forma, sem fallback (R-168).
      const decisao: RoteamentoDoPagamento | null = !aplicavel
        ? null
        : !soma.fecha
          ? {
              status: "pendente",
              contaRecebivelId: null,
              contaFinalId: null,
              adquirente: null,
              disponivelEm: null,
              motivo: "soma_nao_fecha"
            }
          : resolverRoteamentoDoPagamento({
              roteamento: formaPagamentoId ? (roteamentos.get(formaPagamentoId) ?? null) : null,
              contaDoPdvId,
              dataVenda
            });

      if (decisao?.status === "roteado") resumo.roteados += 1;
      if (decisao?.status === "pendente") {
        resumo.pendentes += 1;
        if (!resumo.motivos.includes(decisao.motivo)) resumo.motivos.push(decisao.motivo);
      }

      await db.insert(vendasPagamentos).values({
        vendaId,
        formaPagamentoId,
        tipoPagamentoAutomacaoId: pagamento.idFormaPagamento,
        tipoPagamentoAutomacao: pagamento.descricaoFormaPagamento,
        numeroVendas: 1,
        totalPago: String(pagamento.valor),
        // Sem decisao = venda historica: as colunas ficam no DEFAULT (`nao_aplicavel`, tudo nulo),
        // que e a verdade sobre ela.
        ...(decisao
          ? {
              roteamentoStatus: decisao.status,
              contaRecebivelId: decisao.contaRecebivelId,
              contaFinalId: decisao.contaFinalId,
              adquirente: decisao.adquirente,
              disponivelEm: decisao.disponivelEm
            }
          : {})
      });
    }

    return { id: vendaId, roteamento: resumo };
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
