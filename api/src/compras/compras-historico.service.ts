import {
  LIMITE_PENDENCIAS_HISTORICO,
  normalizarNomeHistorico,
  type AnalisarHistorico,
  type HistoricoAplicacaoDto,
  type HistoricoImportacaoDetalheDto,
  type HistoricoResultado,
  type HistoricoResumoDto
} from "@padaria/shared/compras";
import type { DadosExternos } from "@padaria/shared/api";
import { executarEmTransacao, type ExecutorBanco } from "../banco/conexao.js";
import { conflito, naoEncontrado, proibido } from "../erros.js";
import { podeAcessarEmpresa, type PerfilComEmpresa } from "../auth/empresa.js";
import {
  atualizarPareamentoHistoricoRepository,
  atualizarTotaisImportacaoHistoricoRepository,
  atualizarTotaisPareamentoHistoricoRepository,
  aliasExistenteHistoricoRepository,
  aprovarVinculosPendentesHistoricoRepository,
  buscarImportacaoHistoricoPorHashRepository,
  buscarImportacaoHistoricoRepository,
  cancelarImportacaoHistoricoRepository,
  contarPorResultadoHistoricoRepository,
  criarAnaliseHistoricoRepository,
  criarFornecedorHistoricoRepository,
  criarVinculosHistoricoRepository,
  fornecedoresPendentesHistoricoRepository,
  inserirAliasHistoricoRepository,
  inserirHistoricoPrecosRepository,
  itensAplicaveisHistoricoRepository,
  itensReparaveisHistoricoRepository,
  linhasPendentesHistoricoRepository,
  listarAliasesHistoricoRepository,
  listarFornecedoresParaHistoricoRepository,
  listarImportacoesHistoricoRepository,
  listarProdutosParaHistoricoRepository,
  nomeInformadoDoFornecedorHistoricoRepository,
  produtosPendentesHistoricoRepository,
  resumoHistoricoRepository,
  totalAplicadasHistoricoRepository,
  travarImportacaoHistoricoRepository,
  ultimosCustosHistoricoRepository,
  validarFornecedorHistoricoRepository,
  vinculosDoCatalogoHistoricoRepository,
  type ItemAnalisadoHistorico
} from "./compras-historico.repository.js";
import {
  construirIndicesHistorico,
  motivoLinhaInvalida,
  parearLinhaHistorico,
  planejarVinculos,
  type ItemAplicavel
} from "./compras-historico-pareamento.js";

// R-222 (PROJECT_BRAIN/55): analisar -> parear -> aplicar. Nada aqui toca `produtos_precos_base`.

const HASH_JA_ANALISADO = "PURCHASE_HISTORY_FILE_ALREADY_ANALYZED";
const OBSERVACAO_VINCULO = "Vínculo criado pelo histórico de compras importado da planilha";

function exigirEmpresa(perfil: PerfilComEmpresa, empresaId: string) {
  if (!podeAcessarEmpresa(perfil, empresaId)) throw proibido("Empresa nao permitida", "FORBIDDEN_COMPANY");
}

// Mesma leitura de unicidade do preco-base: por CODIGO e NOME da constraint, descendo a `cause`.
function ehViolacaoDeUnicidade(erro: DadosExternos, constraint: string): boolean {
  const candidatos = [erro, erro instanceof Error && erro.cause instanceof Error ? erro.cause : null];
  return candidatos.some((atual) => {
    if (!atual) return false;
    const detalhes = atual as { code?: string; constraint?: string };
    return detalhes.code === "23505" && detalhes.constraint === constraint;
  });
}

async function carregarIndices(empresaId: string, db?: ExecutorBanco) {
  const [fornecedores, aliases, produtos] = await Promise.all([
    listarFornecedoresParaHistoricoRepository(empresaId, db),
    listarAliasesHistoricoRepository(empresaId, db),
    listarProdutosParaHistoricoRepository(empresaId, db)
  ]);
  return construirIndicesHistorico(fornecedores, aliases, produtos);
}

