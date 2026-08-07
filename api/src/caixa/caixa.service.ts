import { randomBytes } from "node:crypto";
import { z } from "zod";
import type {
  AbrirCaixaPayload,
  AlterarHorarioCaixaPayload,
  AlterarHorarioCaixaResponse,
  CaixaAbertoResumo,
  CaixaOperacional,
  CaixaStatus,
  CancelarSolicitacaoCofrePayload,
  CategoriaLancamentosCaixa,
  DetalheCaixaResponse,
  EditarAberturaCaixaPayload,
  ExecutarSolicitacaoCofrePayload,
  FecharCaixaPayload,
  HistoricoCaixaQuery,
  LinhaHistoricoCaixa,
  ProgramarSolicitacaoCofrePayload,
  ResumoCaixa,
  SolicitacaoCofre,
  TotaisCaixaCentavos,
  TotaisHistoricoCaixa,
  TransferenciaCofrePayload,
  TransferenciasCaixaResponse
} from "@padaria/shared/caixa";
import { montarResumoCaixa, saldoCaixaCentavos, statusCaixaSchema } from "@padaria/shared/caixa";
import { diaNegocio } from "@padaria/shared/datas";
import type { DadosExternos, ResultadoPaginado } from "@padaria/shared/api";
import { temPermissao, type PerfilUsuario, type Permissao } from "@padaria/shared/autenticacao";
import { deCentavos, liquidoCentavos, paraCentavos } from "@padaria/shared/dinheiro";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { executarEmTransacao, type ExecutorBanco } from "../banco/conexao.js";
import { ErroDominio, erroValidacao, naoEncontrado } from "../erros.js";
import { hashTokenAutorizacao } from "./autorizacoes.service.js";
import {
  atualizarStatusAutorizacaoRepository,
  buscarAutorizacaoPorTokenRepository
} from "./autorizacoes.repository.js";
import {
  atualizarAberturaCaixaRepository,
  atualizarFechamentoCaixaRepository,
  atualizarHorarioCaixaRepository,
  buscarCaixaAbertoUsuarioRepository,
  buscarCaixaPorIdRepository,
  buscarColaboradorPorUsuarioRepository,
  buscarContaCofreEmpresaRepository,
  buscarMaquininhaEmpresaRepository,
  buscarTransferenciaPorLacreAberturaRepository,
  buscarPdvEmpresaRepository,
  buscarAjusteCaixaRepository,
  buscarPerfilUsuarioCaixaRepository,
  caixaTemLancamentosRepository,
  caixasComAjusteRepository,
  calcularTotaisCaixaOperacionalRepository,
  criarCaixaRepository,
  confirmarTransferenciaAberturaRepository,
  criarLacreRetornoRepository,
  criarQuebraCaixaRepository,
  criarTransferenciaCofreRepository,
  existeCaixaAbertoPdvRepository,
  existePeriodoCaixaRepository,
  listarEdicoesCaixaRepository,
  listarAlteracoesPosFechamentoRepository,
  listarHistoricoCaixaRepository,
  listarLancamentosCaixaRepository,
  caixasAlteradosPosFechamentoRepository,
  listarUsuariosTesourariaRepository,
  listarTransferenciasCaixaRepository,
  proximaOrdemTransferenciaRepository,
  registrarEdicaoCaixaRepository,
  revincularVendasAoCaixaRepository,
  totaisHistoricoCaixaRepository,
  travarCaixaRepository,
  buscarSolicitacaoCofreRepository,
  buscarTransferenciaPorIdempotenciaRepository,
  cancelarSolicitacaoCofreRepository,
  listarCaixasAbertosRepository,
  executarSolicitacaoCofreRepository,
  existeSolicitacaoAgendadaRepository,
  listarCandidatosConfirmacaoRepository,
  listarSolicitacoesCofreRepository,
  type FiltrosHistoricoCaixa,
  type IntencaoEntregaCofre
} from "./caixa.repository.js";
import { criarNotificacoesRepository } from "../notificacoes/notificacoes.repository.js";
import { existeNumeroLacreRepository } from "../lacres/lacres.repository.js";
import { podeLancarSemCaixa } from "@padaria/shared/autenticacao";
import { buscarPerfilUsuario } from "../auth/perfil.service.js";

const erroPeriodo = "A data e hora de abertura ja pertence a outro caixa aberto/fechado";
const indiceCaixaAbertoUnico = "fechamentos_caixa_pdv_aberto_unico_idx";

type CaixaLinha = NonNullable<Awaited<ReturnType<typeof buscarCaixaPorIdRepository>>>;

// Duas aberturas simultaneas do mesmo PDV podem passar pelos pre-checks; o indice unico
// parcial do banco decide o vencedor e o perdedor recebe o mesmo erro do caminho sequencial.
function ehViolacaoCaixaAbertoUnico(error: Error): boolean {
  const candidatos = [error, error.cause instanceof Error ? error.cause : null];
  return candidatos.some((atual) => {
    if (!atual) return false;
    const detalhes = atual as Error & { code?: string; constraint?: string };
    return detalhes.code === "23505" && detalhes.constraint === indiceCaixaAbertoUnico;
  });
}

function traduzirErroAberturaCaixa(error: Error): Error {
  return ehViolacaoCaixaAbertoUnico(error) ? new Error(erroPeriodo) : error;
}

function gerarTokenEdicao() {
  return randomBytes(6).toString("hex").toUpperCase();
}

function dataObrigatoria(valor: string, campo: string) {
  const valorNormalizado = valor.trim();
  const temFusoExplicito = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(valorNormalizado);
  const data = new Date(temFusoExplicito ? valorNormalizado : `${valorNormalizado}Z`);
  if (Number.isNaN(data.getTime())) throw new Error(`${campo} invalida`);
  return data;
}

function numero(valor: string | number | null | undefined) {
  return deCentavos(paraCentavos(valor));
}

function serializarData(data: Date | string | null) {
  return data ? new Date(data).toISOString() : null;
}

function serializarCaixa(caixa: CaixaLinha): CaixaOperacional {
  if (!caixa.pdvId || !caixa.usuarioId || !caixa.usuarioCaixaId || !caixa.dataHoraAbertura || !caixa.abertoEm) {
    throw new Error("Caixa operacional invalido");
  }
  return {
    id: caixa.id,
    empresaId: caixa.empresaId,
    pdvId: caixa.pdvId,
    pdvNome: caixa.pdvNome,
    pdvContaId: caixa.pdvContaId ?? null,
    usuarioId: caixa.usuarioId,
    usuarioCaixaId: caixa.usuarioCaixaId,
    usuarioCaixaNome: caixa.usuarioCaixaNome ?? "Usuario",
    colaboradorId: caixa.colaboradorId,
    dataMovimento: caixa.dataMovimento,
    dataHoraAbertura: serializarData(caixa.dataHoraAbertura) ?? "",
    abertoEm: serializarData(caixa.abertoEm) ?? "",
    dataHoraFechamento: serializarData(caixa.dataHoraFechamento),
    fechadoEm: serializarData(caixa.fechadoEm),
    tokenEdicao: caixa.tokenEdicao,
    turnoId: caixa.turnoId ?? null,
    maquininhaId: caixa.maquininhaId ?? null,
    maquininhaApelido: caixa.maquininhaApelido ?? null,
    maquininhaNumeroSerie: caixa.maquininhaNumeroSerie ?? null,
    observacao: caixa.observacao,
    status: caixa.status
  };
}

function podeOperarCaixa(perfil: PerfilUsuario, caixa: CaixaLinha) {
  return (
    temPermissao(perfil.permissoes, "caixas_gerenciar") ||
    caixa.usuarioId === perfil.usuarioId ||
    caixa.usuarioCaixaId === perfil.usuarioId
  );
}

async function calcularTotaisCaixaCentavos(caixa: CaixaLinha, db?: ExecutorBanco): Promise<TotaisCaixaCentavos> {
  if (!caixa.pdvContaId) throw new Error("PDV sem conta vinculada");
  return calcularTotaisCaixaOperacionalRepository(caixa.id, caixa.pdvContaId, db);
}

// Revincula as vendas integradas ORFAS ao caixa apos qualquer mudanca de horario (ou na abertura
// retroativa). Nunca move venda de outro caixa nem venda manual — ver revincularVendasAoCaixaRepository.
export async function revincularVendasAoCaixa(
  caixa: CaixaLinha,
  db: ExecutorBanco
): Promise<{ anexadas: number; desanexadas: number }> {
  if (!caixa.pdvId || !caixa.dataHoraAbertura) return { anexadas: 0, desanexadas: 0 };
  const abertura = new Date(caixa.dataHoraAbertura);
  const limiteSuperior = caixa.dataHoraFechamento ? new Date(caixa.dataHoraFechamento) : new Date();
  return revincularVendasAoCaixaRepository(
    { caixaId: caixa.id, empresaId: caixa.empresaId, pdvId: caixa.pdvId, abertura, limiteSuperior },
    db
  );
}

export async function calcularResumoCaixaOperacional(caixa: CaixaLinha, db?: ExecutorBanco): Promise<ResumoCaixa> {
  const totais = await calcularTotaisCaixaCentavos(caixa, db);
  // dividaCofre e legado da R8, revogada pela R-001: hoje e sempre 0 (ver 18 D-08).
  return montarResumoCaixa(totais, paraCentavos(caixa.dividaCofre));
}

