import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import {
  PROXIMAS_DATAS_AGENDAMENTO,
  instanteLocal,
  localDoInstante,
  resumoRecorrencia,
  type ConferenciaAgendaDto,
  type ConferenciaAgendaPayload,
  type ConferenciaDetalheDto,
  type ConferenciaResumoDto,
  type ContagemConferenciaPayload,
  type OpcoesConferenciaDto,
  type ResponsavelConferenciaDto,
  type TerminoRecorrencia
} from "@padaria/shared/compras";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { usuariosComPermissao } from "./compras-responsaveis.service.js";
import { executarEmTransacao } from "../banco/conexao.js";
import { conflito, erroValidacao, naoEncontrado, naoProcessavel, proibido } from "../erros.js";
import { gruposDaEmpresaRepository, validarGrupoAgendaRepository } from "./compras-agendamento.repository.js";
import { listarEstoqueProdutosRepository } from "./compras.repository.js";
import { instantesDaSerie, terminoDaLinha } from "./compras-agendamento.service.js";
import { buscarEmpresaComprasRepository } from "./compras-rodadas.repository.js";
import {
  atualizarAgendaConferenciaRepository,
  buscarConferenciaRepository,
  concluirConferenciaRepository,
  contagensRepository,
  criarAgendaConferenciaRepository,
  datasJaCriadasRepository,
  encerrarAgendaConferenciaRepository,
  itensDaConferenciaRepository,
  listarAgendasConferenciaRepository,
  listarConferenciasRepository,
  registrarContagemRepository,
  travarAgendaConferenciaRepository,
  travarConferenciaRepository,
  type AgendaConferenciaEntrada
} from "./conferencias-estoque.repository.js";

// Conferencia de estoque agendada (doc 57 §1). Contar SO REGISTRA (decisao de 22/10): nenhum saldo muda.

const FUSO_PADRAO = "America/Sao_Paulo";
const HORIZONTE_DIAS = 3 * 366;
const PERMISSAO_CONTAR = "conferencias_estoque_visualizar";

function validarEmpresa(perfil: PerfilUsuario, empresaId: string) {
  if (!podeAcessarEmpresa(perfil, empresaId)) throw proibido("Empresa nao permitida", "FORBIDDEN_COMPANY");
}