export async function analisarHistorico(dados: AnalisarHistorico, perfil: PerfilComEmpresa, usuarioId: string) {
  exigirEmpresa(perfil, dados.empresaId);
  const repetida = await buscarImportacaoHistoricoPorHashRepository(dados.empresaId, dados.hashArquivo);
  if (repetida) throw conflito("Este arquivo ja foi analisado", HASH_JA_ANALISADO, repetida);

  const indices = await carregarIndices(dados.empresaId);
  const itens: ItemAnalisadoHistorico[] = dados.linhas.map((linha) => {
    const fornecedorNormalizado = normalizarNomeHistorico(linha.fornecedor);
    const produtoNormalizado = normalizarNomeHistorico(linha.produto);
    const base = {
      numeroLinha: linha.numeroLinha,
      fornecedorInformado: linha.fornecedor,
      fornecedorNormalizado,
      produtoInformado: linha.produto,
      produtoNormalizado,
      dataCompra: linha.dataCompra,
      quantidade: linha.quantidade,
      custoUnitario: linha.custoUnitario,
      documento: linha.documento
    };
    const invalida = motivoLinhaInvalida(linha);
    if (invalida)
      return { ...base, fornecedorId: null, produtoId: null, resultado: "invalido" as const, detalhe: invalida };
    return { ...base, ...parearLinhaHistorico(fornecedorNormalizado, produtoNormalizado, indices) };
  });

  const datas = dados.linhas.map((linha) => linha.dataCompra).filter((data): data is string => Boolean(data));
  const ordenadas = [...datas].sort();
  try {
    return await executarEmTransacao((tx) =>
      criarAnaliseHistoricoRepository(
        {
          empresaId: dados.empresaId,
          nomeArquivo: dados.nomeArquivo,
          hashArquivo: dados.hashArquivo,
          usuarioId,
          periodoInicio: ordenadas[0] ?? null,
          periodoFim: ordenadas.at(-1) ?? null,
          itens
        },
        tx
      )
    );
  } catch (erro) {
    if (ehViolacaoDeUnicidade(erro, "compras_historico_importacoes_empresa_hash_unico"))
      throw conflito("Este arquivo ja foi analisado", HASH_JA_ANALISADO);
    throw erro;
  }
}

export async function listarImportacoesHistorico(empresaId: string, perfil: PerfilComEmpresa) {
  exigirEmpresa(perfil, empresaId);
  return listarImportacoesHistoricoRepository(empresaId);
}

const RESULTADOS: HistoricoResultado[] = [
  "correspondencia",
  "fornecedor_nao_encontrado",
  "produto_nao_encontrado",
  "ambiguidade",
  "invalido"
];

async function previaDosVinculos(importacaoId: string, empresaId: string, db?: ExecutorBanco) {
  const aplicaveis = await itensAplicaveisHistoricoRepository(importacaoId, db);
  const itens: ItemAplicavel[] = aplicaveis.map((item) => ({
    numeroLinha: item.numeroLinha,
    fornecedorId: item.fornecedorId,
    produtoId: item.produtoId,
    dataCompra: item.dataCompra,
    custoUnitario: item.custoUnitario,
    fornecedorInformado: item.fornecedorInformado,
    produtoInformado: item.produtoInformado
  }));
  const fornecedorIds = [...new Set(itens.flatMap((item) => (item.fornecedorId ? [item.fornecedorId] : [])))];
  const produtoIds = [...new Set(itens.flatMap((item) => (item.produtoId ? [item.produtoId] : [])))];
  const existentes = await vinculosDoCatalogoHistoricoRepository(empresaId, fornecedorIds, produtoIds, db);
  return { aplicaveis, plano: planejarVinculos(itens, existentes) };
}