export async function obterStatusCaixa(empresaId: string, perfil: PerfilUsuario): Promise<CaixaStatus> {
  if (!podeAcessarEmpresa(perfil, empresaId)) throw new Error("Empresa nao permitida");
  const caixa = await buscarCaixaAbertoUsuarioRepository(empresaId, perfil.usuarioId);
  if (!caixa) return { caixaAberto: null, resumo: null };
  return {
    caixaAberto: serializarCaixa(caixa),
    resumo: await calcularResumoCaixaOperacional(caixa)
  };
}

export interface EscopoListagemCaixa {
  bloquear: boolean;
  caixaId: string | undefined;
  // Dia CONTABIL do caixa aberto. So a tela de Entradas usa (D7): la o escopo e o DIA, nao o caixa
  // — ver resolverEscopoEntradasDoDia.
  dia?: string | undefined;
}

/**
 * Impoe, no servidor, o escopo "somente caixa aberto" das telas de movimentacao.
 * Se o perfil tem `menu_<tela>_somente_caixa_aberto`, a listagem fica presa ao caixa
 * aberto do usuario (ignorando qualquer caixaId pedido pelo cliente); sem caixa aberto,
 * nao retorna nada. Sem a flag, mantem o comportamento livre (filtro opcional por caixaId).
 */
export async function resolverEscopoListagemPorCaixa(
  perfil: PerfilUsuario | undefined,
  telaId: string,
  empresaId: string | undefined,
  caixaIdSolicitado: string | undefined
): Promise<EscopoListagemCaixa> {
  const flag = `menu_${telaId}_somente_caixa_aberto` as Permissao;
  const exigeCaixaAberto = Boolean(perfil) && temPermissao(perfil?.permissoes, flag);
  if (!exigeCaixaAberto) return { bloquear: false, caixaId: caixaIdSolicitado };
  if (!perfil || !empresaId) return { bloquear: true, caixaId: undefined };
  const caixa = await buscarCaixaAbertoUsuarioRepository(empresaId, perfil.usuarioId);
  if (!caixa) return { bloquear: true, caixaId: undefined };
  return { bloquear: false, caixaId: caixa.id };
}

/**
 * Escopo da tela de ENTRADAS (PROJECT_BRAIN/17, D7): "a tela lista TODAS as entradas do DIA".
 *
 * Difere do escopo das demais telas em UMA coisa, que e o ponto do D7: quem tem
 * `menu_entradas_somente_caixa_aberto` continua PRECISANDO de caixa aberto para ver a tela, mas o
 * que ela lista passa a ser o DIA do caixa — nao o caixa.
 *
 * O motivo e concreto: a venda integrada do CREARE so recebe caixa_id quando existe um caixa aberto
 * NAQUELE PDV no instante da venda (integracoes.service). A venda da madrugada, a de antes da
 * abertura e a de PDV sem caixa ficam com caixa_id NULL — e sob o filtro por caixa elas sumiam
 * justamente da tela do operador, que e quem precisa conferir o dia.
 */
export async function resolverEscopoEntradasDoDia(
  perfil: PerfilUsuario | undefined,
  empresaId: string | undefined,
  caixaIdSolicitado: string | undefined
): Promise<EscopoListagemCaixa> {
  const exigeCaixaAberto = Boolean(perfil) && temPermissao(perfil?.permissoes, "menu_entradas_somente_caixa_aberto");
  // Sem a flag (gestao/retaguarda): nada muda — segue livre, com filtro opcional por caixa e as
  // datas que a propria tela mandar. Prender a gestao ao dia tiraria o acesso ao historico.
  if (!exigeCaixaAberto) return { bloquear: false, caixaId: caixaIdSolicitado };
  if (!perfil || !empresaId) return { bloquear: true, caixaId: undefined };
  const caixa = await buscarCaixaAbertoUsuarioRepository(empresaId, perfil.usuarioId);
  if (!caixa) return { bloquear: true, caixaId: undefined };
  // dataMovimento e o dia CONTABIL do caixa (nao "hoje"): num caixa que virou a meia-noite, o dia
  // do operador continua sendo o da abertura.
  return { bloquear: false, caixaId: undefined, dia: caixa.dataMovimento };
}

export async function abrirCaixa(dados: AbrirCaixaPayload, perfil: PerfilUsuario): Promise<CaixaStatus> {
  if (!podeAcessarEmpresa(perfil, dados.empresaId)) throw new Error("Empresa nao permitida");
  const dataHoraAbertura = dataObrigatoria(dados.dataHoraAbertura, "Data de abertura");

  try {
    return await abrirCaixaEmTransacao(dados, perfil, dataHoraAbertura);
  } catch (error) {
    if (error instanceof Error) throw traduzirErroAberturaCaixa(error);
    throw error;
  }
}

// R-040: abrir o caixa informando o lacre E o ato de confirmar o recebimento da transferencia.
// Esta funcao so RESOLVE e valida (leitura) — a confirmacao atomica acontece depois, ja com o
// caixa criado, para que a disputa (R-030) seja decidida pelo banco e nao por leitura otimista.
type AberturaPorLacre = {
  transferenciaId: string;
  lacreId: string;
  numeroLacre: string;
  valorCentavos: number;
};

async function prepararAberturaPorLacre(
  empresaId: string,
  numeroLacre: string,
  contaCaixaId: string,
  usuarioId: string,
  tx: ExecutorBanco
): Promise<AberturaPorLacre> {
  const achado = await buscarTransferenciaPorLacreAberturaRepository(empresaId, numeroLacre, contaCaixaId, tx);
  // Motivos separados de proposito: "lacre inexistente" e "lacre ja rompido" mandam o operador para
  // acoes diferentes (redigitar x procurar a tesouraria).
  if (!achado) throw new Error("Lacre inexistente");
  if (achado.lacreRompido) throw new Error("Lacre já rompido — não pode ser reutilizado");
  if (achado.status === "agendada") throw new Error("Transferência agendada ainda não foi liberada");
  if (achado.status !== "pendente") throw new Error("Transferência deste lacre não está pendente de recebimento");
  // R-030: so um dos destinos CANDIDATOS pode reivindicar. Caixa fora da lista nao disputa.
  if (!achado.candidatoId) throw new Error("A conta deste caixa não é destino desta transferência");
  // R-028: quem envia nao confirma o proprio envio.
  if (achado.criadoPor === usuarioId) throw new Error("Quem enviou a transferência não pode confirmar o recebimento");
  if (achado.contaOrigemId === contaCaixaId) throw new Error("Conta de origem não pode ser a mesma do caixa");

  const valorCentavos = paraCentavos(achado.valorOriginal);
  return {
    transferenciaId: achado.transferenciaId,
    lacreId: achado.lacreId,
    numeroLacre,
    valorCentavos
  };
}

async function abrirCaixaEmTransacao(
  dados: AbrirCaixaPayload,
  perfil: PerfilUsuario,
  dataHoraAbertura: Date
): Promise<CaixaStatus> {
  return executarEmTransacao(async (tx) => {
    const pdv = await buscarPdvEmpresaRepository(dados.pdvId, dados.empresaId, tx);
    if (!pdv || !pdv.ativo) throw new Error("PDV nao encontrado");
    if (!pdv.contaId) throw new Error("PDV sem conta vinculada");
    const usuarioCaixa = await buscarPerfilUsuarioCaixaRepository(dados.usuarioCaixaId, tx);
    if (!usuarioCaixa) throw new Error("Usuario do caixa nao encontrado");
    const colaborador = await buscarColaboradorPorUsuarioRepository(dados.usuarioCaixaId, dados.empresaId, tx);
    if (!colaborador) throw new Error("Usuario do caixa precisa estar vinculado a colaborador da empresa");
    if (await existeCaixaAbertoPdvRepository(dados.pdvId, undefined, tx)) throw new Error(erroPeriodo);
    if (await existePeriodoCaixaRepository(dados.pdvId, dataHoraAbertura, undefined, tx)) throw new Error(erroPeriodo);
    if (dados.maquininhaId && !(await buscarMaquininhaEmpresaRepository(dados.maquininhaId, dados.empresaId, tx))) {
      throw new Error("Maquininha nao encontrada ou inativa");
    }

    // R-040: o lacre e opcional (R-033 — sem lacre o caixa abre zerado e o fundo chega depois).
    // Informado, ele identifica a transferencia pendente que este caixa vai reivindicar.
    const lacreInformado = dados.lacreAbertura?.trim() || null;
    const abertura = lacreInformado
      ? await prepararAberturaPorLacre(dados.empresaId, lacreInformado, pdv.contaId, perfil.usuarioId, tx)
      : null;

    const caixa = await criarCaixaRepository(
      {
        empresaId: dados.empresaId,
        pdvId: dados.pdvId,
        usuarioId: perfil.usuarioId,
        usuarioCaixaId: dados.usuarioCaixaId,
        colaboradorId: colaborador.id,
        dataHoraAbertura,
        tokenEdicao: gerarTokenEdicao(),
        // Turno da abertura: informado no ato ou, na ausencia, o turno padrao do colaborador.
        turnoId: dados.turnoId ?? colaborador.turnoPadraoId ?? null,
        observacao: dados.observacao?.trim() || null,
        lacreAbertura: abertura?.numeroLacre ?? null,
        maquininhaId: dados.maquininhaId ?? null
      },
      tx
    );

    // R-040 na MESMA transacao: vence a disputa (R-030), preenche data_recebimento/confirmado_por
    // (R-028), leva o dinheiro para ESTE caixa (R-036) e rompe o lacre (R-027). Perder a disputa
    // derruba a abertura inteira — nao existe caixa aberto com transferencia ainda pendente.
    if (abertura) {
      const confirmada = await confirmarTransferenciaAberturaRepository(
        {
          transferenciaId: abertura.transferenciaId,
          lacreId: abertura.lacreId,
          contaCaixaId: pdv.contaId,
          caixaId: caixa.id,
          usuarioId: perfil.usuarioId,
          agora: new Date()
        },
        tx
      );
      if (!confirmada) throw new Error("Lacre já utilizado por outro caixa");
    }

    const aberto = await buscarCaixaPorIdRepository(caixa.id, tx);
    if (!aberto) throw new Error("Caixa nao encontrado apos abertura");
    // Abertura retroativa (ex.: abriu 12:53 informando 08:00): puxa as vendas orfas do periodo.
    await revincularVendasAoCaixa(aberto, tx);
    return { caixaAberto: serializarCaixa(aberto), resumo: await calcularResumoCaixaOperacional(aberto, tx) };
  });
}

