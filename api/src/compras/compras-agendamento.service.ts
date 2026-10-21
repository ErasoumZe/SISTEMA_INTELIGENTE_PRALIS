import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import {
  MESES_BOLINHAS,
  PROXIMAS_DATAS_AGENDAMENTO,
  datasDoAgendamento,
  instanteLocal,
  localDoInstante,
  resumoRecorrencia,
  topoDoRanking,
  type AgendamentoDto,
  type AgendamentoOcorrenciaDto,
  type AgendamentoPayload,
  type EditarAgendamentoPayload,
  type EnviarOcorrenciaPayload,
  type EnvioOcorrenciaDto,
  type OcorrenciaParaConferirDto,
  type ProdutosAgendamentoDto,
  type RegraRecorrencia,
  type TerminoRecorrencia
} from "@padaria/shared/compras";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { executarEmTransacao } from "../banco/conexao.js";
import { conflito, erroValidacao, naoEncontrado, naoProcessavel, proibido } from "../erros.js";
import { buscarEmpresaComprasRepository } from "./compras-rodadas.repository.js";
import { listarEstoqueProdutosRepository } from "./compras.repository.js";
import { abrirRodada } from "./compras-rodadas.service.js";
import { atualizarSolicitacao, obterSolicitacao } from "./compras-solicitacoes.service.js";
import {
  atualizarAgendaRepository,
  buscarAgendaRepository,
  buscarOcorrenciaRepository,
  cancelarSolicitacaoDoAgendamentoRepository,
  compradoPorCustoRepository,
  criarAgendaRepository,
  encerrarAgendaNaDataRepository,
  encerrarAgendaRepository,
  fornecedoresDoCatalogoRepository,
  gruposDaEmpresaRepository,
  itensDaSolicitacaoRepository,
  listarAgendasRepository,
  margensDosProdutosRepository,
  ocorrenciaPorPrevistoRepository,
  ocorrenciasDasAgendasRepository,
  ocorrenciasParaConferirRepository,
  produtosDaEmpresaRepository,
  produtosDasAgendasRepository,
  quantidadeVendidaRepository,
  registrarOcorrenciaRepository,
  responsavelDaEmpresaRepository,
  travarAgendaRepository,
  validarGrupoAgendaRepository,
  type AgendaEntrada
} from "./compras-agendamento.repository.js";

// Agendamento de pedido (PROJECT_BRAIN/56). As datas futuras sao CALCULADAS pela regra; a linha de
// ocorrencia so existe quando a data acontece, e cancelada ou movida.

const FUSO_PADRAO = "America/Sao_Paulo";
// Ate quando a lista calcula "proximas datas" (o suficiente para 6 datas de qualquer regra mensal).
const HORIZONTE_DIAS = 3 * 366;

function validarEmpresa(perfil: PerfilUsuario, empresaId: string) {
  if (!podeAcessarEmpresa(perfil, empresaId)) throw proibido("Empresa nao permitida", "FORBIDDEN_COMPANY");
}