export async function detalharImportacaoHistorico(
  id: string,
  empresaId: string,
  perfil: PerfilComEmpresa
): Promise<HistoricoImportacaoDetalheDto> {
  exigirEmpresa(perfil, empresaId);
  const importacao = await buscarImportacaoHistoricoRepository(id, empresaId);
  if (!importacao) throw naoEncontrado("Importacao nao encontrada", "PURCHASE_HISTORY_IMPORT_NOT_FOUND");
  const [contagens, fornecedoresPendentes, produtosPendentes, linhasPendentes, { plano }] = await Promise.all([
    contarPorResultadoHistoricoRepository(id),
    fornecedoresPendentesHistoricoRepository(id),
    produtosPendentesHistoricoRepository(id),
    linhasPendentesHistoricoRepository(id),
    previaDosVinculos(id, empresaId)
  ]);
  const porResultado = Object.fromEntries(RESULTADOS.map((resultado) => [resultado, 0])) as Record<
    HistoricoResultado,
    number
  >;
  for (const contagem of contagens) porResultado[contagem.resultado] = contagem.linhas;
  return {
    ...importacao,
    criadoEm: importacao.criadoEm.toISOString(),
    aplicadoEm: importacao.aplicadoEm ? importacao.aplicadoEm.toISOString() : null,
    porResultado,
    fornecedoresPendentesTruncado: fornecedoresPendentes.length > LIMITE_PENDENCIAS_HISTORICO,
    produtosPendentesTruncado: produtosPendentes.length > LIMITE_PENDENCIAS_HISTORICO,
    fornecedoresPendentes: fornecedoresPendentes.slice(0, LIMITE_PENDENCIAS_HISTORICO).map((linha) => ({
      fornecedorNormalizado: linha.fornecedorNormalizado,
      fornecedorInformado: linha.fornecedorInformado ?? linha.fornecedorNormalizado,
      linhas: linha.linhas
    })),
    produtosPendentes: produtosPendentes.slice(0, LIMITE_PENDENCIAS_HISTORICO).map((linha) => ({
      produtoNormalizado: linha.produtoNormalizado,
      produtoInformado: linha.produtoInformado ?? linha.produtoNormalizado,
      linhas: linha.linhas
    })),
    linhasPendentes,
    previa: {
      criar: plano.criar.length,
      aprovar: plano.aprovarIds.length,
      jaAprovados: plano.jaAprovados,
      rejeitadosIgnorados: plano.rejeitadosIgnorados,
      amostraCriar: plano.criar.slice(0, 10).map((vinculo) => ({
        fornecedor: vinculo.fornecedor,
        produto: vinculo.produto,
        ultimoCusto: vinculo.precoOfertado
      }))
    }
  };
}

type Transacao = Parameters<Parameters<typeof executarEmTransacao>[0]>[0];

/** Refaz o pareamento do que ficou pendente. Linha invalida nao entra: cadastro novo nao a conserta. */
async function reparearNaTransacao(importacaoId: string, empresaId: string, tx: Transacao) {
  const [pendentes, indices] = await Promise.all([
    itensReparaveisHistoricoRepository(importacaoId, tx),
    carregarIndices(empresaId, tx)
  ]);
  const grupos = new Map<
    string,
    {
      ids: string[];
      fornecedorId: string | null;
      produtoId: string | null;
      resultado: HistoricoResultado;
      detalhe: string | null;
    }
  >();
  for (const item of pendentes) {
    const pareamento = parearLinhaHistorico(item.fornecedorNormalizado, item.produtoNormalizado, indices);
    const chave = `${pareamento.resultado}|${pareamento.fornecedorId}|${pareamento.produtoId}|${pareamento.detalhe}`;
    const grupo = grupos.get(chave);
    if (grupo) grupo.ids.push(item.id);
    else grupos.set(chave, { ids: [item.id], ...pareamento });
  }
  await atualizarPareamentoHistoricoRepository([...grupos.values()], tx);
  await atualizarTotaisPareamentoHistoricoRepository(importacaoId, tx);
}

async function exigirImportacaoAberta(id: string, empresaId: string, tx: Transacao) {
  const importacao = await travarImportacaoHistoricoRepository(id, empresaId, tx);
  if (!importacao) throw naoEncontrado("Importacao nao encontrada", "PURCHASE_HISTORY_IMPORT_NOT_FOUND");
  if (importacao.status === "cancelada") throw conflito("Importacao cancelada", "PURCHASE_HISTORY_IMPORT_CANCELLED");
  return importacao;
}