export async function editarAberturaCaixa(
  caixaId: string,
  dados: EditarAberturaCaixaPayload,
  perfil: PerfilUsuario
): Promise<CaixaStatus> {
  try {
    return await editarAberturaCaixaEmTransacao(caixaId, dados, perfil);
  } catch (error) {
    if (error instanceof Error) throw traduzirErroAberturaCaixa(error);
    throw error;
  }
}

async function editarAberturaCaixaEmTransacao(
  caixaId: string,
  dados: EditarAberturaCaixaPayload,
  perfil: PerfilUsuario
): Promise<CaixaStatus> {
  return executarEmTransacao(async (tx) => {
    const caixa = await buscarCaixaPorIdRepository(caixaId, tx);
    if (!caixa || !podeAcessarEmpresa(perfil, caixa.empresaId)) throw new Error("Caixa nao encontrado");
    if (!podeOperarCaixa(perfil, caixa)) throw new Error("Caixa nao permitido");
    if (caixa.status !== "aberto") throw new Error("Caixa ja fechado");
    if (caixa.tokenEdicao !== dados.tokenEdicao) throw new Error("Token de edicao invalido");

    const dataHoraAbertura = dataObrigatoria(dados.dataHoraAbertura, "Data de abertura");
    const pdv = await buscarPdvEmpresaRepository(dados.pdvId, caixa.empresaId, tx);
    if (!pdv || !pdv.ativo) throw new Error("PDV nao encontrado");
    const colaborador = await buscarColaboradorPorUsuarioRepository(dados.usuarioCaixaId, caixa.empresaId, tx);
    if (!colaborador) throw new Error("Usuario do caixa precisa estar vinculado a colaborador da empresa");
    if (caixa.pdvId !== dados.pdvId && (await caixaTemLancamentosRepository(caixa.id, tx))) {
      throw new Error("Nao e possivel trocar PDV de caixa com lancamentos");
    }
    if (await existeCaixaAbertoPdvRepository(dados.pdvId, caixa.id, tx)) throw new Error(erroPeriodo);
    if (await existePeriodoCaixaRepository(dados.pdvId, dataHoraAbertura, caixa.id, tx)) throw new Error(erroPeriodo);

    const novoToken = gerarTokenEdicao();
    const valoresAntigos = {
      pdvId: caixa.pdvId,
      usuarioCaixaId: caixa.usuarioCaixaId,
      dataHoraAbertura: serializarData(caixa.dataHoraAbertura),
      observacao: caixa.observacao
    };
    const valoresNovos = {
      pdvId: dados.pdvId,
      usuarioCaixaId: dados.usuarioCaixaId,
      dataHoraAbertura: dataHoraAbertura.toISOString(),
      observacao: dados.observacao?.trim() || null
    };

    await registrarEdicaoCaixaRepository(
      { caixaId: caixa.id, tokenUsado: dados.tokenEdicao, editadoPor: perfil.usuarioId, valoresAntigos, valoresNovos },
      tx
    );
    await atualizarAberturaCaixaRepository(
      {
        caixaId: caixa.id,
        pdvId: dados.pdvId,
        usuarioCaixaId: dados.usuarioCaixaId,
        colaboradorId: colaborador.id,
        dataHoraAbertura,
        observacao: dados.observacao?.trim() || null,
        tokenEdicao: novoToken
      },
      tx
    );

    const atualizado = await buscarCaixaPorIdRepository(caixa.id, tx);
    if (!atualizado) throw new Error("Caixa nao encontrado apos edicao");
    // Qualquer edicao de horario dispara a revinculacao retroativa das vendas integradas.
    await revincularVendasAoCaixa(atualizado, tx);
    return { caixaAberto: serializarCaixa(atualizado), resumo: await calcularResumoCaixaOperacional(atualizado, tx) };
  });
}

// Valida e CONSOME (uso unico) o token de autorizacao do proprio solicitante para este caixa.
// Invalido -> 400; ja usado / indisponivel / expirado -> 410 (nunca 200). Compara so o hash.
async function consumirTokenAutorizacao(
  caixaId: string,
  solicitanteId: string,
  token: string | undefined,
  tx: ExecutorBanco
): Promise<string> {
  const tokenLimpo = token?.trim();
  if (!tokenLimpo) throw erroValidacao("Token obrigatorio", "TOKEN_OBRIGATORIO");
  const autorizacao = await buscarAutorizacaoPorTokenRepository(
    { caixaId, solicitanteId, tokenHash: hashTokenAutorizacao(tokenLimpo) },
    tx
  );
  if (!autorizacao) throw erroValidacao("Token invalido", "TOKEN_INVALIDO");
  if (autorizacao.status === "usada") throw new ErroDominio("Token ja utilizado", 410, "TOKEN_JA_UTILIZADO");
  if (autorizacao.status !== "pendente") throw new ErroDominio("Token indisponivel", 410, "TOKEN_INDISPONIVEL");
  if (!autorizacao.expiraEm || new Date(autorizacao.expiraEm) <= new Date()) {
    throw new ErroDominio("Token expirado", 410, "TOKEN_EXPIRADO");
  }
  await atualizarStatusAutorizacaoRepository({ id: autorizacao.id, status: "usada" }, tx);
  return autorizacao.autorizadorId;
}

// Altera o horario de ABERTURA do caixa: gerente/admin (caixa_alterar_horario) direto; operador via
// token de autorizacao. Observacao SEMPRE obrigatoria. Ao final, revincula as vendas integradas
// (anexa/desanexa) e audita em edicoes_caixa com o autorizador, a observacao e as contagens.
export async function alterarHorarioCaixa(
  caixaId: string,
  payload: AlterarHorarioCaixaPayload,
  perfil: PerfilUsuario
): Promise<AlterarHorarioCaixaResponse> {
  const observacao = payload.observacao.trim();
  if (!observacao) throw erroValidacao("Observacao obrigatoria", "OBSERVACAO_OBRIGATORIA");
  const novaAbertura = payload.dataHoraAbertura
    ? dataObrigatoria(payload.dataHoraAbertura, "Data de abertura")
    : undefined;
  const novoFechamento = payload.dataHoraFechamento
    ? dataObrigatoria(payload.dataHoraFechamento, "Data de fechamento")
    : undefined;
  if (!novaAbertura && !novoFechamento) throw erroValidacao("Informe abertura e/ou fechamento");

  try {
    return await executarEmTransacao(async (tx) => {
      const caixa = await buscarCaixaPorIdRepository(caixaId, tx);
      if (!caixa || !podeAcessarEmpresa(perfil, caixa.empresaId)) throw naoEncontrado("Caixa nao encontrado");
      if (caixa.status !== "aberto") throw erroValidacao("Caixa ja fechado");
      if (!caixa.pdvId) throw new Error("Caixa operacional invalido");

      const aberturaFinal = novaAbertura ?? (caixa.dataHoraAbertura ? new Date(caixa.dataHoraAbertura) : undefined);
      const fechamentoFinal = novoFechamento ?? (caixa.dataHoraFechamento ? new Date(caixa.dataHoraFechamento) : null);
      if (aberturaFinal && fechamentoFinal && fechamentoFinal <= aberturaFinal) {
        throw erroValidacao("Fechamento precisa ser posterior a abertura");
      }

      const autorizadorId = temPermissao(perfil.permissoes, "caixa_alterar_horario")
        ? perfil.usuarioId
        : await consumirTokenAutorizacao(caixaId, perfil.usuarioId, payload.token, tx);

      if (novaAbertura && (await existePeriodoCaixaRepository(caixa.pdvId, novaAbertura, caixa.id, tx))) {
        throw erroValidacao(erroPeriodo);
      }

      const valoresAntigos = {
        dataHoraAbertura: serializarData(caixa.dataHoraAbertura),
        dataHoraFechamento: serializarData(caixa.dataHoraFechamento)
      };
      await atualizarHorarioCaixaRepository(
        { caixaId: caixa.id, dataHoraAbertura: novaAbertura, dataHoraFechamento: novoFechamento },
        tx
      );
      const atualizado = await buscarCaixaPorIdRepository(caixa.id, tx);
      if (!atualizado) throw naoEncontrado("Caixa nao encontrado");
      const revinculacao = await revincularVendasAoCaixa(atualizado, tx);

      await registrarEdicaoCaixaRepository(
        {
          caixaId: caixa.id,
          tokenUsado: null,
          autorizadorId,
          observacao,
          editadoPor: perfil.usuarioId,
          valoresAntigos,
          valoresNovos: {
            dataHoraAbertura: serializarData(atualizado.dataHoraAbertura),
            dataHoraFechamento: serializarData(atualizado.dataHoraFechamento),
            vendasAnexadas: revinculacao.anexadas,
            vendasDesanexadas: revinculacao.desanexadas
          }
        },
        tx
      );

      return {
        caixaAberto: serializarCaixa(atualizado),
        resumo: await calcularResumoCaixaOperacional(atualizado, tx),
        revinculacao
      };
    });
  } catch (error) {
    if (error instanceof Error && !(error instanceof ErroDominio)) throw traduzirErroAberturaCaixa(error);
    throw error;
  }
}