function somarDias(iso: string, dias: number): string {
  const [ano, mes, dia] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(ano, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

export function terminoDaLinha(linha: {
  terminoTipo: "nunca" | "data" | "quantidade";
  terminoEm: string | null;
  terminoQuantidade: number | null;
}): TerminoRecorrencia {
  if (linha.terminoTipo === "data") return { tipo: "data", data: linha.terminoEm! };
  if (linha.terminoTipo === "quantidade") return { tipo: "quantidade", quantidade: linha.terminoQuantidade! };
  return { tipo: "nunca" };
}

function colunasDoTermino(termino: TerminoRecorrencia) {
  return {
    terminoTipo: termino.tipo,
    terminoEm: termino.tipo === "data" ? termino.data : null,
    terminoQuantidade: termino.tipo === "quantidade" ? termino.quantidade : null
  };
}

/** Instantes da serie (data local + hora no fuso), do inicio ate `ateIso`. */
export function instantesDaSerie(
  serie: { inicioEm: Date; fusoHorario: string; regra: RegraRecorrencia; termino: TerminoRecorrencia },
  ateIso: string
): Date[] {
  const inicio = localDoInstante(serie.inicioEm, serie.fusoHorario);
  return datasDoAgendamento(serie.regra, inicio.data, serie.termino, ateIso, 100_000).map((data) =>
    instanteLocal(data, inicio.hora, serie.fusoHorario)
  );
}

async function validarPayload(payload: AgendamentoPayload, perfil: PerfilUsuario) {
  validarEmpresa(perfil, payload.empresaId);
  if (!(await validarGrupoAgendaRepository(payload.empresaId, payload.grupoMercadoriaId)))
    throw erroValidacao("Grupo nao pertence a empresa", "INVALID_GROUP");
  const ids = payload.produtos.map((produto) => produto.produtoId);
  if ((await produtosDaEmpresaRepository(payload.empresaId, ids)).length !== ids.length)
    throw erroValidacao("Produto nao pertence a empresa", "INVALID_PRODUCT");
  const responsavelId = payload.responsavelId ?? perfil.usuarioId;
  if (responsavelId !== perfil.usuarioId && !(await responsavelDaEmpresaRepository(payload.empresaId, responsavelId)))
    throw erroValidacao("Responsavel nao pertence a empresa", "INVALID_RESPONSIBLE");
  if (payload.termino.tipo === "data" && payload.termino.data < payload.inicioData)
    throw erroValidacao("O termino nao pode ser antes do inicio", "INVALID_END");
  if (payload.regra.tipo === "datas" && payload.regra.datas.some((data) => data <= payload.inicioData))
    throw erroValidacao("As datas avulsas vem depois da data de inicio", "INVALID_DATES");
  const empresa = await buscarEmpresaComprasRepository(payload.empresaId);
  const fusoHorario = empresa?.fusoHorario ?? FUSO_PADRAO;
  const inicioEm = instanteLocal(payload.inicioData, payload.inicioHora, fusoHorario);
  const entrada: AgendaEntrada = {
    empresaId: payload.empresaId,
    grupoMercadoriaId: payload.grupoMercadoriaId,
    responsavelId,
    inicioEm,
    fusoHorario,
    regra: payload.regra,
    ...colunasDoTermino(payload.termino),
    prazoRespostaHoras: payload.prazoRespostaHoras,
    produtos: payload.produtos.map((produto) => ({
      produtoId: produto.produtoId,
      quantidadePadrao: produto.quantidadePadrao ?? null
    }))
  };
  return entrada;
}

export async function criarAgendamento(payload: AgendamentoPayload, perfil: PerfilUsuario) {
  const entrada = await validarPayload(payload, perfil);
  // A primeira data nao pode ser no passado: o agendador a disparia na hora, como se fosse atraso.
  if (entrada.inicioEm.getTime() < Date.now() - 60_000)
    throw erroValidacao("A data e hora de inicio ja passaram", "START_IN_THE_PAST");
  return executarEmTransacao((tx) =>
    criarAgendaRepository({ ...entrada, criadoPor: perfil.usuarioId, serieAnteriorId: null }, tx)
  );
}

/**
 * Editar como no iPhone. Sem `aPartirDe` (ou antes de qualquer data acontecer): a serie inteira. Com
 * `aPartirDe` depois de datas que ja aconteceram: "esta e as futuras" — a serie antiga termina no dia
 * anterior e nasce outra, ligada a ela. O passado nunca e reescrito (doc 52).
 */
export async function editarAgendamento(id: string, payload: EditarAgendamentoPayload, perfil: PerfilUsuario) {
  const entrada = await validarPayload(payload, perfil);
  return executarEmTransacao(async (tx) => {
    const agenda = await travarAgendaRepository(id, payload.empresaId, tx);
    if (!agenda) throw naoEncontrado("Agendamento nao encontrado");
    if (agenda.status !== "ativa") throw conflito("Agendamento encerrado", "SCHEDULE_CLOSED");
    const aconteceram = (await ocorrenciasDasAgendasRepository([id], tx)).filter(
      (ocorrencia) => ocorrencia.situacao === "aguardando_conferencia" || ocorrencia.situacao === "enviada"
    );
    if (!aconteceram.length) {
      await atualizarAgendaRepository(id, entrada, tx);
      return { id };
    }
    const aPartirDe = payload.aPartirDe ?? payload.inicioData;
    if (aPartirDe < payload.inicioData)
      throw erroValidacao("A nova serie comeca na data escolhida", "INVALID_SPLIT_DATE");
    await encerrarAgendaNaDataRepository(id, somarDias(aPartirDe, -1), tx);
    return criarAgendaRepository({ ...entrada, criadoPor: perfil.usuarioId, serieAnteriorId: id }, tx);
  });
}

/** "Excluir todas as futuras": a serie para; o que ja aconteceu fica. */
export async function encerrarAgendamento(id: string, empresaId: string, perfil: PerfilUsuario) {
  validarEmpresa(perfil, empresaId);
  await executarEmTransacao(async (tx) => {
    const agenda = await travarAgendaRepository(id, empresaId, tx);
    if (!agenda) throw naoEncontrado("Agendamento nao encontrado");
    if (agenda.status !== "ativa") throw conflito("Agendamento ja encerrado", "SCHEDULE_CLOSED");
    await encerrarAgendaRepository(id, tx);
  });
}

async function exigirDataDaSerie(id: string, empresaId: string, previstoPara: Date) {
  const agenda = await buscarAgendaRepository(id, empresaId);
  if (!agenda) throw naoEncontrado("Agendamento nao encontrado");
  const serie = { ...agenda, termino: terminoDaLinha(agenda) };
  const alvo = localDoInstante(previstoPara, agenda.fusoHorario).data;
  const existe = instantesDaSerie(serie, somarDias(alvo, 1)).some((data) => data.getTime() === previstoPara.getTime());
  if (!existe) throw naoEncontrado("Esta data nao faz parte do agendamento", "OCCURRENCE_NOT_FOUND");
  return agenda;
}

/** "Excluir so esta". Data que ja virou pedido para conferir: a solicitacao do dia tambem e cancelada. */
export async function cancelarOcorrencia(
  id: string,
  dados: { empresaId: string; previstoPara: string },
  perfil: PerfilUsuario
) {
  validarEmpresa(perfil, dados.empresaId);
  const previstoPara = new Date(dados.previstoPara);
  await exigirDataDaSerie(id, dados.empresaId, previstoPara);
  await executarEmTransacao(async (tx) => {
    if (!(await travarAgendaRepository(id, dados.empresaId, tx))) throw naoEncontrado("Agendamento nao encontrado");
    const atual = await ocorrenciaPorPrevistoRepository(id, previstoPara, tx);
    if (atual?.situacao === "enviada") throw conflito("Este pedido ja foi enviado", "OCCURRENCE_ALREADY_SENT");
    if (atual?.situacao === "cancelada") throw conflito("Esta data ja foi cancelada", "OCCURRENCE_ALREADY_CANCELLED");
    if (atual?.solicitacaoId) await cancelarSolicitacaoDoAgendamentoRepository(atual.solicitacaoId, tx);
    await registrarOcorrenciaRepository(
      {
        empresaId: dados.empresaId,
        agendaId: id,
        previstoPara,
        dataAtual: previstoPara,
        situacao: "cancelada",
        solicitacaoId: atual?.solicitacaoId ?? null,
        canceladaPor: perfil.usuarioId
      },
      tx
    );
  });
}

/** "Editar so esta": muda a data e hora de UMA ocorrencia que ainda nao aconteceu. */
export async function moverOcorrencia(
  id: string,
  dados: { empresaId: string; previstoPara: string; novaData: string; novaHora: string },
  perfil: PerfilUsuario
) {
  validarEmpresa(perfil, dados.empresaId);
  const previstoPara = new Date(dados.previstoPara);
  const agenda = await exigirDataDaSerie(id, dados.empresaId, previstoPara);
  const dataAtual = instanteLocal(dados.novaData, dados.novaHora, agenda.fusoHorario);
  if (dataAtual.getTime() < Date.now()) throw erroValidacao("A nova data ja passou", "DATE_IN_THE_PAST");
  await executarEmTransacao(async (tx) => {
    if (!(await travarAgendaRepository(id, dados.empresaId, tx))) throw naoEncontrado("Agendamento nao encontrado");
    const atual = await ocorrenciaPorPrevistoRepository(id, previstoPara, tx);
    if (atual && atual.situacao !== "agendada")
      throw conflito("So se move uma data que ainda nao aconteceu", "OCCURRENCE_ALREADY_HAPPENED");
    await registrarOcorrenciaRepository(
      {
        empresaId: dados.empresaId,
        agendaId: id,
        previstoPara,
        dataAtual,
        situacao: "agendada",
        solicitacaoId: null,
        canceladaPor: null
      },
      tx
    );
  });
}

export async function listarAgendamentos(empresaId: string, perfil: PerfilUsuario, agora = new Date()) {
  validarEmpresa(perfil, empresaId);
  const agendas = await listarAgendasRepository(empresaId);
  const ids = agendas.map((agenda) => agenda.id);
  const [produtos, ocorrencias] = await Promise.all([
    produtosDasAgendasRepository(ids),
    ocorrenciasDasAgendasRepository(ids)
  ]);
  return agendas.map((agenda): AgendamentoDto => {
    const termino = terminoDaLinha(agenda);
    const inicio = localDoInstante(agenda.inicioEm, agenda.fusoHorario);
    const hoje = localDoInstante(agora, agenda.fusoHorario).data;
    const registradas = new Map(
      ocorrencias
        .filter((ocorrencia) => ocorrencia.agendaId === agenda.id)
        .map((ocorrencia) => [ocorrencia.previstoPara.getTime(), ocorrencia])
    );
    const proximas: AgendamentoOcorrenciaDto[] = instantesDaSerie(
      { ...agenda, termino },
      somarDias(hoje, HORIZONTE_DIAS)
    )
      .map((previsto): AgendamentoOcorrenciaDto => {
        const registrada = registradas.get(previsto.getTime());
        return {
          previstoPara: previsto.toISOString(),
          dataAtual: (registrada?.dataAtual ?? previsto).toISOString(),
          situacao: registrada?.situacao ?? "prevista"
        };
      })
      .filter((ocorrencia) => ocorrencia.situacao !== "enviada" && new Date(ocorrencia.dataAtual) >= agora)
      .slice(0, PROXIMAS_DATAS_AGENDAMENTO);
    return {
      id: agenda.id,
      grupoMercadoriaId: agenda.grupoMercadoriaId,
      grupoNome: agenda.grupoNome,
      grupoPaiNome: agenda.grupoPaiNome,
      responsavelId: agenda.responsavelId,
      responsavelNome: agenda.responsavelNome,
      inicioData: inicio.data,
      inicioHora: inicio.hora,
      regra: agenda.regra,
      termino,
      resumo: resumoRecorrencia(agenda.regra, inicio.data, termino),
      prazoRespostaHoras: agenda.prazoRespostaHoras,
      status: agenda.status,
      produtos: produtos
        .filter((produto) => produto.agendaId === agenda.id)
        .map((produto) => ({
          produtoId: produto.produtoId,
          descricao: produto.descricao ?? "Produto",
          quantidadePadrao: produto.quantidadePadrao
        })),
      proximas
    };
  });
}

export async function listarParaConferir(empresaId: string, perfil: PerfilUsuario) {
  validarEmpresa(perfil, empresaId);
  const linhas = await ocorrenciasParaConferirRepository(empresaId);
  const contagens = await Promise.all(
    linhas.map((linha) =>
      linha.solicitacaoId ? itensDaSolicitacaoRepository(linha.solicitacaoId) : Promise.resolve([])
    )
  );
  return linhas.map(
    (linha, indice): OcorrenciaParaConferirDto => ({
      id: linha.id,
      agendaId: linha.agendaId,
      resumo: linha.grupoNome,
      grupoNome: linha.grupoNome,
      dataAtual: linha.dataAtual.toISOString(),
      solicitacaoId: linha.solicitacaoId!,
      prazoRespostaHoras: linha.prazoRespostaHoras,
      totalItens: contagens[indice]!.length
    })
  );
}

/** A conferencia: os produtos do agendamento + os da solicitacao, com os fornecedores do catalogo. */
export async function detalharEnvio(id: string, empresaId: string, perfil: PerfilUsuario): Promise<EnvioOcorrenciaDto> {
  validarEmpresa(perfil, empresaId);
  const ocorrencia = await buscarOcorrenciaRepository(id, empresaId);
  if (!ocorrencia || !ocorrencia.solicitacaoId) throw naoEncontrado("Pedido agendado nao encontrado");
  if (ocorrencia.situacao !== "aguardando_conferencia")
    throw conflito("Este pedido nao esta mais para conferir", "OCCURRENCE_NOT_PENDING");
  const [itensSolicitacao, produtosDaAgenda, estoque] = await Promise.all([
    itensDaSolicitacaoRepository(ocorrencia.solicitacaoId),
    produtosDasAgendasRepository([ocorrencia.agendaId]),
    listarEstoqueProdutosRepository({ empresaId })
  ]);
  const quantidadePorProduto = new Map(itensSolicitacao.map((item) => [item.produtoId, item.quantidade]));
  const produtoIds = [
    ...new Set([...produtosDaAgenda.map((produto) => produto.produtoId), ...quantidadePorProduto.keys()])
  ];
  const fornecedores = await fornecedoresDoCatalogoRepository(empresaId, produtoIds);
  const estoquePorId = new Map(estoque.map((produto) => [produto.id, produto]));
  return {
    ocorrenciaId: ocorrencia.id,
    solicitacaoId: ocorrencia.solicitacaoId,
    prazoRespostaHoras: ocorrencia.prazoRespostaHoras,
    itens: produtoIds.map((produtoId) => {
      const produto = estoquePorId.get(produtoId);
      return {
        produtoId,
        descricao: produto?.descricao ?? "Produto",
        quantidade: quantidadePorProduto.get(produtoId) ?? "",
        estoqueAtual: produto?.quantidadeEstoque ?? null,
        estoqueMax: produto?.estoqueMax ?? null,
        fornecedores: fornecedores
          .filter((fornecedor) => fornecedor.produtoId === produtoId)
          .map((fornecedor) => ({
            fornecedorId: fornecedor.fornecedorId,
            nome: fornecedor.nome,
            whatsapp: fornecedor.whatsapp,
            situacao: fornecedor.situacao,
            precoOfertado: fornecedor.precoOfertado
          }))
      };
    })
  };
}

/**
 * Envio da conferencia: grava as quantidades finais na solicitacao e abre a rodada com cada fornecedor
 * recebendo SO os seus produtos. A ocorrencia vira "enviada" dentro da mesma transacao da rodada
 * (compras-rodadas.service). Devolve a rodada com os links para o WhatsApp.
 */
export async function enviarOcorrencia(id: string, payload: EnviarOcorrenciaPayload, perfil: PerfilUsuario) {
  validarEmpresa(perfil, payload.empresaId);
  const ocorrencia = await buscarOcorrenciaRepository(id, payload.empresaId);
  if (!ocorrencia || !ocorrencia.solicitacaoId) throw naoEncontrado("Pedido agendado nao encontrado");
  if (ocorrencia.situacao !== "aguardando_conferencia")
    throw conflito("Este pedido nao esta mais para conferir", "OCCURRENCE_NOT_PENDING");
  const produtosDosItens = new Set(payload.itens.map((item) => item.produtoId));
  for (const convite of payload.convites)
    for (const produtoId of convite.produtoIds)
      if (!produtosDosItens.has(produtoId))
        throw erroValidacao("Fornecedor com produto que nao esta no pedido", "PRODUCT_NOT_IN_ORDER");
  const semFornecedor = [...produtosDosItens].filter(
    (produtoId) => !payload.convites.some((convite) => convite.produtoIds.includes(produtoId))
  );
  if (semFornecedor.length)
    throw naoProcessavel("Escolha um fornecedor para cada produto", "PRODUCT_WITHOUT_SUPPLIER", semFornecedor);

  await atualizarSolicitacao(
    ocorrencia.solicitacaoId,
    { empresaId: payload.empresaId, observacao: null, itens: payload.itens },
    perfil
  );
  const solicitacao = await obterSolicitacao(ocorrencia.solicitacaoId, perfil);
  const itemPorProduto = new Map((solicitacao.itens ?? []).map((item) => [item.produtoId, item.id]));
  return abrirRodada(
    {
      empresaId: payload.empresaId,
      solicitacaoId: ocorrencia.solicitacaoId,
      prazoRespostaHoras: ocorrencia.prazoRespostaHoras,
      tetoValor: null,
      convites: payload.convites.map((convite) => ({
        fornecedorId: convite.fornecedorId,
        solicitacaoItemIds: convite.produtoIds.map((produtoId) => itemPorProduto.get(produtoId)!)
      }))
    },
    perfil
  );
}

// --- lista de produtos com as bolinhas -----------------------------------------------------------

export async function listarProdutosDoAgendamento(
  empresaId: string,
  perfil: PerfilUsuario,
  agora = new Date()
): Promise<ProdutosAgendamentoDto> {
  validarEmpresa(perfil, empresaId);
  const hoje = localDoInstante(agora, FUSO_PADRAO).data;
  const [ano, mes, dia] = hoje.split("-").map(Number) as [number, number, number];
  const desde = new Date(Date.UTC(ano, mes - 1 - MESES_BOLINHAS, dia)).toISOString().slice(0, 10);
  const [estoque, grupos, vendidos, comprados, margens] = await Promise.all([
    listarEstoqueProdutosRepository({ empresaId }),
    gruposDaEmpresaRepository(empresaId),
    quantidadeVendidaRepository(empresaId, desde),
    compradoPorCustoRepository(empresaId, desde),
    margensDosProdutosRepository(empresaId)
  ]);
  const vendido = new Map(vendidos.map((linha) => [linha.produtoId!, Number(linha.quantidade ?? 0)]));
  const gasto = new Map<string, number>();
  for (const linha of comprados)
    gasto.set(
      linha.produtoId,
      (gasto.get(linha.produtoId) ?? 0) + Number(linha.quantidade ?? 0) * Number(linha.custoUnitario)
    );
  const lucro = new Map<string, number>();
  for (const produto of margens) {
    if (produto.custo === null || produto.precoVenda === null) continue;
    lucro.set(produto.id, (Number(produto.precoVenda) - Number(produto.custo)) * (vendido.get(produto.id) ?? 0));
  }
  const [maisVende, maisCompra, maisLucro] = [topoDoRanking(vendido), topoDoRanking(gasto), topoDoRanking(lucro)];
  return {
    produtos: estoque.map((produto) => ({
      ...produto,
      maisVende: maisVende.has(produto.id),
      maisCompra: maisCompra.has(produto.id),
      maisLucro: maisLucro.has(produto.id)
    })),
    grupos
  };
}