export async function reparearHistorico(id: string, empresaId: string, perfil: PerfilComEmpresa) {
  exigirEmpresa(perfil, empresaId);
  await executarEmTransacao(async (tx) => {
    await exigirImportacaoAberta(id, empresaId, tx);
    await reparearNaTransacao(id, empresaId, tx);
  });
}

export async function associarFornecedorHistorico(
  id: string,
  dados: { empresaId: string; fornecedorNormalizado: string; fornecedorId: string },
  perfil: PerfilComEmpresa,
  usuarioId: string
) {
  exigirEmpresa(perfil, dados.empresaId);
  await executarEmTransacao(async (tx) => {
    await exigirImportacaoAberta(id, dados.empresaId, tx);
    if (!(await validarFornecedorHistoricoRepository(dados.empresaId, dados.fornecedorId, tx)))
      throw naoEncontrado("Fornecedor nao encontrado", "SUPPLIER_NOT_FOUND");
    await gravarApelido(dados.empresaId, dados.fornecedorNormalizado, dados.fornecedorId, usuarioId, tx);
    await reparearNaTransacao(id, dados.empresaId, tx);
  });
}

export async function cadastrarFornecedorHistorico(
  id: string,
  dados: { empresaId: string; fornecedorNormalizado: string; nome?: string | undefined },
  perfil: PerfilComEmpresa,
  usuarioId: string
) {
  exigirEmpresa(perfil, dados.empresaId);
  await executarEmTransacao(async (tx) => {
    await exigirImportacaoAberta(id, dados.empresaId, tx);
    if (await aliasExistenteHistoricoRepository(dados.empresaId, dados.fornecedorNormalizado, tx))
      throw conflito("Este nome ja esta associado a um fornecedor", "SUPPLIER_ALIAS_ALREADY_EXISTS");
    const informado = await nomeInformadoDoFornecedorHistoricoRepository(id, dados.fornecedorNormalizado, tx);
    const nome = (dados.nome ?? informado ?? "").trim();
    if (nome.length < 2)
      throw naoEncontrado("Nome do fornecedor nao encontrado na importacao", "SUPPLIER_NAME_NOT_FOUND");
    const criado = await criarFornecedorHistoricoRepository({ empresaId: dados.empresaId, nome }, tx);
    await gravarApelido(dados.empresaId, dados.fornecedorNormalizado, criado.id, usuarioId, tx);
    await reparearNaTransacao(id, dados.empresaId, tx);
  });
}

async function gravarApelido(
  empresaId: string,
  aliasNormalizado: string,
  fornecedorId: string,
  usuarioId: string,
  tx: Transacao
) {
  const existente = await aliasExistenteHistoricoRepository(empresaId, aliasNormalizado, tx);
  if (existente && existente.fornecedorId === fornecedorId) return;
  if (existente) throw conflito("Este nome ja esta associado a outro fornecedor", "SUPPLIER_ALIAS_ALREADY_EXISTS");
  await inserirAliasHistoricoRepository({ empresaId, fornecedorId, aliasNormalizado, usuarioId }, tx);
}

export async function cancelarImportacaoHistorico(id: string, empresaId: string, perfil: PerfilComEmpresa) {
  exigirEmpresa(perfil, empresaId);
  await executarEmTransacao(async (tx) => {
    const importacao = await exigirImportacaoAberta(id, empresaId, tx);
    // Aplicada e a procedencia de linhas do historico: nao se cancela.
    if (importacao.status === "aplicada")
      throw conflito("Importacao ja aplicada nao pode ser cancelada", "PURCHASE_HISTORY_IMPORT_ALREADY_APPLIED");
    await cancelarImportacaoHistoricoRepository(id, tx);
  });
}