export async function fecharCaixa(caixaId: string, dados: FecharCaixaPayload, perfil: PerfilUsuario) {
  return executarEmTransacao(async (tx) => {
    // B1: trava a linha antes de decidir. Dois fechamentos concorrentes deixam de correr juntos —
    // o segundo espera aqui e, ao passar, ja le 'fechado'. A guarda no UPDATE (abaixo) e a segunda
    // barreira, para o caso de a trava ser contornada por outro caminho.
    if (!(await travarCaixaRepository(caixaId, tx))) throw new Error("Caixa nao encontrado");

    const caixa = await buscarCaixaPorIdRepository(caixaId, tx);
    if (!caixa || !podeAcessarEmpresa(perfil, caixa.empresaId)) throw new Error("Caixa nao encontrado");
    if (!podeOperarCaixa(perfil, caixa)) throw new Error("Caixa nao permitido");
    if (caixa.status !== "aberto") throw new Error("Caixa ja fechado");
    const dataHoraFechamento = new Date();
    if (caixa.dataHoraAbertura && dataHoraFechamento <= new Date(caixa.dataHoraAbertura)) {
      throw new Error("Fechamento precisa ser posterior a abertura");
    }

    // Decisao 5: ordem da retaguarda nao se perde no fechamento. Enquanto houver solicitacao
    // `agendada`, o caixa nao fecha — ela precisa ser executada ou cancelada com motivo. Fechar por
    // cima dela deixaria a Tesouraria esperando um dinheiro que ninguem mais vai entregar.
    if (await existeSolicitacaoAgendadaRepository(caixa.id, tx)) {
      throw new Error("Existe solicitacao de entrega ao cofre pendente: execute ou cancele antes de fechar");
    }

    let totais = await calcularTotaisCaixaCentavos(caixa, tx);
    let saldoCentavos = saldoCaixaCentavos(totais);

    // D6/D7: a sobra NUNCA vira quebra positiva e nunca exige um segundo botao. O retorno final
    // sai aqui, no MESMO ato e na MESMA transacao do fechamento: se qualquer parte falhar depois,
    // este INSERT cai junto no rollback. Se o saldo ja estiver zero (retornos parciais durante o
    // turno), nada e criado e a mesma acao apenas fecha.
    if (saldoCentavos > 0) {
      if (!caixa.pdvContaId) throw new Error("Caixa operacional invalido");
      // Decisao 7: o retorno final TAMBEM entrega dinheiro fisico, entao exige responsavel no
      // cofre. A checagem fica DENTRO deste `if` de proposito: fechamento sem sobra nao gera
      // entrega nenhuma e nao pode ser bloqueado por falta de quem conferir.
      await exigirConfirmadorDoCofre(caixa.empresaId, perfil.usuarioId, tx);
      await registrarEntregaAoCofre(
        {
          caixa: { ...caixa, pdvContaId: caixa.pdvContaId },
          tipo: "retorno",
          valorCentavos: saldoCentavos,
          lacre: dados.lacreRetorno ?? null,
          observacao: dados.observacao ?? null,
          criadoPor: perfil.usuarioId,
          status: "pendente",
          // D6/B2: sem chave de proposito. Este ato ja e irrepetivel por construcao — roda sob a
          // trava da linha do caixa e o UPDATE so acerta caixa 'aberto', entao um retry encontra o
          // caixa fechado e nao chega ate aqui.
          idempotenciaChave: null
        },
        tx
      );
      totais = await calcularTotaisCaixaCentavos(caixa, tx);
      saldoCentavos = saldoCaixaCentavos(totais);
      if (saldoCentavos > 0) throw new Error("Retorno final nao zerou o saldo do caixa");
    }

    const observacao = dados.observacao?.trim() || null;
    if (saldoCentavos < 0) {
      if (!observacao) throw new Error("Observacao obrigatoria para fechar caixa com quebra");
      if (!caixa.usuarioCaixaId) throw new Error("Caixa sem usuario responsavel");
      const quebra = await criarQuebraCaixaRepository(
        {
          empresaId: caixa.empresaId,
          fechamentoCaixaId: caixa.id,
          usuarioId: caixa.usuarioCaixaId,
          valorCentavos: saldoCentavos,
          observacao
        },
        tx
      );
      const destinatarios = (await listarUsuariosTesourariaRepository(caixa.empresaId, tx))
        .map((item) => item.usuarioId)
        .filter((usuarioId): usuarioId is string => Boolean(usuarioId));
      await criarNotificacoesRepository(
        {
          empresaId: caixa.empresaId,
          tipo: "quebra_caixa",
          destinatariosUsuarioIds: destinatarios,
          referenciaId: quebra.id,
          titulo: `Quebra de caixa - ${caixa.usuarioCaixaNome ?? "Usuario"}`,
          valorCentavos: saldoCentavos
        },
        tx
      );
    }

    const linhasFechadas = await atualizarFechamentoCaixaRepository(
      {
        caixaId: caixa.id,
        dataHoraFechamento,
        observacao: observacao || caixa.observacao,
        fechadoPor: perfil.usuarioId,
        totais,
        saldoCentavos
      },
      tx
    );
    // B1: o UPDATE so acerta caixa 'aberto'. Zero linhas significa que outro fechamento venceu a
    // corrida — erro de dominio (400), nunca 500 por violacao de UNIQUE da quebra.
    if (linhasFechadas === 0) throw new Error("Caixa ja fechado");

    return { caixaAberto: null, resumo: null } satisfies CaixaStatus;
  });
}

// B2: duas requisicoes com a MESMA chave so podem ser o mesmo ato. Se qualquer parte da intencao
// mudou, o cliente reaproveitou a chave para outra coisa — e devolver "ok" ali seria engolir uma
// entrega de dinheiro em silencio. Por isso o conflito e explicito, e nao um 200 conveniente.
function conferirIntencaoEntrega(
  existente: IntencaoEntregaCofre,
  pretendida: { caixaId: string; tipo: string; valorCentavos: number; lacre: string | null; observacao: string | null },
  // O lacre so faz parte da intencao quando ele existe DESDE A CRIACAO — que e o caso da entrega
  // avulsa. Na PROGRAMACAO nao: la o lacre nasce depois, na execucao, e comparar com ele faria o
  // retry legitimo da programacao (que nunca manda lacre) responder 409 assim que alguem
  // executasse. Pelo mesmo motivo o `status` nunca entra: ele muda por atos posteriores e nao
  // descreve o que foi pedido.
  intencaoIncluiLacre = true
): void {
  const divergencias: string[] = [];
  if (existente.caixaId !== pretendida.caixaId) divergencias.push("caixa");
  if (existente.tipo !== pretendida.tipo) divergencias.push("tipo");
  if (existente.valorCentavos !== pretendida.valorCentavos) divergencias.push("valor");
  if (intencaoIncluiLacre && (existente.lacre ?? null) !== pretendida.lacre) divergencias.push("lacre");
  if ((existente.observacao ?? null) !== pretendida.observacao) divergencias.push("observacao");
  if (divergencias.length > 0) {
    throw new ErroDominio(
      `Chave de idempotencia ja usada para outra intencao (${divergencias.join(", ")})`,
      409,
      "IDEMPOTENCIA_CONFLITO"
    );
  }
}

// Decisao 7 · sem CONFIRMADOR ELEGIVEL no Cofre, o dinheiro nao sai.
//
// A entrega ao cofre nasce `pendente` e so vira dinheiro no cofre quando alguem conferir
// (R-028/R-036). Se ninguem PODE conferir, a entrega fica pendente para sempre: ja saiu do caixa e
// nunca entra no cofre. Some do sistema.
//
// "Poder conferir" sao tres coisas juntas, e checar so o vinculo era insuficiente — o gate liberava
// a entrega e a confirmacao depois se revelava impossivel:
//   1. estar vinculado a conta do cofre da empresa (`contas_usuarios`);
//   2. nao ser quem criou o movimento (R-028: quem envia nao confirma o proprio envio);
//   3. ter `transferencias_conferir` na permissao EFETIVA (setor + cargos + usuario).
//
// A (3) e resolvida aqui, e nao no SQL, para usar exatamente a mesma resolucao do guard das rotas.
// Duas regras de permissao para a mesma pergunta divergem no primeiro ajuste.
async function existeConfirmadorElegivel(
  input: { contaId: string; empresaId: string; criadoPor: string | null },
  tx: ExecutorBanco
): Promise<boolean> {
  const candidatos = await listarCandidatosConfirmacaoRepository(input, tx);
  for (const usuarioId of candidatos) {
    const perfil = await buscarPerfilUsuario(usuarioId);
    if (perfil && temPermissao(perfil.permissoes, "transferencias_conferir")) return true;
  }
  return false;
}