function somarDias(iso: string, dias: number): string {
  const [ano, mes, dia] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(ano, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

function colunasDoTermino(termino: TerminoRecorrencia) {
  return {
    terminoTipo: termino.tipo,
    terminoEm: termino.tipo === "data" ? termino.data : null,
    terminoQuantidade: termino.tipo === "quantidade" ? termino.quantidade : null
  };
}

/** Quem pode receber a conferencia: trabalha na empresa e ve a tela de conferencias. */
export async function listarResponsaveisConferencia(
  empresaId: string,
  perfil: PerfilUsuario
): Promise<ResponsavelConferenciaDto[]> {
  validarEmpresa(perfil, empresaId);
  return usuariosComPermissao(empresaId, PERMISSAO_CONTAR);
}

export async function opcoesConferencia(empresaId: string, perfil: PerfilUsuario): Promise<OpcoesConferenciaDto> {
  const [grupos, produtos, responsaveis] = await Promise.all([
    gruposDaEmpresaRepository(empresaId),
    listarEstoqueProdutosRepository({ empresaId }),
    listarResponsaveisConferencia(empresaId, perfil)
  ]);
  const unicos = (valores: Array<string | null>) =>
    [...new Set(valores.filter((valor): valor is string => Boolean(valor)))].sort((a, b) => a.localeCompare(b));
  return {
    grupos,
    areas: unicos(produtos.map((produto) => produto.areaEstoque)),
    locaisEstoque: unicos(produtos.map((produto) => produto.localEstoque)),
    locaisVenda: unicos(produtos.flatMap((produto) => produto.localVenda)),
    responsaveis
  };
}

async function validarAgenda(
  payload: ConferenciaAgendaPayload,
  perfil: PerfilUsuario
): Promise<AgendaConferenciaEntrada> {
  validarEmpresa(perfil, payload.empresaId);
  if (payload.grupoMercadoriaId && !(await validarGrupoAgendaRepository(payload.empresaId, payload.grupoMercadoriaId)))
    throw erroValidacao("Grupo nao pertence a empresa", "INVALID_GROUP");
  const responsaveis = await listarResponsaveisConferencia(payload.empresaId, perfil);
  if (!responsaveis.some((usuario) => usuario.usuarioId === payload.responsavelId))
    throw erroValidacao("Este colaborador nao pode fazer conferencias", "INVALID_RESPONSIBLE");
  if (payload.termino.tipo === "data" && payload.termino.data < payload.inicioData)
    throw erroValidacao("O termino nao pode ser antes do inicio", "INVALID_END");
  const empresa = await buscarEmpresaComprasRepository(payload.empresaId);
  const fusoHorario = empresa?.fusoHorario ?? FUSO_PADRAO;
  return {
    empresaId: payload.empresaId,
    responsavelId: payload.responsavelId,
    grupoMercadoriaId: payload.grupoMercadoriaId ?? null,
    ranking: payload.ranking ?? null,
    areaEstoque: payload.areaEstoque || null,
    localEstoque: payload.localEstoque || null,
    localVenda: payload.localVenda || null,
    inicioEm: instanteLocal(payload.inicioData, payload.inicioHora, fusoHorario),
    fusoHorario,
    regra: payload.regra,
    ...colunasDoTermino(payload.termino),
    observacao: payload.observacao || null
  };
}

export async function criarAgendaConferencia(payload: ConferenciaAgendaPayload, perfil: PerfilUsuario) {
  const entrada = await validarAgenda(payload, perfil);
  if (entrada.inicioEm.getTime() < Date.now() - 60_000)
    throw erroValidacao("A data e hora de inicio ja passaram", "START_IN_THE_PAST");
  return executarEmTransacao((tx) => criarAgendaConferenciaRepository({ ...entrada, criadoPor: perfil.usuarioId }, tx));
}

/** Editar vale para as proximas datas: a conferencia que ja nasceu fica como esta. */
export async function editarAgendaConferencia(id: string, payload: ConferenciaAgendaPayload, perfil: PerfilUsuario) {
  const entrada = await validarAgenda(payload, perfil);
  await executarEmTransacao(async (tx) => {
    const agenda = await travarAgendaConferenciaRepository(id, payload.empresaId, tx);
    if (!agenda) throw naoEncontrado("Agendamento nao encontrado");
    if (agenda.status !== "ativa") throw conflito("Agendamento encerrado", "SCHEDULE_CLOSED");
    await atualizarAgendaConferenciaRepository(id, entrada, tx);
  });
  return { id };
}

export async function encerrarAgendaConferencia(id: string, empresaId: string, perfil: PerfilUsuario) {
  validarEmpresa(perfil, empresaId);
  await executarEmTransacao(async (tx) => {
    const agenda = await travarAgendaConferenciaRepository(id, empresaId, tx);
    if (!agenda) throw naoEncontrado("Agendamento nao encontrado");
    if (agenda.status !== "ativa") throw conflito("Agendamento ja encerrado", "SCHEDULE_CLOSED");
    await encerrarAgendaConferenciaRepository(id, tx);
  });
}

export async function listarAgendasConferencia(
  empresaId: string,
  perfil: PerfilUsuario,
  agora = new Date()
): Promise<ConferenciaAgendaDto[]> {
  validarEmpresa(perfil, empresaId);
  const agendas = await listarAgendasConferenciaRepository(empresaId);
  const criadas = await Promise.all(agendas.map((agenda) => datasJaCriadasRepository(agenda.id)));
  return agendas.map((agenda, indice) => {
    const termino = terminoDaLinha(agenda);
    const inicio = localDoInstante(agenda.inicioEm, agenda.fusoHorario);
    const hoje = localDoInstante(agora, agenda.fusoHorario).data;
    const proximas = instantesDaSerie({ ...agenda, termino }, somarDias(hoje, HORIZONTE_DIAS))
      .filter((data) => data >= agora && !criadas[indice]!.has(data.getTime()))
      .slice(0, PROXIMAS_DATAS_AGENDAMENTO)
      .map((data) => data.toISOString());
    return {
      id: agenda.id,
      responsavelId: agenda.responsavelId,
      responsavelNome: agenda.responsavelNome,
      grupoMercadoriaId: agenda.grupoMercadoriaId,
      grupo: agenda.grupo,
      ranking: agenda.ranking,
      areaEstoque: agenda.areaEstoque,
      localEstoque: agenda.localEstoque,
      localVenda: agenda.localVenda,
      inicioData: inicio.data,
      inicioHora: inicio.hora,
      regra: agenda.regra,
      termino,
      resumo: resumoRecorrencia(agenda.regra, inicio.data, termino),
      observacao: agenda.observacao,
      proximas
    };
  });
}

type LinhaConferencia = NonNullable<Awaited<ReturnType<typeof buscarConferenciaRepository>>>;

function paraResumo(
  linha: LinhaConferencia,
  contagem: { total: number; contados: number } | undefined
): ConferenciaResumoDto {
  return {
    id: linha.id,
    agendaId: linha.agendaId,
    data: linha.data.toISOString(),
    status: linha.status as ConferenciaResumoDto["status"],
    responsavelId: linha.responsavelId,
    responsavelNome: linha.responsavelNome,
    grupoMercadoriaId: linha.grupoMercadoriaId,
    grupo: linha.grupo,
    ranking: linha.ranking,
    areaEstoque: linha.areaEstoque,
    localEstoque: linha.localEstoque,
    localVenda: linha.localVenda,
    totalItens: contagem?.total ?? 0,
    contados: contagem?.contados ?? 0,
    concluidaEm: linha.concluidaEm?.toISOString() ?? null,
    observacao: linha.observacao
  };
}

export async function listarConferencias(empresaId: string, perfil: PerfilUsuario): Promise<ConferenciaResumoDto[]> {
  validarEmpresa(perfil, empresaId);
  const linhas = await listarConferenciasRepository(empresaId);
  const contagens = await contagensRepository(linhas.map((linha) => linha.id));
  return linhas.map((linha) => paraResumo(linha, contagens.get(linha.id)));
}

export async function detalharConferencia(
  id: string,
  empresaId: string,
  perfil: PerfilUsuario
): Promise<ConferenciaDetalheDto> {
  validarEmpresa(perfil, empresaId);
  const linha = await buscarConferenciaRepository(id, empresaId);
  if (!linha) throw naoEncontrado("Conferencia nao encontrada");
  const [itens, contagens] = await Promise.all([itensDaConferenciaRepository(id), contagensRepository([id])]);
  return {
    ...paraResumo(linha, contagens.get(id)),
    itens: itens.map((item) => ({ ...item, descricao: item.descricao ?? "Produto" }))
  };
}

/** Quem conta: o responsavel da conferencia ou quem agenda conferencias. */
function exigirQuemConta(perfil: PerfilUsuario, responsavelId: string | null) {
  if (perfil.usuarioId === responsavelId || perfil.permissoes.includes("conferencias_estoque_agendar")) return;
  throw proibido("So o responsavel conta esta conferencia", "NOT_RESPONSIBLE");
}

export async function registrarContagem(id: string, payload: ContagemConferenciaPayload, perfil: PerfilUsuario) {
  validarEmpresa(perfil, payload.empresaId);
  await executarEmTransacao(async (tx) => {
    const conferencia = await travarConferenciaRepository(id, payload.empresaId, tx);
    if (!conferencia) throw naoEncontrado("Conferencia nao encontrada");
    exigirQuemConta(perfil, conferencia.responsavelId);
    if (conferencia.status !== "agendada") throw conflito("Esta conferencia ja foi concluida", "CONFERENCE_CLOSED");
    const alterados = await registrarContagemRepository(
      { conferenciaId: id, usuarioId: perfil.usuarioId, itens: payload.itens },
      tx
    );
    if (alterados !== payload.itens.length) throw erroValidacao("Item nao e desta conferencia", "ITEM_OUTSIDE");
  });
}

export async function concluirConferencia(id: string, empresaId: string, perfil: PerfilUsuario) {
  validarEmpresa(perfil, empresaId);
  await executarEmTransacao(async (tx) => {
    const conferencia = await travarConferenciaRepository(id, empresaId, tx);
    if (!conferencia) throw naoEncontrado("Conferencia nao encontrada");
    exigirQuemConta(perfil, conferencia.responsavelId);
    if (conferencia.status !== "agendada") throw conflito("Esta conferencia ja foi concluida", "CONFERENCE_CLOSED");
    const contagem = (await contagensRepository([id], tx)).get(id);
    if (contagem && contagem.contados < contagem.total)
      throw naoProcessavel(
        `Faltam ${contagem.total - contagem.contados} produto(s) para contar`,
        "CONFERENCE_INCOMPLETE"
      );
    await concluirConferenciaRepository(id, perfil.usuarioId, tx);
  });
}