export async function aplicarHistorico(
  id: string,
  empresaId: string,
  perfil: PerfilComEmpresa,
  usuarioId: string
): Promise<HistoricoAplicacaoDto> {
  exigirEmpresa(perfil, empresaId);
  return executarEmTransacao(async (tx) => {
    await exigirImportacaoAberta(id, empresaId, tx);
    const { aplicaveis, plano } = await previaDosVinculos(id, empresaId, tx);

    const historico = aplicaveis.flatMap((item) =>
      item.fornecedorId && item.produtoId && item.dataCompra && item.quantidade && item.custoUnitario
        ? [
            {
              id: item.id,
              fornecedorId: item.fornecedorId,
              produtoId: item.produtoId,
              dataCompra: item.dataCompra,
              quantidade: item.quantidade,
              custoUnitario: item.custoUnitario,
              documento: item.documento
            }
          ]
        : []
    );
    const aplicadas = await inserirHistoricoPrecosRepository({ empresaId, usuarioId, itens: historico }, tx);
    const vinculosCriados = await criarVinculosHistoricoRepository(
      { empresaId, usuarioId, observacao: OBSERVACAO_VINCULO, vinculos: plano.criar },
      tx
    );
    const vinculosAprovados = await aprovarVinculosPendentesHistoricoRepository(
      { empresaId, usuarioId, ids: plano.aprovarIds, observacao: OBSERVACAO_VINCULO },
      tx
    );
    await atualizarTotaisImportacaoHistoricoRepository(
      { id, totalAplicadas: await totalAplicadasHistoricoRepository(id, tx), usuarioId },
      tx
    );
    const importacao = await buscarImportacaoHistoricoRepository(id, empresaId, tx);
    return {
      aplicadas,
      pendentes: importacao?.totalPendentes ?? 0,
      vinculosCriados,
      vinculosAprovados,
      vinculosRejeitadosIgnorados: plano.rejeitadosIgnorados
    };
  });
}

// --- consulta ------------------------------------------------------------------------------------

/** `AAAA-MM-DD` de hoje em America/Sao_Paulo menos N meses (a data do dia de negocio da padaria). */
export function inicioDaJanela(meses: number, agora: Date = new Date()): string {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
  const [ano, mes, dia] = hoje.split("-").map(Number) as [number, number, number];
  const alvo = new Date(Date.UTC(ano, mes - 1 - meses, 1));
  // Dia 31 menos 1 mes nao existe: cai no ultimo dia do mes de destino, nunca "transborda".
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(dia, ultimoDia));
  return alvo.toISOString().slice(0, 10);
}

export async function resumoHistorico(
  filtro: {
    empresaId: string;
    meses: number;
    produtoId?: string | undefined;
    fornecedorId?: string | undefined;
    busca?: string | undefined;
    limite: number;
  },
  perfil: PerfilComEmpresa
): Promise<HistoricoResumoDto> {
  exigirEmpresa(perfil, filtro.empresaId);
  const desde = inicioDaJanela(filtro.meses);
  const base = { empresaId: filtro.empresaId, desde, produtoId: filtro.produtoId, fornecedorId: filtro.fornecedorId };
  const [agregados, ultimos] = await Promise.all([
    resumoHistoricoRepository({ ...base, busca: filtro.busca }),
    ultimosCustosHistoricoRepository(base)
  ]);
  const ultimoPorPar = new Map(
    ultimos.map((linha) => [`${linha.fornecedorId}|${linha.produtoId}`, linha.custoUnitario])
  );
  return {
    meses: filtro.meses,
    total: agregados.length,
    linhas: agregados.slice(0, filtro.limite).map((linha) => ({
      fornecedorId: linha.fornecedorId,
      fornecedorNome: linha.fornecedorNome,
      produtoId: linha.produtoId,
      produtoDescricao: linha.produtoDescricao,
      ultimaCompraEm: linha.ultimaCompraEm ?? "",
      ultimoCusto: ultimoPorPar.get(`${linha.fornecedorId}|${linha.produtoId}`) ?? linha.menorCusto ?? "0",
      menorCusto: linha.menorCusto ?? "0",
      maiorCusto: linha.maiorCusto ?? "0",
      compras: linha.compras,
      quantidadeTotal: linha.quantidadeTotal ?? "0"
    }))
  };
}