// Bloqueio ANTES do ato, valendo para todos os que entregam dinheiro — avulsa, execucao de
// solicitacao e retorno final do fechamento — alem da propria programacao, que nao faz sentido
// criar se ninguem podera receber. O fechamento SEM retorno fisico nao e bloqueado: nao ha entrega,
// entao nao ha o que conferir.
//
// `criadoPor` e quem VAI criar o movimento: se o unico vinculado ao cofre for ele mesmo, nao existe
// confirmador — e e melhor descobrir isso agora do que com o dinheiro fora do caixa.
async function exigirConfirmadorDoCofre(empresaId: string, criadoPor: string, tx: ExecutorBanco): Promise<void> {
  const contaCofreId = await buscarContaCofreEmpresaRepository(empresaId, tx);
  if (!contaCofreId) throw new Error("Empresa sem conta de cofre configurada para transferencia ao cofre");
  if (!(await existeConfirmadorElegivel({ contaId: contaCofreId, empresaId, criadoPor }, tx))) {
    throw new Error("Conta do cofre sem responsavel elegivel para conferir a entrega");
  }
}

// D5/D9: cada entrega fisica ao cofre e um movimento IMUTAVEL, com valor e lacre proprios. Este e
// o UNICO lugar do sistema que cria a transferencia caixa -> cofre — o retorno avulso, a sangria do
// turno, a solicitacao programada (D4) e o retorno final do fechamento passam todos por aqui.
// Diferenca em relacao ao valor programado nunca edita um movimento executado: gera um segundo
// movimento, com outro lacre.
async function registrarEntregaAoCofre(
  input: {
    caixa: { id: string; empresaId: string; pdvContaId: string; dataMovimento: string | null };
    tipo: "sangria" | "retorno";
    valorCentavos: number;
    lacre: string | null;
    observacao: string | null;
    criadoPor: string;
    // D2/D3 'pendente' (entrega fisica ja feita) · D4 'agendada' (so a solicitacao, sem dinheiro).
    status: "pendente" | "agendada";
    // B2: null SOMENTE no retorno final do fechamento (D6) — la a trava da linha do caixa e a
    // guarda `status = 'aberto'` do UPDATE ja tornam o ato irrepetivel, e o valor e a sobra inteira.
    idempotenciaChave: string | null;
  },
  tx: ExecutorBanco
): Promise<{ id: string; duplicada: boolean }> {
  // D4: so a PROGRAMACAO carimba o marcador de origem. Avulsa e retorno final ficam NULL — e e
  // esse NULL que mantem as consultas D4 cegas para elas.
  const solicitacaoCofreEm = input.status === "agendada" ? new Date() : null;
  const lacre = input.lacre?.trim() || null;
  const observacao = input.observacao?.trim() || null;
  const intencao = {
    caixaId: input.caixa.id,
    tipo: input.tipo,
    valorCentavos: input.valorCentavos,
    lacre,
    observacao
  };

  // B2: a idempotencia e resolvida ANTES da unicidade do lacre, e a ordem importa. Um retry
  // carrega o MESMO lacre; se a checagem do lacre viesse primeiro, o retry morreria com
  // "Lacre ja utilizado em outro movimento" — mensagem errada para um ato que ja deu certo, e que
  // levaria o operador a lancar de novo com outro lacre, duplicando a entrega.
  // A PROGRAMACAO nasce sem lacre e ganha um so na execucao; comparar lacre num retry dela daria
  // 409 indevido. Ver `conferirIntencaoEntrega`.
  const intencaoIncluiLacre = input.status !== "agendada";

  if (input.idempotenciaChave) {
    const existente = await buscarTransferenciaPorIdempotenciaRepository(
      input.caixa.empresaId,
      input.idempotenciaChave,
      tx
    );
    if (existente) {
      conferirIntencaoEntrega(existente, intencao, intencaoIncluiLacre);
      return { id: existente.id, duplicada: true };
    }
  }

  // Regra 5: destino = conta do cofre mapeada na empresa (sem inventar).
  const contaCofreId = await buscarContaCofreEmpresaRepository(input.caixa.empresaId, tx);
  if (!contaCofreId) throw new Error("Empresa sem conta de cofre configurada para transferencia ao cofre");
  if (contaCofreId === input.caixa.pdvContaId) throw new Error("Conta de cofre nao pode ser a mesma do caixa");

  // Lacre da VOLTA (R-026: opcional; R-027: numero novo, nunca reutilizado). Digitado pelo
  // operador como na ida — nao existe mais estoque de malote para "escolher".
  if (lacre && (await existeNumeroLacreRepository(input.caixa.empresaId, lacre, tx))) {
    throw new Error("Lacre já utilizado em outro movimento");
  }

  const ordem = await proximaOrdemTransferenciaRepository(input.caixa.id, input.tipo, tx);
  const transferencia = await criarTransferenciaCofreRepository(
    {
      empresaId: input.caixa.empresaId,
      caixaId: input.caixa.id,
      contaCaixaId: input.caixa.pdvContaId,
      contaCofreId,
      valorCentavos: input.valorCentavos,
      tipo: input.tipo,
      ordem,
      dataReferencia: input.caixa.dataMovimento ?? diaNegocio(new Date()),
      dataTransferencia: diaNegocio(new Date()),
      nLacreDoc: lacre,
      descricao: input.tipo === "retorno" ? "Retorno de fechamento" : "Sangria",
      observacao,
      criadoPor: input.criadoPor,
      // D2/D3: a entrega do operador nasce PENDENTE. Ja abate o saldo fisico do caixa
      // (transferenciaContaComoSaida aceita 'pendente'), mas so entra no cofre quando quem opera
      // a conta de destino conferir o dinheiro (R-028/R-036).
      status: input.status,
      idempotenciaChave: input.idempotenciaChave,
      solicitacaoCofreEm
    },
    tx
  );

  // B2: DO NOTHING nao inseriu — outra transacao com a mesma chave commitou primeiro. A transacao
  // segue viva (era esse o ponto de nao usar INSERT cru): lemos a vencedora e respondemos com ela.
  if (!transferencia.criada) {
    if (!input.idempotenciaChave) throw new Error("Transferencia de cofre nao criada");
    const vencedora = await buscarTransferenciaPorIdempotenciaRepository(
      input.caixa.empresaId,
      input.idempotenciaChave,
      tx
    );
    if (!vencedora) throw new Error("Transferencia de cofre nao criada");
    // Item 8: a MESMA regra da leitura anterior. Comparar o lacre aqui faria o retry legitimo de
    // uma PROGRAMACAO responder 409 assim que alguem a executasse — o lacre nasce na execucao.
    conferirIntencaoEntrega(vencedora, intencao, intencaoIncluiLacre);
    return { id: vencedora.id, duplicada: true };
  }

  if (lacre) {
    await criarLacreRetornoRepository(
      { empresaId: input.caixa.empresaId, numero: lacre, transferenciaId: transferencia.id },
      tx
    );
  }
  return { id: transferencia.id, duplicada: false };
}

// M2 (R3/R4): sangria (durante o turno) e retorno (no fechamento) sao a MESMA entidade — uma
// transferencia caixa -> cofre. O servidor resolve a conta do cofre, o ordinal (R6) e consome o
// lacre novo (D5 opcional). O retorno da sobra em especie zera o saldo fisico e libera o fechamento.
export async function criarTransferenciaCofreCaixa(
  caixaId: string,
  dados: TransferenciaCofrePayload,
  perfil: PerfilUsuario
): Promise<CaixaStatus> {
  return executarEmTransacao(async (tx) => {
    // B1/B2: a trava serializa as entregas do mesmo caixa e o teto (abaixo) impede saldo negativo.
    // Trava e teto NAO sao idempotencia: com saldo 300, dois POSTs identicos de 100 passariam os
    // dois, porque o segundo ainda encontra 200 disponiveis. Quem distingue intencao nova de retry
    // e a `idempotenciaChave` do payload, persistida e protegida por UNIQUE parcial (B2).
    if (!(await travarCaixaRepository(caixaId, tx))) throw new Error("Caixa nao encontrado");

    const caixa = await buscarCaixaPorIdRepository(caixaId, tx);
    if (!caixa || !podeAcessarEmpresa(perfil, caixa.empresaId)) throw new Error("Caixa nao encontrado");
    if (!podeOperarCaixa(perfil, caixa)) throw new Error("Caixa nao permitido");
    if (caixa.status !== "aberto") throw new Error("Caixa ja fechado");
    if (!caixa.pdvContaId) throw new Error("Caixa operacional invalido");
    const valorCentavos = paraCentavos(dados.valor);
    if (valorCentavos <= 0) throw new Error("Valor da transferencia deve ser positivo");

    // B2 x D1: a idempotencia tem de ser resolvida ANTES do teto, e este e o caso que prova por que.
    // Saldo 100, entrega de 100 com a chave K: o primeiro POST zera o caixa. O retry da MESMA chave
    // volta e encontra saldo 0 — se o teto rodasse primeiro, o retry morreria com "Caixa sem saldo",
    // o operador acharia que a entrega falhou e lancaria de novo. Duas entregas, um envelope.
    const jaRegistrada = await buscarTransferenciaPorIdempotenciaRepository(
      caixa.empresaId,
      dados.idempotenciaChave,
      tx
    );
    if (jaRegistrada) {
      conferirIntencaoEntrega(jaRegistrada, {
        caixaId: caixa.id,
        tipo: dados.tipo,
        valorCentavos,
        lacre: dados.lacre?.trim() || null,
        observacao: dados.observacao?.trim() || null
      });
      return {
        caixaAberto: serializarCaixa(caixa),
        resumo: await calcularResumoCaixaOperacional(caixa, tx)
      };
    }

    // Decisao 7: entrega avulsa tambem entrega dinheiro — sem quem conferir, nao sai.
    await exigirConfirmadorDoCofre(caixa.empresaId, perfil.usuarioId, tx);

    // D1: retorno/sangria parcial e permitido, mas NUNCA acima do que existe em especie. Sem este
    // teto, dois cliques levavam o saldo a negativo e o fechamento gravava quebra falsa no nome do
    // operador. Recalculado aqui dentro, sob a trava — o saldo que a tela viu nao serve de prova.
    const saldoDisponivelCentavos = saldoCaixaCentavos(await calcularTotaisCaixaCentavos(caixa, tx));
    if (saldoDisponivelCentavos <= 0) {
      throw new Error("Caixa sem saldo em especie para enviar ao cofre");
    }
    if (valorCentavos > saldoDisponivelCentavos) {
      throw new Error(`Valor acima do saldo do caixa: disponivel R$ ${deCentavos(saldoDisponivelCentavos).toFixed(2)}`);
    }

    await registrarEntregaAoCofre(
      {
        caixa,
        tipo: dados.tipo,
        valorCentavos,
        lacre: dados.lacre ?? null,
        observacao: dados.observacao ?? null,
        criadoPor: perfil.usuarioId,
        status: "pendente",
        idempotenciaChave: dados.idempotenciaChave
      },
      tx
    );

    const atualizado = await buscarCaixaPorIdRepository(caixa.id, tx);
    if (!atualizado) throw new Error("Caixa nao encontrado");
    return { caixaAberto: serializarCaixa(atualizado), resumo: await calcularResumoCaixaOperacional(atualizado, tx) };
  });
}

// --- D4 · solicitacao programada -------------------------------------------------------------
// A Tesouraria/Gestao PROGRAMA a entrega ligada ao caixa aberto; o operador EXECUTA. Sao dois atos
// de duas pessoas, e so o segundo movimenta dinheiro.
//
// Reusa integralmente a transferencia caixa -> cofre: a solicitacao e a MESMA linha, nascida
// 'agendada'. Nao existe tabela de solicitacao, nem endpoint generico paralelo — a regra-mae do
// 16_DEFINITION_OF_DONE proibe o segundo caminho para o mesmo ato.

async function carregarCaixaParaSolicitacao(caixaId: string, perfil: PerfilUsuario, tx: ExecutorBanco) {
  const caixa = await buscarCaixaPorIdRepository(caixaId, tx);
  if (!caixa || !podeAcessarEmpresa(perfil, caixa.empresaId)) throw new Error("Caixa nao encontrado");
  if (caixa.status !== "aberto") throw new Error("Caixa ja fechado");
  if (!caixa.pdvContaId) throw new Error("Caixa operacional invalido");
  return { ...caixa, pdvContaId: caixa.pdvContaId };
}

// Quem programa e a RETAGUARDA (tesouraria, gerencia, financeiro, diretor, admin) — a mesma
// definicao unica de `podeLancarSemCaixa`, para que "quem e livre" nao ganhe uma segunda definicao
// que diverge com o tempo. O operador do caixa NAO programa para si mesmo.
export async function programarSolicitacaoCofre(
  caixaId: string,
  dados: ProgramarSolicitacaoCofrePayload,
  perfil: PerfilUsuario
): Promise<SolicitacaoCofre[]> {
  return executarEmTransacao(async (tx) => {
    if (!podeLancarSemCaixa(perfil)) throw new Error("Programar entrega ao cofre e exclusivo da retaguarda");
    if (!(await travarCaixaRepository(caixaId, tx))) throw new Error("Caixa nao encontrado");
    const caixa = await carregarCaixaParaSolicitacao(caixaId, perfil, tx);

    const valorCentavos = paraCentavos(dados.valor);
    if (valorCentavos <= 0) throw new Error("Valor da solicitacao deve ser positivo");

    // Decisao 7: nao faz sentido programar uma entrega que ninguem podera receber.
    await exigirConfirmadorDoCofre(caixa.empresaId, perfil.usuarioId, tx);

    // D4: SEM teto de saldo aqui, e de proposito. Programar nao movimenta dinheiro; a Tesouraria
    // pode pedir de manha o que so existira no caixa a tarde. O teto vale na EXECUCAO, que e onde
    // o dinheiro sai de verdade.
    await registrarEntregaAoCofre(
      {
        caixa,
        tipo: dados.tipo,
        valorCentavos,
        // D5: solicitacao nao tem lacre. Lacre e do envelope fisico, e o fisico so existe quando
        // o operador executa.
        lacre: null,
        observacao: dados.observacao ?? null,
        criadoPor: perfil.usuarioId,
        status: "agendada",
        idempotenciaChave: dados.idempotenciaChave
      },
      tx
    );

    return serializarSolicitacoes(await listarSolicitacoesCofreRepository(caixaId, tx));
  });
}

// D4: quais caixas estao abertos agora, para a retaguarda escolher o destino da solicitacao.
//
// Exige o PAPEL de retaguarda, e nao so a permissao do preHandler. O operador de Caixa tambem tem
// `transferencias_criar`, entao sem esta checagem ele passaria pelo gate e receberia a lista de
// TODOS os caixas abertos da empresa — informacao que nao lhe diz respeito e que so existe para
// programar entrega, ato que ele nao pode praticar.
export async function listarCaixasAbertos(empresaId: string, perfil: PerfilUsuario): Promise<CaixaAbertoResumo[]> {
  if (!podeAcessarEmpresa(perfil, empresaId)) throw new Error("Empresa nao permitida");
  if (!podeLancarSemCaixa(perfil)) throw new Error("Programar entrega ao cofre e exclusivo da retaguarda");
  const linhas = await listarCaixasAbertosRepository(empresaId);
  return linhas.map((linha) => ({
    id: linha.id,
    pdvNome: linha.pdvNome,
    usuarioCaixaNome: linha.usuarioCaixaNome,
    dataMovimento: linha.dataMovimento,
    dataHoraAbertura: linha.dataHoraAbertura ? new Date(linha.dataHoraAbertura).toISOString() : null
  }));
}

export async function listarSolicitacoesCofre(caixaId: string, perfil: PerfilUsuario): Promise<SolicitacaoCofre[]> {
  const caixa = await buscarCaixaPorIdRepository(caixaId);
  if (!caixa || !podeAcessarEmpresa(perfil, caixa.empresaId)) throw new Error("Caixa nao encontrado");
  return serializarSolicitacoes(await listarSolicitacoesCofreRepository(caixaId));
}

function serializarSolicitacoes(
  linhas: Array<{
    id: string;
    tipo: string;
    valorOriginal: string;
    observacao: string | null;
    criadoPor: string | null;
    criadoEm: Date | null;
  }>
): SolicitacaoCofre[] {
  return linhas.map((linha) => ({
    id: linha.id,
    tipo: linha.tipo === "sangria" ? "sangria" : "retorno",
    valor: deCentavos(paraCentavos(linha.valorOriginal)),
    observacao: linha.observacao,
    criadoPor: linha.criadoPor,
    criadoEm: (linha.criadoEm ?? new Date()).toISOString()
  }));
}

// D4: o operador executa. A solicitacao 'agendada' vira o movimento 'pendente' — a MESMA linha,
// nao uma copia. O dinheiro sai do caixa neste instante e fica aguardando a conferencia de quem
// opera a conta do cofre (R-028/R-036).
export async function executarSolicitacaoCofre(
  caixaId: string,
  solicitacaoId: string,
  dados: ExecutarSolicitacaoCofrePayload,
  perfil: PerfilUsuario
): Promise<CaixaStatus> {
  return executarEmTransacao(async (tx) => {
    if (!(await travarCaixaRepository(caixaId, tx))) throw new Error("Caixa nao encontrado");
    const caixa = await carregarCaixaParaSolicitacao(caixaId, perfil, tx);
    if (!podeOperarCaixa(perfil, caixa)) throw new Error("Caixa nao permitido");

    const status = async () => ({
      caixaAberto: serializarCaixa(caixa),
      resumo: await calcularResumoCaixaOperacional(caixa, tx)
    });

    const lacre = dados.lacre?.trim() || null;
    const solicitacao = await buscarSolicitacaoCofreRepository(solicitacaoId, caixaId, tx);
    if (!solicitacao) throw new Error("Solicitacao nao encontrada");

    // Decisao 2: cancelada e um estado FINAL. Responder 200 aqui seria dizer "entreguei" para um
    // pedido que a retaguarda revogou — nunca sucesso silencioso.
    if (solicitacao.status === "cancelada") {
      throw new ErroDominio("Solicitacao cancelada nao pode ser executada", 409, "SOLICITACAO_CANCELADA");
    }

    // Idempotencia da EXECUCAO, sem chave nenhuma: a identidade do ato e o proprio `solicitacaoId`.
    // Ja saiu de 'agendada' => alguem ja executou. O unico conteudo proprio deste ato e o lacre do
    // envelope, entao e ele que decide:
    //   - mesmo lacre (ou ambos sem lacre) => retry, 200, nada acontece de novo;
    //   - lacre diferente => nao e retry, e outro envelope fisico sobre uma ordem ja cumprida. 409.
    if (solicitacao.status !== "agendada") {
      if ((solicitacao.lacre ?? null) !== lacre) {
        throw new ErroDominio(
          "Solicitacao ja executada com outro lacre — use um movimento avulso para a entrega adicional",
          409,
          "EXECUCAO_CONFLITO"
        );
      }
      return status();
    }

    // Decisao 7: sem responsavel no Cofre nao existe quem confira a entrega. Bloqueia ANTES de o
    // dinheiro sair do caixa — senao ele fica `pendente` para sempre, fora do caixa e fora do cofre.
    await exigirConfirmadorDoCofre(caixa.empresaId, perfil.usuarioId, tx);

    // D10 · o valor e o PROGRAMADO, ponto. A Tesouraria pediu R$ 100 => saem R$ 100. O payload nem
    // carrega valor, entao nao ha o que divergir aqui.
    const valorCentavos = solicitacao.valorCentavos;

    // Decisao 1: menos que o programado NAO executa. Executar parcialmente reescreveria o valor da
    // ordem — e o que a retaguarda conferiria depois nao seria o que ela pediu. O excedente, no
    // caminho oposto, tem saida propria: um movimento avulso, com chave e lacre novos.
    const saldoDisponivelCentavos = saldoCaixaCentavos(await calcularTotaisCaixaCentavos(caixa, tx));
    if (valorCentavos > saldoDisponivelCentavos) {
      throw new Error(
        `Saldo insuficiente para executar a solicitacao: programado R$ ${deCentavos(valorCentavos).toFixed(2)}, ` +
          `disponivel R$ ${deCentavos(saldoDisponivelCentavos).toFixed(2)}`
      );
    }

    // D5: o lacre nasce na execucao, e e deste movimento. R-027: numero novo, nunca reutilizado.
    if (lacre && (await existeNumeroLacreRepository(caixa.empresaId, lacre, tx))) {
      throw new Error("Lacre já utilizado em outro movimento");
    }

    const ordem = await proximaOrdemTransferenciaRepository(caixa.id, solicitacao.tipo, tx);
    const executada = await executarSolicitacaoCofreRepository(
      {
        solicitacaoId,
        caixaId,
        lacre,
        ordem,
        dataTransferencia: diaNegocio(new Date()),
        // Quem esta executando AGORA — nao quem programou. `podeOperarCaixa` aceita gerente, quem
        // abriu o caixa ou o operador designado, entao sem isto a recusa notificaria a pessoa errada.
        executadoPor: perfil.usuarioId
      },
      tx
    );
    // Zero linhas: outra execucao venceu a transicao. Na pratica a trava da linha do caixa ja
    // serializa as duas (a perdedora entra aqui depois do commit e cai no ramo de retry acima);
    // isto e a rede de seguranca para o caso de a trava ser contornada por outro caminho.
    // Nao devolve sucesso as cegas: reavalia com a MESMA regra do retry.
    if (!executada) {
      const atual = await buscarSolicitacaoCofreRepository(solicitacaoId, caixaId, tx);
      if (atual && (atual.lacre ?? null) === lacre) return status();
      throw new ErroDominio("Solicitacao executada por outro usuario neste instante", 409, "EXECUCAO_CONFLITO");
    }

    if (lacre) {
      await criarLacreRetornoRepository(
        { empresaId: caixa.empresaId, numero: lacre, transferenciaId: executada.id },
        tx
      );
    }

    const atualizado = await buscarCaixaPorIdRepository(caixa.id, tx);
    if (!atualizado) throw new Error("Caixa nao encontrado");
    return { caixaAberto: serializarCaixa(atualizado), resumo: await calcularResumoCaixaOperacional(atualizado, tx) };
  });
}

// D4/decisao 2: a retaguarda CANCELA uma solicitacao ainda `agendada`, com motivo obrigatorio.
//
// Cancelar nao apaga: a linha continua, com K1, valor, observacao e o marcador da programacao
// intactos, e ganha autoria + data + motivo. Uma ordem de dinheiro revogada tem de continuar
// visivel no historico — apagar seria destruir a trilha com outro nome.
//
// So `agendada` pode ser cancelada. `pendente`/`recebido` ja moveram dinheiro e sao imutaveis; o
// CHECK `transferencias_solicitacao_cofre_check` torna isso impossivel no banco, nao so aqui.
export async function cancelarSolicitacaoCofre(
  caixaId: string,
  solicitacaoId: string,
  dados: CancelarSolicitacaoCofrePayload,
  perfil: PerfilUsuario
): Promise<SolicitacaoCofre[]> {
  return executarEmTransacao(async (tx) => {
    if (!podeLancarSemCaixa(perfil)) throw new Error("Cancelar entrega ao cofre e exclusivo da retaguarda");
    if (!(await travarCaixaRepository(caixaId, tx))) throw new Error("Caixa nao encontrado");
    // Chamada pelo efeito, nao pelo retorno: valida empresa permitida, caixa ainda aberto e PDV com
    // conta. Cancelar num caixa de outra empresa, ou ja fechado, tem de parar aqui.
    await carregarCaixaParaSolicitacao(caixaId, perfil, tx);

    const solicitacao = await buscarSolicitacaoCofreRepository(solicitacaoId, caixaId, tx);
    // O filtro D4 ja exclui transferencia generica: para ela isto e 404, e nao "nao pode cancelar".
    if (!solicitacao) throw new Error("Solicitacao nao encontrada");

    // Retry do MESMO cancelamento: a linha ja esta 'cancelada'. Nao e erro nem duplica auditoria —
    // o UPDATE guardado por `status = 'agendada'` acertaria zero linhas de qualquer forma.
    if (solicitacao.status === "cancelada") {
      return serializarSolicitacoes(await listarSolicitacoesCofreRepository(caixaId, tx));
    }
    if (solicitacao.status !== "agendada") {
      throw new ErroDominio("Solicitacao ja executada nao pode ser cancelada", 409, "SOLICITACAO_EXECUTADA");
    }

    const cancelada = await cancelarSolicitacaoCofreRepository(
      { solicitacaoId, caixaId, canceladoPor: perfil.usuarioId, motivo: dados.motivo.trim() },
      tx
    );
    // Perdeu a corrida para outro cancelamento (ou para uma execucao). Reavalia em vez de mentir.
    if (!cancelada) {
      const atual = await buscarSolicitacaoCofreRepository(solicitacaoId, caixaId, tx);
      if (atual?.status !== "cancelada") {
        throw new ErroDominio("Solicitacao alterada por outro usuario neste instante", 409, "SOLICITACAO_CONFLITO");
      }
    }

    return serializarSolicitacoes(await listarSolicitacoesCofreRepository(caixaId, tx));
  });
}

// M2 (consultas, item 4): a "aba TRANSFERENCIAS" por caixa+dia — os movimentos com ordem 1a/2a/3a/4a
// e os totais na OTICA DO COFRE: SAIDA = cofre->caixa (abertura/suprimento); ENTRADA = caixa->cofre
// (sangria/retorno); SALDO = ENTRADA - SAIDA (o que o caixa devolveu alem do fundo emprestado).
export async function obterTransferenciasCaixa(
  caixaId: string,
  perfil: PerfilUsuario
): Promise<TransferenciasCaixaResponse> {
  const caixa = await buscarCaixaPorIdRepository(caixaId);
  if (!caixa || !podeAcessarEmpresa(perfil, caixa.empresaId)) throw new Error("Caixa nao encontrado");
  if (!caixa.pdvContaId) throw new Error("Caixa operacional invalido");
  const linhas = await listarTransferenciasCaixaRepository(caixaId);

  let totalSaidaCentavos = 0; // cofre -> caixa (abertura/suprimento)
  let totalEntradaCentavos = 0; // caixa -> cofre (sangria/retorno)
  let ordemSaida = 0;
  let ordemEntrada = 0;
  const itens = linhas.map((linha) => {
    const valorCentavos = paraCentavos(linha.valorOriginal);
    const sentido = linha.contaDestinoId === caixa.pdvContaId ? ("saida" as const) : ("entrada" as const);
    // Ordinal 1a/2a/3a por sentido, cronologico (independe do ordem gravado — abertura nao tem).
    const ordem = sentido === "saida" ? ++ordemSaida : ++ordemEntrada;
    if (sentido === "saida") totalSaidaCentavos += valorCentavos;
    else totalEntradaCentavos += valorCentavos;
    return {
      id: linha.id,
      tipo: linha.tipo as "abertura" | "suprimento" | "sangria" | "retorno",
      ordem,
      valor: deCentavos(valorCentavos),
      sentido,
      lacre: linha.lacreNumero,
      dataTransferencia: linha.dataTransferencia
    };
  });

  return {
    itens,
    totalSaida: deCentavos(totalSaidaCentavos),
    totalEntrada: deCentavos(totalEntradaCentavos),
    saldo: deCentavos(totalEntradaCentavos - totalSaidaCentavos)
  };
}

export async function listarHistoricoCaixa(
  query: HistoricoCaixaQuery,
  perfil: PerfilUsuario
): Promise<ResultadoPaginado<LinhaHistoricoCaixa> & { totais: TotaisHistoricoCaixa }> {
  if (!podeAcessarEmpresa(perfil, query.empresaId)) throw new Error("Empresa nao permitida");
  if (query.dataInicio && query.dataFim && query.dataInicio > query.dataFim) {
    throw new Error("Data inicial nao pode ser maior que a final");
  }

  const filtros = filtrosDoHistorico(query);
  const { itens, total } = await listarHistoricoCaixaRepository(filtros, query.page, query.pageSize);
  // Totais do filtro inteiro (rodape) e o flag de acerto so das linhas da pagina.
  const [totais, ajustes, alterados] = await Promise.all([
    totaisHistoricoCaixaRepository(filtros),
    caixasComAjusteRepository(itens.map((caixa) => caixa.id)),
    caixasAlteradosPosFechamentoRepository(itens.map((caixa) => caixa.id))
  ]);
  const comAjuste = new Set(ajustes.map((ajuste) => ajuste.caixaId));
  const alteradoPosFechamento = new Set(alterados.map((alteracao) => alteracao.caixaId));

  return {
    itens: itens.map((caixa) => ({
      ...caixa,
      dataHoraAbertura: serializarData(caixa.dataHoraAbertura),
      dataHoraFechamento: serializarData(caixa.dataHoraFechamento),
      fechadoPor: caixa.fechadoPor,
      fechadoPorNome: caixa.fechadoPorNome,
      totalEntradas: numero(caixa.totalEntradas),
      totalTransferencias: numero(caixa.totalTransferencias),
      totalTransferenciasEntrada: numero(caixa.totalTransferenciasEntrada),
      totalTransferenciasSaida: numero(caixa.totalTransferenciasSaida),
      totalDespesas: numero(caixa.totalDespesas),
      totalRetiradas: numero(caixa.totalRetiradas),
      totalMercadorias: numero(caixa.totalMercadorias),
      saldo: numero(caixa.saldo),
      status: statusCaixaSchema.parse(caixa.status),
      temAjuste: comAjuste.has(caixa.id),
      alteradoAposFechamento: alteradoPosFechamento.has(caixa.id)
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totais: {
      totalEntradas: numero(totais?.totalEntradas),
      totalTransferenciasEntrada: numero(totais?.totalTransferenciasEntrada),
      totalTransferenciasSaida: numero(totais?.totalTransferenciasSaida),
      totalDespesas: numero(totais?.totalDespesas),
      totalRetiradas: numero(totais?.totalRetiradas),
      totalMercadorias: numero(totais?.totalMercadorias),
      saldo: numero(totais?.saldo),
      caixas: totais?.caixas ?? 0
    }
  };
}

// Query (wire) -> filtros do repositorio: so o que veio preenchido vira condicao.
function filtrosDoHistorico(query: HistoricoCaixaQuery): FiltrosHistoricoCaixa {
  return {
    empresaId: query.empresaId,
    ...(query.dataInicio ? { dataInicio: query.dataInicio } : {}),
    ...(query.dataFim ? { dataFim: query.dataFim } : {}),
    ...(query.pdvId ? { pdvId: query.pdvId } : {}),
    ...(query.usuarioCaixaId ? { usuarioCaixaId: query.usuarioCaixaId } : {}),
    ...(query.colaboradorId ? { colaboradorId: query.colaboradorId } : {}),
    ...(query.turnoId ? { turnoId: query.turnoId } : {}),
    ...(query.status ? { status: query.status } : {})
  };
}

// Detalhe de auditoria de um caixa: alteracoes de horario + acerto de saldo (se houve).
// Os lancamentos NAO vem daqui — a tela reusa as listagens existentes filtradas por caixaId.
export async function obterDetalheCaixa(caixaId: string, perfil: PerfilUsuario): Promise<DetalheCaixaResponse> {
  const caixa = await buscarCaixaPorIdRepository(caixaId);
  if (!caixa || !podeAcessarEmpresa(perfil, caixa.empresaId)) throw new Error("Caixa nao encontrado");

  const [edicoes, ajuste, lancamentos, alteracoesPosFechamento] = await Promise.all([
    listarEdicoesCaixaRepository(caixaId),
    buscarAjusteCaixaRepository(caixaId),
    listarLancamentosCaixaRepository(caixaId),
    listarAlteracoesPosFechamentoRepository(caixaId)
  ]);

  return {
    lancamentos: montarLancamentosPorCategoria(lancamentos, caixa.pdvContaId),
    alteracoesPosFechamento: alteracoesPosFechamento.map((alteracao) => ({
      id: alteracao.id,
      vendaId: alteracao.vendaId,
      identificadorExterno: alteracao.identificadorExterno,
      descricao: alteracao.descricao,
      valor: numero(alteracao.valor),
      dataVenda: serializarData(alteracao.dataVenda),
      alteradoEm: serializarData(alteracao.alteradoEm) ?? ""
    })),
    edicoes: edicoes.map((edicao) => ({
      id: edicao.id,
      editadoPor: edicao.editadoPor,
      editadoPorNome: edicao.editadoPorNome,
      autorizadorId: edicao.autorizadorId,
      autorizadorNome: edicao.autorizadorNome,
      observacao: edicao.observacao,
      editadoEm: serializarData(edicao.editadoEm) ?? "",
      // tokenUsado e segredo: sai so como "foi por token?" — o valor nunca vai para o cliente.
      porToken: Boolean(edicao.tokenUsado),
      valoresAntigos: horariosAuditados(edicao.valoresAntigos),
      valoresNovos: horariosAuditados(edicao.valoresNovos)
    })),
    ajuste: ajuste
      ? {
          id: ajuste.id,
          valorDiferenca: numero(ajuste.valorDiferenca),
          despesaId: ajuste.despesaId,
          criadoEm: serializarData(ajuste.criadoEm) ?? "",
          colaboradorId: ajuste.colaboradorId,
          colaboradorNome: ajuste.colaboradorNome,
          observacao: ajuste.observacao
        }
      : null
  };
}

// Agrupa por categoria, na mesma ordem em que a tela do caixa apresenta os totais.
function montarLancamentosPorCategoria(
  lancamentos: Awaited<ReturnType<typeof listarLancamentosCaixaRepository>>,
  pdvContaId: string | null
): CategoriaLancamentosCaixa[] {
  // Categorias sem hora real: so despesa/retirada/mercadoria/transferencia, que tem apenas a data
  // contabil. Venda tem data_venda e passa pelo mapa proprio abaixo.
  const simples = (itens: { id: string; descricao: string | null; data: string | null; valor: string | null }[]) =>
    itens.map((item) => ({
      id: item.id,
      descricao: item.descricao,
      data: item.data,
      dataHora: null,
      valor: numero(item.valor),
      sentido: null
    }));

  // Venda entra pelo LIQUIDO (valor_original e o subtotal): assim a soma do grupo bate com a
  // coluna Entradas da linha, que tambem soma liquido.
  const entradas = lancamentos.linhasVendas.map((item) => ({
    id: item.id,
    descricao: item.descricao,
    data: item.data,
    dataHora: serializarData(item.dataHora),
    valor: deCentavos(liquidoCentavos({ valorOriginal: item.valor, ...item })),
    sentido: null
  }));

  const somar = (itens: { valor: number }[]) => itens.reduce((soma, item) => soma + paraCentavos(item.valor), 0);

  // Mesma regra de calcularTotaisCaixaOperacionalRepository: entrada quando o dinheiro CAI na conta
  // do PDV, saida quando SAI dela — testes independentes. Uma transferencia entre duas contas que
  // nao sao a do PDV nao e nem uma nem outra (nao entra em nenhum dos dois totais); marcar como
  // "saida" faria o detalhe contradizer as colunas.
  const transferencias = lancamentos.linhasTransferencias.map((item) => ({
    id: item.id,
    descricao: item.descricao,
    data: item.data,
    dataHora: null,
    valor: numero(item.valor),
    sentido:
      item.contaDestinoId === pdvContaId
        ? ("entrada" as const)
        : item.contaOrigemId === pdvContaId
          ? ("saida" as const)
          : null
  }));

  // total_transferencias persistido e o LIQUIDO (entrada - saida); o total da categoria segue o
  // mesmo criterio, senao a soma do grupo nao bate com a coluna da linha.
  const liquidoTransferencias =
    somar(transferencias.filter((item) => item.sentido === "entrada")) -
    somar(transferencias.filter((item) => item.sentido === "saida"));

  const despesas = simples(lancamentos.linhasDespesas);
  const retiradas = simples(lancamentos.linhasRetiradas);
  const mercadorias = simples(lancamentos.linhasMercadorias);

  return [
    { categoria: "entradas", titulo: "Entradas", itens: entradas, total: deCentavos(somar(entradas)) },
    {
      categoria: "transferencias",
      titulo: "Transferencias (liquido)",
      itens: transferencias,
      total: deCentavos(liquidoTransferencias)
    },
    { categoria: "despesas", titulo: "Despesas", itens: despesas, total: deCentavos(somar(despesas)) },
    { categoria: "retiradas", titulo: "Retiradas", itens: retiradas, total: deCentavos(somar(retiradas)) },
    { categoria: "mercadorias", titulo: "Mercadorias", itens: mercadorias, total: deCentavos(somar(mercadorias)) }
  ];
}

// valores_antigos/novos sao jsonb livre: le so os horarios, tolerando registro antigo sem o campo.
function horariosAuditados(valores: DadosExternos) {
  const dados = z
    .object({
      dataHoraAbertura: z.union([z.string(), z.date()]).nullish(),
      dataHoraFechamento: z.union([z.string(), z.date()]).nullish()
    })
    .safeParse(valores);
  return {
    dataHoraAbertura: dados.success ? serializarData(dados.data.dataHoraAbertura ?? null) : null,
    dataHoraFechamento: dados.success ? serializarData(dados.data.dataHoraFechamento ?? null) : null
  };
}

export async function obterCaixaAbertoParaLancamento(empresaId: string, usuarioId: string, db?: ExecutorBanco) {
  const caixa = await buscarCaixaAbertoUsuarioRepository(empresaId, usuarioId, db);
  if (!caixa) throw new Error("Abra um caixa antes de registrar este lancamento");
  if (!caixa.pdvId || !caixa.pdvContaId) throw new Error("Caixa operacional invalido");
  return caixa;
}
