import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { MultipartFile } from "@fastify/multipart";
import { createHash } from "node:crypto";
import { basename } from "node:path";
import { readFile, unlink } from "node:fs/promises";
import type {
  AbrirCaixaPayload,
  CancelarPlanejamentoRetornoPayload,
  CaixaOperacional,
  CaixaStatus,
  CategoriaLancamentosCaixa,
  DetalheCaixaResponse,
  EntregaCofrePendente,
  FecharCaixaPayload,
  HistoricoCaixaQuery,
  LinhaHistoricoCaixa,
  PlanejamentoRetorno,
  ResumoCaixa,
  TotaisCaixaCentavos,
  TotaisHistoricoCaixa,
  TransferenciaCofrePayload,
  TransferenciasCaixaResponse
} from "@padaria/shared/caixa";
import { montarResumoCaixa, saldoCaixaCentavos, statusCaixaSchema } from "@padaria/shared/caixa";
import { diaNegocio } from "@padaria/shared/datas";
import type { DadosExternos, ResultadoPaginado } from "@padaria/shared/api";
import { podeLancarSemCaixa, temPermissao, type PerfilUsuario, type Permissao } from "@padaria/shared/autenticacao";
import { deCentavos, liquidoCentavos, paraCentavos } from "@padaria/shared/dinheiro";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { banco, executarEmTransacao, type ExecutorBanco, type TransacaoBanco } from "../banco/conexao.js";
import { ErroDominio } from "../erros.js";
import {
  atualizarFechamentoCaixaRepository,
  buscarCaixaAbertoUsuarioRepository,
  buscarCaixaPorIdRepository,
  buscarColaboradorPorUsuarioRepository,
  buscarContaCofreEmpresaRepository,
  buscarMaquininhaEmpresaRepository,
  buscarTransferenciaPorLacreAberturaRepository,
  travarPdvDaAberturaRepository,
  buscarAjusteCaixaRepository,
  buscarPerfilUsuarioCaixaRepository,
  buscarPdvEmpresaRepository,
  caixasComAjusteRepository,
  calcularTotaisCaixaOperacionalRepository,
  criarCaixaRepository,
  criarConferenciaFisicaTransferenciaRepository,
  criarAnexoFechamentoCaixaRepository,
  buscarAnexoFechamentoCaixaRepository,
  existeFolhaFechamentoCaixaRepository,
  listarAnexosFechamentoCaixaRepository,
  listarConferenciasFisicasCaixaRepository,
  confirmarTransferenciaAberturaRepository,
  vincularPlanejamentosDaTransferenciaAoCaixaRepository,
  buscarPlanejamentoRetornoRepository,
  buscarPlanejamentoRetornoPorIdRepository,
  cancelarPlanejamentoRetornoRepository,
  criarLacreRetornoRepository,
  criarQuebraCaixaRepository,
  criarTransferenciaCofreRepository,
  existeCaixaAbertoPdvRepository,
  existePeriodoCaixaRepository,
  existePlanejamentoRetornoAgendadoRepository,
  executarPlanejamentoRetornoRepository,
  listarEdicoesCaixaRepository,
  listarAlteracoesPosFechamentoRepository,
  listarHistoricoCaixaRepository,
  listarCaixasAbertosHistoricoRepository,
  listarLancamentosCaixaRepository,
  listarPlanejamentosRetornoRepository,
  caixasAlteradosPosFechamentoRepository,
  listarUsuariosTesourariaRepository,
  listarTransferenciasCaixaRepository,
  listarCaixasAbertosDaContaPdvRepository,
  proximaOrdemTransferenciaRepository,
  revincularVendasAoCaixaRepository,
  totaisHistoricoCaixaRepository,
  travarCaixaCompartilhadoRepository,
  travarCaixaRepository,
  buscarTransferenciaPorIdempotenciaRepository,
  listarCandidatosConfirmacaoRepository,
  type FiltrosHistoricoCaixa,
  type IntencaoEntregaCofre
} from "./caixa.repository.js";
import {
  listarRetornosPendentesRepository,
  ultimasRecusasPorTransferenciaRepository
} from "../transferencias/entrega-cofre.repository.js";
import { notificarCampanhasNaAberturaDeCaixa } from "../campanhas/campanhas.service.js";
import { materializarMensagensNaAberturaDeCaixa } from "../mensagens-admin/mensagens-admin.service.js";
import { criarNotificacoesRepository } from "../notificacoes/notificacoes.repository.js";
import { existeNumeroLacreRepository } from "../lacres/lacres.repository.js";
import { buscarPerfilUsuario } from "../auth/perfil.service.js";
import { caminhoAbsolutoDocumento, salvarFotoDocumento } from "../lancamentos/foto-documento.js";

const erroPeriodo = "A data e hora de abertura ja pertence a outro caixa aberto/fechado";
const erroOperadorComCaixaAberto = "Usuario do caixa ja possui um caixa aberto";
const indiceCaixaAbertoPdvUnico = "fechamentos_caixa_pdv_aberto_unico_idx";
const indiceCaixaAbertoOperadorUnico = "fechamentos_caixa_operador_aberto_unico_idx";

type CaixaLinha = NonNullable<Awaited<ReturnType<typeof buscarCaixaPorIdRepository>>>;

// Duas aberturas simultaneas do mesmo PDV podem passar pelos pre-checks; o indice unico
// parcial do banco decide o vencedor e o perdedor recebe o mesmo erro do caminho sequencial.
function indiceUnicoViolado(error: Error): string | undefined {
  const candidatos = [error, error.cause instanceof Error ? error.cause : null];
  for (const atual of candidatos) {
    if (!atual) continue;
    const detalhes = atual as Error & { code?: string; constraint?: string };
    if (detalhes.code === "23505") return detalhes.constraint;
  }
  return undefined;
}

function traduzirErroAberturaCaixa(error: Error): Error {
  const indice = indiceUnicoViolado(error);
  if (indice === indiceCaixaAbertoOperadorUnico) return new Error(erroOperadorComCaixaAberto);
  if (indice === indiceCaixaAbertoPdvUnico) return new Error(erroPeriodo);
  return error;
}

function gerarTokenEdicao() {
  return randomBytes(6).toString("hex").toUpperCase();
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

export async function salvarAnexoFechamentoCaixa(
  caixaId: string,
  tipo: "folha_fechamento" | "comprovante_cartao",
  arquivo: MultipartFile | undefined,
  perfil: PerfilUsuario
) {
  if (!arquivo) throw new Error("Arquivo obrigatorio");
  return executarEmTransacao(async (tx) => {
    if (!(await travarCaixaRepository(caixaId, tx))) throw new Error("Caixa nao encontrado");
    const caixa = await buscarCaixaPorIdRepository(caixaId, tx);
    if (!caixa || !podeAcessarEmpresa(perfil, caixa.empresaId)) throw new Error("Caixa nao encontrado");
    if (!podeOperarCaixa(perfil, caixa)) throw new Error("Caixa nao permitido");
    if (caixa.status !== "aberto") throw new Error("Caixa ja fechado");

    const salvo = await salvarFotoDocumento("fechamentos-caixa", `${caixa.empresaId}/${caixa.id}`, arquivo);
    const absoluto = caminhoAbsolutoDocumento(salvo.caminhoRelativo);
    try {
      const dados = await readFile(absoluto);
      return await criarAnexoFechamentoCaixaRepository(
        {
          empresaId: caixa.empresaId,
          fechamentoCaixaId: caixa.id,
          tipo,
          caminho: salvo.caminhoRelativo,
          nomeOriginal: arquivo.filename || "anexo",
          nomeArquivo: basename(salvo.caminhoRelativo),
          mimeType: salvo.mimeType,
          tamanhoBytes: dados.byteLength,
          sha256: createHash("sha256").update(dados).digest("hex"),
          criadoPor: perfil.usuarioId
        },
        tx
      );
    } catch (error) {
      await unlink(absoluto).catch(() => undefined);
      throw error;
    }
  });
}

async function obterCaixaParaAuditoria(caixaId: string, perfil: PerfilUsuario) {
  const caixa = await buscarCaixaPorIdRepository(caixaId);
  if (!caixa || !podeAcessarEmpresa(perfil, caixa.empresaId)) throw new Error("Caixa nao encontrado");
  return caixa;
}

export async function listarAnexosFechamentoCaixa(caixaId: string, perfil: PerfilUsuario) {
  const caixa = await obterCaixaParaAuditoria(caixaId, perfil);
  // O operador precisa reler as provas que acabou de anexar antes de fechar. A consulta continua
  // limitada ao caixa dele; Tesouraria e Gerência podem auditar qualquer caixa permitido.
  if (!podeOperarCaixa(perfil, caixa)) throw new Error("Caixa nao permitido");
  return listarAnexosFechamentoCaixaRepository(caixa.id, caixa.empresaId);
}

export async function listarConferenciasFisicasCaixa(caixaId: string, perfil: PerfilUsuario) {
  const caixa = await obterCaixaParaAuditoria(caixaId, perfil);
  if (!podeOperarCaixa(perfil, caixa)) throw new Error("Caixa nao permitido");
  const conferencias = await listarConferenciasFisicasCaixaRepository(caixa.id, caixa.empresaId);
  return conferencias.map((item) => ({
    ...item,
    valorEspecieDeclarado: numero(item.valorEspecieDeclarado),
    valorMoedasDeclarado: numero(item.valorMoedasDeclarado),
    valorEspecieContado: numero(item.valorEspecieContado),
    valorMoedasContado: numero(item.valorMoedasContado),
    conferidoEm: serializarData(item.conferidoEm) ?? ""
  }));
}

export async function obterArquivoAnexoFechamentoCaixa(caixaId: string, anexoId: string, perfil: PerfilUsuario) {
  const caixa = await obterCaixaParaAuditoria(caixaId, perfil);
  if (!podeOperarCaixa(perfil, caixa)) throw new Error("Caixa nao permitido");
  const anexo = await buscarAnexoFechamentoCaixaRepository(caixa.id, anexoId, caixa.empresaId);
  if (!anexo) throw new Error("Anexo nao encontrado");
  return { ...anexo, caminhoAbsoluto: caminhoAbsolutoDocumento(anexo.caminho) };
}

async function calcularTotaisCaixaCentavos(caixa: CaixaLinha, db?: ExecutorBanco): Promise<TotaisCaixaCentavos> {
  if (!caixa.pdvContaId) throw new Error("PDV sem conta vinculada");
  return calcularTotaisCaixaOperacionalRepository(caixa.id, caixa.pdvContaId, db);
}

// Anexa as vendas integradas orfas que chegaram desde a abertura registrada pelo servidor. Nunca
// move venda de outro caixa nem venda manual â€” ver revincularVendasAoCaixaRepository.
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

// G1/R-171 Â· a UNICA porta que monta o status de um caixa aberto.
//
// Existia como o mesmo literal repetido em oito lugares. Com um campo a mais â€” as entregas que
// travam o fechamento â€” repetir viraria dividir: bastaria uma rota esquecer o campo para a tela
// mostrar "pode fechar" sobre um caixa que a API recusa. Aqui isso nao tem como acontecer.
async function statusDoCaixaAberto(caixa: CaixaLinha, db?: ExecutorBanco): Promise<CaixaStatus> {
  return {
    caixaAberto: serializarCaixa(caixa),
    resumo: await calcularResumoCaixaOperacional(caixa, db),
    entregasPendentes: await entregasPendentesDoCaixa(caixa.id, db),
    planejamentosPendentes: serializarPlanejamentos(await listarPlanejamentosRetornoRepository(caixa.id, db))
  };
}

function serializarPlanejamentos(
  linhas: Array<{
    id: string;
    tipo: string;
    valorOriginal: string;
    nLacreDoc: string | null;
    contaDestinoId: string;
    contaDestinoNome: string;
    observacao: string | null;
    criadoEm: Date | null;
  }>
): PlanejamentoRetorno[] {
  return linhas.map((linha) => ({
    id: linha.id,
    tipo: "retorno",
    valor: deCentavos(paraCentavos(linha.valorOriginal)),
    lacre: linha.nLacreDoc ?? "",
    contaDestinoId: linha.contaDestinoId,
    contaDestinoNome: linha.contaDestinoNome,
    observacao: linha.observacao,
    criadoEm: linha.criadoEm?.toISOString() ?? new Date(0).toISOString()
  }));
}

// R-183 Â· a lista que a tela recebe carrega tambem o que o cofre JA CONTOU, quando ja contou.
// Sao duas situacoes muito diferentes que a tela precisa distinguir: entrega sem recusa trava o
// fechamento e nao tem saida nenhuma; entrega ja recusada trava tambem, mas a saida existe e esta
// no cofre. Sem o numero, o operador leria "travado" nos dois casos.
async function entregasPendentesDoCaixa(caixaId: string, db?: ExecutorBanco): Promise<EntregaCofrePendente[]> {
  const linhas = await listarRetornosPendentesRepository(caixaId, db);
  const ultimas = await ultimasRecusasPorTransferenciaRepository(
    linhas.map((linha) => linha.id),
    db
  );
  return serializarEntregasPendentes(linhas, ultimas);
}

function serializarEntregasPendentes(
  linhas: Array<{
    id: string;
    tipo: string;
    valorCentavos: number;
    lacre: string | null;
    contaDestinoNome: string;
    criadoEm: Date | null;
  }>,
  ultimas: Map<string, { id: string; valorInformadoCentavos: number | null }> = new Map()
): EntregaCofrePendente[] {
  return linhas.map((linha) => {
    const recusa = ultimas.get(linha.id);
    return {
      id: linha.id,
      tipo: "retorno",
      valor: deCentavos(linha.valorCentavos),
      lacre: linha.lacre,
      contaDestinoNome: linha.contaDestinoNome,
      criadoEm: serializarData(linha.criadoEm) ?? "",
      // R-183 Â· recusa SEM contagem vale zero contado, e nao "nao contou": e a leitura oficial do
      // "lacre violado, nao abro" â€” o cofre nao recebe credito e o declarado inteiro vira quebra.
      valorContado: recusa ? deCentavos(recusa.valorInformadoCentavos ?? 0) : null,
      recusaId: recusa?.id ?? null
    };
  });
}

// A recusa precisa dizer QUAL entrega trava. "Nao pode fechar" sozinho manda o operador adivinhar
// entre as entregas do turno â€” e, no fim do expediente, adivinhar vira ligar para a Tesouraria.
function mensagemEntregasPendentes(entregas: EntregaCofrePendente[]): string {
  const VISIVEIS = 3;
  const descritas = entregas.slice(0, VISIVEIS).map((entrega) => {
    const nome = "Retorno";
    const lacre = entrega.lacre ? `, lacre ${entrega.lacre}` : "";
    return `${nome} de R$ ${entrega.valor.toFixed(2)} para ${entrega.contaDestinoNome}${lacre}`;
  });
  const excedente = entregas.length - descritas.length;
  if (excedente > 0) descritas.push(`e mais ${excedente}`);
  // R-183 Â· a saida depende de ja terem contado, e a tela ja diz isso antes do clique. Mandar
  // "confira no cofre" para quem ja conferiu seria o servidor contradizendo a propria tela â€” e o
  // operador ligando para a pessoa errada no fim do turno.
  const jaContadas = entregas.some((entrega) => entrega.valorContado !== null);
  const saida = jaContadas
    ? "a conta destino ja contou e precisa encerrar a divergencia antes de fechar o caixa"
    : "a conta destino precisa conferir antes de fechar o caixa";
  return `Transferencia de retorno aguardando conferencia (${descritas.join("; ")}): ${saida}`;
}

export async function obterStatusCaixa(empresaId: string, perfil: PerfilUsuario): Promise<CaixaStatus> {
  if (!podeAcessarEmpresa(perfil, empresaId)) throw new Error("Empresa nao permitida");
  return executarEmTransacao(async (tx) => {
    const caixa = await buscarCaixaAbertoUsuarioRepository(empresaId, perfil.usuarioId, tx);
    // Sem caixa aberto nao ha o que travar: lista VAZIA, nunca ausente.
    if (!caixa) return { caixaAberto: null, resumo: null, entregasPendentes: [], planejamentosPendentes: [] };

    // O CREARE pode importar uma venda depois da abertura. O refresh de um minuto
    // precisa anexar essas vendas ao caixa antes de calcular os cards de pagamento.
    await revincularVendasAoCaixa(caixa, tx);
    const atualizado = await buscarCaixaPorIdRepository(caixa.id, tx);
    if (!atualizado) throw new Error("Caixa aberto nao encontrado");
    return statusDoCaixaAberto(atualizado, tx);
  });
}

export interface EscopoListagemCaixa {
  bloquear: boolean;
  caixaId: string | undefined;
  // Dia CONTABIL do caixa aberto. So a tela de Entradas usa (D7): la o escopo e o DIA, nao o caixa
  // â€” ver resolverEscopoEntradasDoDia.
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
 * que ela lista passa a ser o DIA do caixa â€” nao o caixa.
 *
 * O motivo e concreto: a venda integrada do CREARE so recebe caixa_id quando existe um caixa aberto
 * NAQUELE PDV no instante da venda (integracoes.service). A venda da madrugada, a de antes da
 * abertura e a de PDV sem caixa ficam com caixa_id NULL â€” e sob o filtro por caixa elas sumiam
 * justamente da tela do operador, que e quem precisa conferir o dia.
 */
export async function resolverEscopoEntradasDoDia(
  perfil: PerfilUsuario | undefined,
  empresaId: string | undefined,
  caixaIdSolicitado: string | undefined
): Promise<EscopoListagemCaixa> {
  const exigeCaixaAberto = Boolean(perfil) && temPermissao(perfil?.permissoes, "menu_entradas_somente_caixa_aberto");
  // Sem a flag (gestao/retaguarda): nada muda â€” segue livre, com filtro opcional por caixa e as
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
  // R-184: o instante nasce no servidor. Aceitar um horario do navegador permitiria ao operador
  // abrir o Caixa fora da janela real do CREARE e mudaria quais vendas pertencem ao turno.
  const dataHoraAbertura = new Date();

  try {
    return await abrirCaixaEmTransacao(dados, perfil, dataHoraAbertura);
  } catch (error) {
    if (error instanceof Error) throw traduzirErroAberturaCaixa(error);
    throw error;
  }
}

// R-040: abrir o caixa informando o lacre E o ato de confirmar o recebimento da transferencia.
// Esta funcao so RESOLVE e valida (leitura) â€” a confirmacao atomica acontece depois, ja com o
// caixa criado, para que a disputa (R-030) seja decidida pelo banco e nao por leitura otimista.
type AberturaPorLacre = {
  transferenciaId: string;
  lacreId: string;
  numeroLacre: string;
  valorCentavos: number;
  valorEspecieDeclaradoCentavos: number;
  valorMoedasDeclaradoCentavos: number;
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
  if (achado.lacreRompido) throw new Error("Lacre ja rompido - nao pode ser reutilizado");
  if (achado.status === "agendada") throw new Error("Transferencia agendada ainda nao foi liberada");
  if (achado.status !== "pendente") throw new Error("Transferencia deste lacre nao esta pendente de recebimento");
  // S4 (R-164): transferencia ja vinculada a um caixa tem a saida CONTADA la â€” reivindica-la de
  // outro caixa migraria o movimento em silencio e tiraria a saida dos totais do primeiro.
  if (achado.caixaId) throw new Error("Transferencia deste lacre ja pertence a outro caixa");
  // R-030: so um dos destinos CANDIDATOS pode reivindicar. Caixa fora da lista nao disputa.
  if (!achado.candidatoId) throw new Error("A conta deste caixa não é destino desta transferência");
  // R-028: quem envia nao confirma o proprio envio.
  if (achado.criadoPor === usuarioId) throw new Error("Quem enviou a transferencia nao pode confirmar o recebimento");
  if (achado.contaOrigemId === contaCaixaId) throw new Error("Conta de origem nao pode ser a mesma do caixa");

  const valorCentavos = paraCentavos(achado.valorOriginal);
  if (achado.valorEspecieDeclarado === null || achado.valorMoedasDeclarado === null) {
    throw new Error("Transferencia do malote sem composicao de especie e moedas");
  }
  return {
    transferenciaId: achado.transferenciaId,
    lacreId: achado.lacreId,
    numeroLacre,
    valorCentavos,
    valorEspecieDeclaradoCentavos: paraCentavos(achado.valorEspecieDeclarado),
    valorMoedasDeclaradoCentavos: paraCentavos(achado.valorMoedasDeclarado)
  };
}

// Leitura previa para o operador conferir o malote antes de consumi-lo na abertura. Nao muda
// transferencia, lacre ou saldo; a confirmacao atomica continua exclusivamente em abrirCaixa.
export async function consultarMaloteParaAbertura(
  empresaId: string,
  pdvId: string,
  lacre: string,
  perfil: PerfilUsuario
) {
  if (!podeAcessarEmpresa(perfil, empresaId)) throw new Error("Empresa nao permitida");
  const pdv = await buscarPdvEmpresaRepository(pdvId, empresaId);
  if (!pdv?.contaId) throw new Error("PDV sem conta vinculada");
  const abertura = await prepararAberturaPorLacre(empresaId, lacre.trim(), pdv.contaId, perfil.usuarioId, banco);
  return {
    valor: deCentavos(abertura.valorCentavos),
    valorEspecieDeclarado: deCentavos(abertura.valorEspecieDeclaradoCentavos),
    valorMoedasDeclarado: deCentavos(abertura.valorMoedasDeclaradoCentavos),
    lacre: abertura.numeroLacre
  };
}

async function abrirCaixaEmTransacao(
  dados: AbrirCaixaPayload,
  perfil: PerfilUsuario,
  dataHoraAbertura: Date
): Promise<CaixaStatus> {
  return executarEmTransacao(async (tx) => {
    // S3 (R-164): PRIMEIRO lock da abertura. Sem ele a conta do PDV era um retrato pre-lock â€” um
    // `PUT /api/pdvs/:id` que commitasse durante a abertura deixava o fundo do lacre confirmado na
    // conta ANTIGA de um PDV que ja apontava para outra (dinheiro fora dos sete totais). Travado,
    // quem chega durante a troca espera e decide pela conta ATUAL.
    const pdv = await travarPdvDaAberturaRepository(dados.pdvId, dados.empresaId, tx);
    if (!pdv || !pdv.ativo) throw new Error("PDV nao encontrado");
    if (!pdv.contaId) throw new Error("PDV sem conta vinculada");
    const usuarioCaixa = await buscarPerfilUsuarioCaixaRepository(dados.usuarioCaixaId, tx);
    if (!usuarioCaixa) throw new Error("Usuario do caixa nao encontrado");
    const colaborador = await buscarColaboradorPorUsuarioRepository(dados.usuarioCaixaId, dados.empresaId, tx);
    if (!colaborador) throw new Error("Usuario do caixa precisa estar vinculado a colaborador da empresa");
    // Um operador representa uma unica gaveta sob responsabilidade. Sem esta guarda, o status
    // escolhia o caixa aberto mais recente e, ao fecha-lo, parecia "abrir" silenciosamente outro
    // caixa antigo do mesmo usuario. O indice parcial no banco e a barreira contra concorrencia;
    // esta leitura antecipa uma mensagem operacional clara no fluxo comum.
    if (await buscarCaixaAbertoUsuarioRepository(dados.empresaId, dados.usuarioCaixaId, tx)) {
      throw new Error(erroOperadorComCaixaAberto);
    }
    if (await existeCaixaAbertoPdvRepository(dados.pdvId, undefined, tx)) throw new Error(erroPeriodo);
    if (await existePeriodoCaixaRepository(dados.pdvId, dataHoraAbertura, undefined, tx)) throw new Error(erroPeriodo);
    if (dados.maquininhaId && !(await buscarMaquininhaEmpresaRepository(dados.maquininhaId, dados.empresaId, tx))) {
      throw new Error("Maquininha nao encontrada ou inativa");
    }

    // R-040: o lacre e opcional (R-033 â€” sem lacre o caixa abre zerado e o fundo chega depois).
    // Informado, ele identifica a transferencia pendente que este caixa vai reivindicar.
    const lacreInformado = dados.lacreAbertura.trim();
    const abertura = await prepararAberturaPorLacre(dados.empresaId, lacreInformado, pdv.contaId, perfil.usuarioId, tx);

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
        lacreAbertura: abertura.numeroLacre,
        caixaResponsavelNomeAbertura: dados.caixaResponsavelNome.trim(),
        supervisorResponsavelNomeAbertura: dados.supervisorResponsavelNome.trim(),
        maquininhaId: dados.maquininhaId ?? null
      },
      tx
    );

    // R-040 na MESMA transacao: vence a disputa (R-030), preenche data_recebimento/confirmado_por
    // (R-028), leva o dinheiro para ESTE caixa (R-036) e rompe o lacre (R-027). Perder a disputa
    // derruba a abertura inteira â€” nao existe caixa aberto com transferencia ainda pendente.
    {
      const valorEspecieContadoCentavos = paraCentavos(dados.valorEspecieContado);
      const valorMoedasContadoCentavos = paraCentavos(dados.valorMoedasContado);
      const valorContadoCentavos = valorEspecieContadoCentavos + valorMoedasContadoCentavos;
      const convergente =
        abertura.valorEspecieDeclaradoCentavos === valorEspecieContadoCentavos &&
        abertura.valorMoedasDeclaradoCentavos === valorMoedasContadoCentavos;
      if (!convergente && !dados.observacaoDivergencia?.trim()) {
        throw new Error("Observacao obrigatoria quando a conferencia do malote divergir");
      }
      const confirmada = await confirmarTransferenciaAberturaRepository(
        {
          transferenciaId: abertura.transferenciaId,
          lacreId: abertura.lacreId,
          contaCaixaId: pdv.contaId,
          caixaId: caixa.id,
          usuarioId: perfil.usuarioId,
          valorRecebidoCentavos: valorContadoCentavos,
          agora: new Date()
        },
        tx
      );
      if (!confirmada) throw new Error("Lacre ja utilizado por outro caixa");
      const conferencia = await criarConferenciaFisicaTransferenciaRepository(
        {
          empresaId: dados.empresaId,
          transferenciaId: abertura.transferenciaId,
          fechamentoCaixaId: caixa.id,
          etapa: "abertura",
          resultado: convergente ? "convergente" : "divergente",
          encerraConferencia: true,
          valorEspecieDeclaradoCentavos: abertura.valorEspecieDeclaradoCentavos,
          valorMoedasDeclaradoCentavos: abertura.valorMoedasDeclaradoCentavos,
          valorEspecieContadoCentavos,
          valorMoedasContadoCentavos,
          observacao: convergente ? null : dados.observacaoDivergencia!.trim(),
          conferidoPor: perfil.usuarioId,
          conferidoEm: dataHoraAbertura
        },
        tx
      );
      if (!convergente) {
        const destinatarios = (await listarUsuariosTesourariaRepository(dados.empresaId, tx))
          .map((item) => item.usuarioId)
          .filter((usuarioId): usuarioId is string => Boolean(usuarioId));
        await criarNotificacoesRepository(
          {
            empresaId: dados.empresaId,
            tipo: "quebra_caixa",
            destinatariosUsuarioIds: destinatarios,
            referenciaId: conferencia.id,
            titulo: "Divergencia na abertura do caixa",
            valorCentavos: valorContadoCentavos - abertura.valorCentavos
          },
          tx
        );
      }
      await vincularPlanejamentosDaTransferenciaAoCaixaRepository(
        {
          transferenciaOrigemId: abertura.transferenciaId,
          caixaId: caixa.id,
          empresaId: dados.empresaId,
          agora: dataHoraAbertura
        },
        tx
      );
    }

    const aberto = await buscarCaixaPorIdRepository(caixa.id, tx);
    if (!aberto) throw new Error("Caixa nao encontrado apos abertura");
    // Abertura e auditavel pelo relogio do servidor; por enquanto so puxa vendas posteriores a ela.
    await revincularVendasAoCaixa(aberto, tx);

    // R-195/R-196: quem abre caixa agora pode ser destinatario de mensagem enviada antes, e quem ja
    // tinha entrega SEM pdv passa a ter o PDV registrado nela. As duas metades sao idempotentes e
    // rodam na transacao da abertura. Uma mensagem administrativa nunca pode impedir a padaria de
    // abrir o caixa: falha aqui e registrada e engolida.
    try {
      await materializarMensagensNaAberturaDeCaixa(
        {
          empresaId: dados.empresaId,
          usuarioId: dados.usuarioCaixaId,
          pdvId: dados.pdvId,
          fechamentoCaixaId: caixa.id
        },
        tx
      );
    } catch (erroMensagens) {
      console.error("[caixa] falha ao materializar mensagens administrativas na abertura", erroMensagens);
    }

    // Campanha tambem e informativa: uma falha ao criar seu sino nunca pode impedir a abertura nem
    // misturar-se ao fluxo financeiro. Diferente da mensagem administrativa, a elegibilidade vem
    // diretamente dos PDVs persistidos na campanha e do dia contabil desta abertura.
    try {
      await notificarCampanhasNaAberturaDeCaixa(
        {
          empresaId: dados.empresaId,
          pdvId: dados.pdvId,
          usuarioId: dados.usuarioCaixaId,
          dia: diaNegocio(dataHoraAbertura)
        },
        tx
      );
    } catch (erroCampanhas) {
      console.error("[caixa] falha ao notificar campanhas na abertura", erroCampanhas);
    }

    return statusDoCaixaAberto(aberto, tx);
  });
}

export async function fecharCaixa(caixaId: string, dados: FecharCaixaPayload, perfil: PerfilUsuario) {
  return executarEmTransacao(async (tx) => {
    // B1: trava a linha antes de decidir. Dois fechamentos concorrentes deixam de correr juntos â€”
    // o segundo espera aqui e, ao passar, ja le 'fechado'. A guarda no UPDATE (abaixo) e a segunda
    // barreira, para o caso de a trava ser contornada por outro caminho.
    if (!(await travarCaixaRepository(caixaId, tx))) throw new Error("Caixa nao encontrado");

    const caixa = await buscarCaixaPorIdRepository(caixaId, tx);
    if (!caixa || !podeAcessarEmpresa(perfil, caixa.empresaId)) throw new Error("Caixa nao encontrado");
    if (!podeOperarCaixa(perfil, caixa)) throw new Error("Caixa nao permitido");
    if (caixa.status !== "aberto") throw new Error("Caixa ja fechado");
    if (!(await existeFolhaFechamentoCaixaRepository(caixa.id, caixa.empresaId, tx))) {
      throw new Error("Anexe ao menos uma foto da folha de fechamento antes de fechar o caixa");
    }
    const dataHoraFechamento = new Date();
    if (caixa.dataHoraAbertura && dataHoraFechamento <= new Date(caixa.dataHoraAbertura)) {
      throw new Error("Fechamento precisa ser posterior a abertura");
    }

    // G1/R-171 Â· dinheiro que JA SAIU trava o fechamento comum.
    //
    // R-185/R-187 · o painel paralelo foi removido, mas o planejamento atomico voltou dentro da
    // transferencia inicial. A linha `agendada` nao move saldo e trava ate ser executada ou cancelada.
    //
    // O retorno executado e ainda nao conferido na conta destino tambem trava. Antes da Fatia 1 o
    // caixa fechava por cima dele e uma divergencia posterior ficava sem turno aberto onde cair.
    //
    // Lida DEPOIS da trava e ANTES do retorno final (D6/D7), entao o proprio ato do fechamento nao
    // se auto-bloqueia. Corrida: a linha do caixa ja esta em FOR UPDATE aqui e `confirmarTransferencia`
    // pede FOR SHARE na MESMA linha antes de mudar o status â€” as duas serializam, e este SELECT
    // nunca decide sobre um retrato velho.
    //
    // Escopo: somente movimentos do processo de retorno, novos (`retorno`) ou historicos
    // (`sangria`), vinculados a este Caixa. Transferencia generica pendente nao entra.
    if (await existePlanejamentoRetornoAgendadoRepository(caixa.id, tx)) {
      throw new Error("Existem transferencias de retorno planejadas: execute ou cancele antes de fechar o caixa");
    }
    const entregasPendentes = await entregasPendentesDoCaixa(caixa.id, tx);
    if (entregasPendentes.length) throw new Error(mensagemEntregasPendentes(entregasPendentes));

    let totais = await calcularTotaisCaixaCentavos(caixa, tx);
    const valorFisicoEsperadoCentavos = saldoCaixaCentavos(totais);
    const valorEspecieFechamentoCentavos = paraCentavos(dados.valorEspecieFechamento);
    const valorMoedasFechamentoCentavos = paraCentavos(dados.valorMoedasFechamento);
    const valorFisicoContadoCentavos = valorEspecieFechamentoCentavos + valorMoedasFechamentoCentavos;
    const diferencaFisicaCentavos = valorFisicoContadoCentavos - valorFisicoEsperadoCentavos;
    const observacao = dados.observacao?.trim() || null;
    if (diferencaFisicaCentavos !== 0 && !observacao) {
      throw new Error("Observacao obrigatoria quando a contagem fisica do fechamento divergir");
    }

    // D6/D7: a sobra NUNCA vira quebra positiva e nunca exige um segundo botao. O retorno final
    // sai aqui, no MESMO ato e na MESMA transacao do fechamento: se qualquer parte falhar depois,
    // este INSERT cai junto no rollback. Se o saldo ja estiver zero (retornos parciais durante o
    // turno), nada e criado e a mesma acao apenas fecha.
    if (valorFisicoContadoCentavos > 0) {
      if (!caixa.pdvContaId) throw new Error("Caixa operacional invalido");
      // Decisao 7: o retorno final TAMBEM entrega dinheiro fisico, entao exige responsavel no
      // cofre. A checagem fica DENTRO deste `if` de proposito: fechamento sem sobra nao gera
      // entrega nenhuma e nao pode ser bloqueado por falta de quem conferir.
      await exigirConfirmadorDoCofre(caixa.empresaId, perfil.usuarioId, tx);
      await registrarEntregaAoCofre(
        {
          caixa: { ...caixa, pdvContaId: caixa.pdvContaId },
          valorCentavos: valorFisicoContadoCentavos,
          valorEspecieCentavos: valorEspecieFechamentoCentavos,
          valorMoedasCentavos: valorMoedasFechamentoCentavos,
          lacre: null,
          observacao: dados.observacao ?? null,
          criadoPor: perfil.usuarioId,
          // D6/B2: sem chave de proposito. Este ato ja e irrepetivel por construcao â€” roda sob a
          // trava da linha do caixa e o UPDATE so acerta caixa 'aberto', entao um retry encontra o
          // caixa fechado e nao chega ate aqui.
          idempotenciaChave: null
        },
        tx
      );
      totais = await calcularTotaisCaixaCentavos(caixa, tx);
      const saldoDepoisDoRetornoCentavos = saldoCaixaCentavos(totais);
      if (saldoDepoisDoRetornoCentavos !== -diferencaFisicaCentavos)
        throw new Error("Retorno final nao conferiu com a contagem fisica");
    }

    if (diferencaFisicaCentavos < 0) {
      if (!caixa.usuarioCaixaId) throw new Error("Caixa sem usuario responsavel");
      const quebra = await criarQuebraCaixaRepository(
        {
          empresaId: caixa.empresaId,
          fechamentoCaixaId: caixa.id,
          usuarioId: caixa.usuarioCaixaId,
          valorCentavos: diferencaFisicaCentavos,
          observacao: observacao!
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
          valorCentavos: diferencaFisicaCentavos
        },
        tx
      );
    }
    if (diferencaFisicaCentavos > 0) {
      const destinatarios = (await listarUsuariosTesourariaRepository(caixa.empresaId, tx))
        .map((item) => item.usuarioId)
        .filter((usuarioId): usuarioId is string => Boolean(usuarioId));
      await criarNotificacoesRepository(
        {
          empresaId: caixa.empresaId,
          tipo: "transferencia_divergencia",
          destinatariosUsuarioIds: destinatarios,
          referenciaId: caixa.id,
          titulo: `Sobra na conferencia de fechamento - ${caixa.usuarioCaixaNome ?? "Usuario"}`,
          valorCentavos: diferencaFisicaCentavos
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
        lacreFechamento: dados.lacreFechamento,
        caixaResponsavelNomeFechamento: dados.caixaResponsavelNome.trim(),
        supervisorResponsavelNomeFechamento: dados.supervisorResponsavelNome.trim(),
        totais,
        saldoCentavos: 0,
        valorFisicoEsperadoCentavos,
        valorEspecieFechamentoCentavos,
        valorMoedasFechamentoCentavos
      },
      tx
    );
    // B1: o UPDATE so acerta caixa 'aberto'. Zero linhas significa que outro fechamento venceu a
    // corrida â€” erro de dominio (400), nunca 500 por violacao de UNIQUE da quebra.
    if (linhasFechadas === 0) throw new Error("Caixa ja fechado");

    return { caixaAberto: null, resumo: null, entregasPendentes: [], planejamentosPendentes: [] } satisfies CaixaStatus;
  });
}

// B2: duas requisicoes com a MESMA chave so podem ser o mesmo ato. Se qualquer parte da intencao
// mudou, o cliente reaproveitou a chave para outra coisa â€” e devolver "ok" ali seria engolir uma
// entrega de dinheiro em silencio. Por isso o conflito e explicito, e nao um 200 conveniente.
function conferirIntencaoEntrega(
  existente: IntencaoEntregaCofre,
  pretendida: {
    caixaId: string;
    tipo: string;
    valorCentavos: number;
    valorEspecieCentavos: number;
    valorMoedasCentavos: number;
    lacre: string | null;
    observacao: string | null;
  }
): void {
  // O lacre faz parte da intencao porque na entrega ao cofre ele existe DESDE A CRIACAO. O `status`
  // nunca entra: ele muda por atos posteriores (conferencia, divergencia) e nao descreve o que foi
  // pedido â€” compara-lo faria um retry legitimo responder 409 depois que o cofre agisse.
  const divergencias: string[] = [];
  if (existente.caixaId !== pretendida.caixaId) divergencias.push("caixa");
  const tipoExistente = existente.tipo === "sangria" ? "retorno" : existente.tipo;
  if (tipoExistente !== pretendida.tipo) divergencias.push("tipo");
  if (existente.valorCentavos !== pretendida.valorCentavos) divergencias.push("valor");
  if (existente.valorEspecieCentavos !== pretendida.valorEspecieCentavos) divergencias.push("especie");
  if (existente.valorMoedasCentavos !== pretendida.valorMoedasCentavos) divergencias.push("moedas");
  if ((existente.lacre ?? null) !== pretendida.lacre) divergencias.push("lacre");
  if ((existente.observacao ?? null) !== pretendida.observacao) divergencias.push("observacao");
  if (divergencias.length > 0) {
    throw new ErroDominio(
      `Chave de idempotencia ja usada para outra intencao (${divergencias.join(", ")})`,
      409,
      "IDEMPOTENCIA_CONFLITO"
    );
  }
}

// Decisao 7 Â· sem CONFIRMADOR ELEGIVEL no Cofre, o dinheiro nao sai.
//
// A entrega ao cofre nasce `pendente` e so vira dinheiro no cofre quando alguem conferir
// (R-028/R-036). Se ninguem PODE conferir, a entrega fica pendente para sempre: ja saiu do caixa e
// nunca entra no cofre. Some do sistema.
//
// "Poder conferir" sao tres coisas juntas, e checar so o vinculo era insuficiente â€” o gate liberava
// a entrega e a confirmacao depois se revelava impossivel:
//   1. estar vinculado a conta do cofre da empresa (`contas_usuarios`);
//   2. nao ser quem criou/executou o movimento (R-028), exceto Tesouraria (R-189);
//   3. ter `transferencias_conferir` na permissao EFETIVA (setor + cargos + usuario).
//
// A (3) e resolvida aqui, e nao no SQL, para usar exatamente a mesma resolucao do guard das rotas.
// Duas regras de permissao para a mesma pergunta divergem no primeiro ajuste.
async function existeConfirmadorElegivel(
  input: { contaId: string; empresaId: string; excluirUsuariosIds: string[] },
  tx: ExecutorBanco
): Promise<boolean> {
  const excluidos = new Set(input.excluirUsuariosIds);
  const candidatos = await listarCandidatosConfirmacaoRepository(
    { contaId: input.contaId, empresaId: input.empresaId },
    tx
  );
  for (const usuarioId of candidatos) {
    const perfil = await buscarPerfilUsuario(usuarioId);
    if (!perfil || !temPermissao(perfil.permissoes, "transferencias_conferir")) continue;
    const ehTesouraria = perfil.cargos.some((cargo) =>
      cargo.nome
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/gu, "")
        .trim()
        .toLowerCase()
        .startsWith("tesouraria")
    );
    if (!excluidos.has(usuarioId) || ehTesouraria) return true;
  }
  return false;
}

// Bloqueio ANTES do ato, valendo para os dois atos que entregam dinheiro: a entrega avulsa do turno
// e o retorno final do fechamento. O fechamento SEM retorno fisico nao e bloqueado â€” nao ha entrega,
// entao nao ha o que conferir.
//
// `criadoPor` e quem VAI criar o movimento: se o unico vinculado ao cofre for ele mesmo, nao existe
// confirmador â€” e e melhor descobrir isso agora do que com o dinheiro fora do caixa.
//
// R-179/Fatia 3 Â· o parametro era uma LISTA de impedidos porque na solicitacao D4 quem programava e
// quem entregava eram pessoas diferentes, e as duas ficavam fora da conferencia (R-028). Com um
// unico caminho de entrega existe um unico autor. Quem continua lendo `executado_por` e a
// conferencia, para as linhas HISTORICAS que nasceram do fluxo antigo.
async function exigirConfirmadorDoCofre(empresaId: string, criadoPor: string, tx: ExecutorBanco): Promise<void> {
  const contaCofreId = await buscarContaCofreEmpresaRepository(empresaId, tx);
  if (!contaCofreId) throw new Error("Empresa sem conta de cofre configurada para transferencia ao cofre");
  await exigirConfirmadorDaConta(contaCofreId, empresaId, [criadoPor], tx, "Conta do cofre");
}

async function exigirConfirmadorDaConta(
  contaId: string,
  empresaId: string,
  excluirUsuariosIds: string[],
  tx: ExecutorBanco,
  nomeDaConta = "Conta de destino"
): Promise<void> {
  if (!(await existeConfirmadorElegivel({ contaId, empresaId, excluirUsuariosIds }, tx))) {
    throw new Error(`${nomeDaConta} sem responsavel elegivel para conferir a transferencia de retorno`);
  }
}

// D5/D9/R-179: cada entrega fisica ao cofre e um movimento IMUTAVEL, com valor e lacre proprios.
// Este e o UNICO lugar do sistema que cria a transferencia caixa -> cofre â€” a sangria do turno, o
// retorno avulso e o retorno final do fechamento passam todos por aqui. Corrigir um valor nunca
// edita um movimento ja feito: gera um segundo movimento, com outro lacre.
async function registrarEntregaAoCofre(
  input: {
    caixa: { id: string; empresaId: string; pdvContaId: string; dataMovimento: string | null };
    valorCentavos: number;
    valorEspecieCentavos: number;
    valorMoedasCentavos: number;
    lacre: string | null;
    observacao: string | null;
    criadoPor: string;
    // B2: null SOMENTE no retorno final do fechamento (D6) â€” la a trava da linha do caixa e a
    // guarda `status = 'aberto'` do UPDATE ja tornam o ato irrepetivel, e o valor e a sobra inteira.
    idempotenciaChave: string | null;
  },
  tx: ExecutorBanco
): Promise<{ id: string; duplicada: boolean }> {
  const lacre = input.lacre?.trim() || null;
  const observacao = input.observacao?.trim() || null;
  const intencao = {
    caixaId: input.caixa.id,
    tipo: "retorno",
    valorCentavos: input.valorCentavos,
    valorEspecieCentavos: input.valorEspecieCentavos,
    valorMoedasCentavos: input.valorMoedasCentavos,
    lacre,
    observacao
  };

  // B2: a idempotencia e resolvida ANTES da unicidade do lacre, e a ordem importa. Um retry
  // carrega o MESMO lacre; se a checagem do lacre viesse primeiro, o retry morreria com
  // "Lacre ja utilizado em outro movimento" â€” mensagem errada para um ato que ja deu certo, e que
  // levaria o operador a lancar de novo com outro lacre, duplicando a entrega.
  if (input.idempotenciaChave) {
    const existente = await buscarTransferenciaPorIdempotenciaRepository(
      input.caixa.empresaId,
      input.idempotenciaChave,
      tx
    );
    if (existente) {
      conferirIntencaoEntrega(existente, intencao);
      return { id: existente.id, duplicada: true };
    }
  }

  // Regra 5: destino = conta do cofre mapeada na empresa (sem inventar).
  const contaCofreId = await buscarContaCofreEmpresaRepository(input.caixa.empresaId, tx);
  if (!contaCofreId) throw new Error("Empresa sem conta de cofre configurada para transferencia ao cofre");
  if (contaCofreId === input.caixa.pdvContaId) throw new Error("Conta de cofre nao pode ser a mesma do caixa");

  // Lacre da VOLTA (R-026: opcional; R-027: numero novo, nunca reutilizado). Digitado pelo
  // operador como na ida â€” nao existe mais estoque de malote para "escolher".
  if (lacre && (await existeNumeroLacreRepository(input.caixa.empresaId, lacre, tx))) {
    throw new Error("Lacre ja utilizado em outro movimento");
  }

  const ordem = await proximaOrdemTransferenciaRepository(input.caixa.id, "retorno", tx);
  const transferencia = await criarTransferenciaCofreRepository(
    {
      empresaId: input.caixa.empresaId,
      caixaId: input.caixa.id,
      contaCaixaId: input.caixa.pdvContaId,
      contaCofreId,
      valorCentavos: input.valorCentavos,
      valorEspecieCentavos: input.valorEspecieCentavos,
      valorMoedasCentavos: input.valorMoedasCentavos,
      ordem,
      dataReferencia: input.caixa.dataMovimento ?? diaNegocio(new Date()),
      dataTransferencia: diaNegocio(new Date()),
      nLacreDoc: lacre,
      descricao: "Transferencia de retorno",
      observacao,
      criadoPor: input.criadoPor,
      idempotenciaChave: input.idempotenciaChave
    },
    tx
  );

  // B2: DO NOTHING nao inseriu â€” outra transacao com a mesma chave commitou primeiro. A transacao
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
    // uma PROGRAMACAO responder 409 assim que alguem a executasse â€” o lacre nasce na execucao.
    conferirIntencaoEntrega(vencedora, intencao);
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

// M2 (R3/R4): sangria (durante o turno) e retorno (no fechamento) sao a MESMA entidade â€” uma
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
    // volta e encontra saldo 0 â€” se o teto rodasse primeiro, o retry morreria com "Caixa sem saldo",
    // o operador acharia que a entrega falhou e lancaria de novo. Duas entregas, um envelope.
    const jaRegistrada = await buscarTransferenciaPorIdempotenciaRepository(
      caixa.empresaId,
      dados.idempotenciaChave,
      tx
    );
    if (jaRegistrada) {
      conferirIntencaoEntrega(jaRegistrada, {
        caixaId: caixa.id,
        tipo: "retorno",
        valorCentavos,
        valorEspecieCentavos: paraCentavos(dados.valorEspecie),
        valorMoedasCentavos: paraCentavos(dados.valorMoedas),
        lacre: dados.lacre?.trim() || null,
        observacao: dados.observacao?.trim() || null
      });
      return statusDoCaixaAberto(caixa, tx);
    }

    // Decisao 7: entrega avulsa tambem entrega dinheiro â€” sem quem conferir, nao sai.
    await exigirConfirmadorDoCofre(caixa.empresaId, perfil.usuarioId, tx);

    // D1: Transferencia de retorno parcial e permitida, mas NUNCA acima do que existe em especie. Sem este
    // teto, dois cliques levavam o saldo a negativo e o fechamento gravava quebra falsa no nome do
    // operador. Recalculado aqui dentro, sob a trava â€” o saldo que a tela viu nao serve de prova.
    const saldoDisponivelCentavos = saldoCaixaCentavos(await calcularTotaisCaixaCentavos(caixa, tx));
    if (saldoDisponivelCentavos <= 0) {
      throw new Error("Caixa sem saldo em especie para enviar ao cofre");
    }
    const totalPlanejadoCentavos = (await listarPlanejamentosRetornoRepository(caixa.id, tx)).reduce(
      (total, planejamento) => total + paraCentavos(planejamento.valorOriginal),
      0
    );
    const saldoLivreCentavos = Math.max(0, saldoDisponivelCentavos - totalPlanejadoCentavos);
    if (saldoLivreCentavos <= 0) {
      throw new Error("Saldo disponivel reservado para transferencias de retorno planejadas");
    }
    if (valorCentavos > saldoLivreCentavos) {
      throw new Error(
        `Valor acima do saldo livre do caixa: disponivel R$ ${deCentavos(saldoLivreCentavos).toFixed(2)} apos reservar os retornos planejados`
      );
    }

    await registrarEntregaAoCofre(
      {
        caixa,
        valorCentavos,
        valorEspecieCentavos: paraCentavos(dados.valorEspecie),
        valorMoedasCentavos: paraCentavos(dados.valorMoedas),
        lacre: dados.lacre ?? null,
        observacao: dados.observacao ?? null,
        criadoPor: perfil.usuarioId,
        idempotenciaChave: dados.idempotenciaChave
      },
      tx
    );

    const atualizado = await buscarCaixaPorIdRepository(caixa.id, tx);
    if (!atualizado) throw new Error("Caixa nao encontrado");
    return statusDoCaixaAberto(atualizado, tx);
  });
}

// R-179/Fatia 3 Â· aqui viviam `programarSolicitacaoCofre`, `executarSolicitacaoCofre`,
// `cancelarSolicitacaoCofre`, `listarSolicitacoesCofre` e `listarCaixasAbertos` â€” o fluxo D4
// "Programar entrega ao cofre". A retaguarda programava uma ordem `agendada` e o operador a
// executava; era um SEGUNDO caminho para o mesmo ato de `criarTransferenciaCofreCaixa`, com a mesma
// entidade e as mesmas contas. Removido inteiro, junto com as rotas â€” nao escondido atras de
// permissao. A entrega ao cofre acontece dentro do turno, por quem tem a gaveta.

// R-185: a programacao ja nasceu com a ida; a execucao muda a MESMA linha para pendente e usa o
// lacre reservado. Portanto nao existe segundo POST financeiro, nem possibilidade de duplicar saldo.
export async function listarPlanejamentosRetorno(
  caixaId: string,
  perfil: PerfilUsuario
): Promise<PlanejamentoRetorno[]> {
  const caixa = await buscarCaixaPorIdRepository(caixaId);
  if (!caixa || !podeAcessarEmpresa(perfil, caixa.empresaId)) throw new Error("Caixa nao encontrado");
  if (!podeOperarCaixa(perfil, caixa)) throw new Error("Caixa nao permitido");
  return serializarPlanejamentos(await listarPlanejamentosRetornoRepository(caixaId));
}

export async function executarPlanejamentoRetorno(
  caixaId: string,
  planejamentoId: string,
  perfil: PerfilUsuario
): Promise<CaixaStatus> {
  return executarEmTransacao(async (tx) => {
    if (!(await travarCaixaRepository(caixaId, tx))) throw new Error("Caixa nao encontrado");
    const caixa = await buscarCaixaPorIdRepository(caixaId, tx);
    if (!caixa || !podeAcessarEmpresa(perfil, caixa.empresaId)) throw new Error("Caixa nao encontrado");
    if (!podeOperarCaixa(perfil, caixa)) throw new Error("Caixa nao permitido");
    if (caixa.status !== "aberto" || !caixa.pdvContaId) throw new Error("Caixa ja fechado");
    const planejamento = await buscarPlanejamentoRetornoRepository(planejamentoId, caixaId, tx);
    if (!planejamento) throw new Error("Planejamento nao encontrado");
    if (planejamento.status === "cancelada") {
      throw new ErroDominio("Planejamento cancelado nao pode ser executado", 409, "PLANEJAMENTO_CANCELADO");
    }
    if (planejamento.status !== "agendada") return statusDoCaixaAberto(caixa, tx);
    const saldoDisponivel = saldoCaixaCentavos(await calcularTotaisCaixaCentavos(caixa, tx));
    if (planejamento.valorCentavos > saldoDisponivel) {
      throw new Error(
        `Saldo insuficiente para executar o planejamento: programado R$ ${deCentavos(planejamento.valorCentavos).toFixed(2)}, disponivel R$ ${deCentavos(saldoDisponivel).toFixed(2)}`
      );
    }
    await exigirConfirmadorDaConta(
      planejamento.contaDestinoId,
      caixa.empresaId,
      [perfil.usuarioId, ...(planejamento.criadoPor ? [planejamento.criadoPor] : [])],
      tx
    );
    const ordem = await proximaOrdemTransferenciaRepository(caixa.id, planejamento.tipo, tx);
    const agora = new Date();
    const executada = await executarPlanejamentoRetornoRepository(
      {
        planejamentoId,
        caixaId,
        ordem,
        dataTransferencia: diaNegocio(agora),
        prazoConfirmacaoEm: null,
        executadoPor: perfil.usuarioId,
        agora
      },
      tx
    );
    if (!executada)
      throw new ErroDominio("Planejamento alterado por outro usuario neste instante", 409, "PLANEJAMENTO_CONFLITO");
    const atualizado = await buscarCaixaPorIdRepository(caixa.id, tx);
    if (!atualizado) throw new Error("Caixa nao encontrado");
    return statusDoCaixaAberto(atualizado, tx);
  });
}

export async function cancelarPlanejamentoRetorno(
  planejamentoId: string,
  dados: CancelarPlanejamentoRetornoPayload,
  perfil: PerfilUsuario
): Promise<{ id: string; status: "cancelada" }> {
  return executarEmTransacao(async (tx) => {
    if (!podeLancarSemCaixa(perfil)) {
      throw new ErroDominio("Cancelar planejamento e exclusivo da retaguarda", 403, "PLANEJAMENTO_SEM_PERMISSAO");
    }
    const planejamento = await buscarPlanejamentoRetornoPorIdRepository(planejamentoId, tx);
    if (!planejamento) throw new Error("Planejamento nao encontrado");
    if (!podeAcessarEmpresa(perfil, planejamento.empresaId)) throw new Error("Planejamento nao encontrado");
    if (planejamento.status === "cancelada") return { id: planejamento.id, status: "cancelada" };
    if (planejamento.status !== "agendada") {
      throw new ErroDominio("Planejamento ja executado nao pode ser cancelado", 409, "PLANEJAMENTO_EXECUTADO");
    }
    const cancelada = await cancelarPlanejamentoRetornoRepository(
      { planejamentoId, canceladoPor: perfil.usuarioId, motivo: dados.motivo.trim() },
      tx
    );
    if (!cancelada)
      throw new ErroDominio("Planejamento alterado por outro usuario neste instante", 409, "PLANEJAMENTO_CONFLITO");
    return { id: planejamento.id, status: "cancelada" };
  });
}

// M2 (consultas, item 4): a "aba TRANSFERENCIAS" por caixa+dia â€” os movimentos com ordem 1a/2a/3a/4a
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
    // Ordinal 1a/2a/3a por sentido, cronologico (independe do ordem gravado â€” abertura nao tem).
    const ordem = sentido === "saida" ? ++ordemSaida : ++ordemEntrada;
    if (sentido === "saida") totalSaidaCentavos += valorCentavos;
    else totalEntradaCentavos += valorCentavos;
    return {
      id: linha.id,
      tipo: (linha.tipo === "sangria" ? "retorno" : linha.tipo) as "abertura" | "suprimento" | "retorno",
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
  // Totais do filtro inteiro (rodape) e o flag de acerto so das linhas da pagina. Os fechados
  // continuam sendo o snapshot persistido; o aberto recebe o MESMO calculo operacional que o
  // proprio Caixa ja exibe, sem gravar nada antes do fechamento.
  const [totais, ajustes, alterados, caixasAbertos] = await Promise.all([
    totaisHistoricoCaixaRepository(filtros),
    caixasComAjusteRepository(itens.map((caixa) => caixa.id)),
    caixasAlteradosPosFechamentoRepository(itens.map((caixa) => caixa.id)),
    listarCaixasAbertosHistoricoRepository(filtros)
  ]);
  const totaisAbertos = new Map(
    (
      await Promise.all(
        caixasAbertos.map(async (caixa) => {
          if (!caixa.pdvContaId) return null;
          return [
            caixa.id,
            totaisHistoricoAoVivo(await calcularTotaisCaixaOperacionalRepository(caixa.id, caixa.pdvContaId))
          ] as const;
        })
      )
    ).filter((item): item is readonly [string, TotaisHistoricoAoVivo] => item !== null)
  );
  const comAjuste = new Set(ajustes.map((ajuste) => ajuste.caixaId));
  const alteradoPosFechamento = new Set(alterados.map((alteracao) => alteracao.caixaId));

  return {
    itens: itens.map((caixa) => {
      const aoVivo = totaisAbertos.get(caixa.id);
      // `pdvContaId` e somente insumo interno do calculo ao vivo; o contrato do historico nunca
      // expoe a conta do PDV junto de uma linha de caixa.
      const { pdvContaId: _pdvContaId, ...caixaPublico } = caixa;
      return {
        ...caixaPublico,
        dataHoraAbertura: serializarData(caixa.dataHoraAbertura),
        dataHoraFechamento: serializarData(caixa.dataHoraFechamento),
        fechadoPor: caixa.fechadoPor,
        fechadoPorNome: caixa.fechadoPorNome,
        totalEntradas: aoVivo?.totalEntradas ?? numero(caixa.totalEntradas),
        totalTransferencias: aoVivo?.totalTransferencias ?? numero(caixa.totalTransferencias),
        totalTransferenciasEntrada: aoVivo?.totalTransferenciasEntrada ?? numero(caixa.totalTransferenciasEntrada),
        totalTransferenciasSaida: aoVivo?.totalTransferenciasSaida ?? numero(caixa.totalTransferenciasSaida),
        totalDespesas: aoVivo?.totalDespesas ?? numero(caixa.totalDespesas),
        totalRetiradas: aoVivo?.totalRetiradas ?? numero(caixa.totalRetiradas),
        totalMercadorias: aoVivo?.totalMercadorias ?? numero(caixa.totalMercadorias),
        saldo: aoVivo?.saldo ?? numero(caixa.saldo),
        status: statusCaixaSchema.parse(caixa.status),
        temAjuste: comAjuste.has(caixa.id),
        alteradoAposFechamento: alteradoPosFechamento.has(caixa.id)
      };
    }),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totais: {
      totalEntradas: numero(totais?.totalEntradas) + somarTotaisAoVivo(totaisAbertos, "totalEntradas"),
      totalTransferenciasEntrada:
        numero(totais?.totalTransferenciasEntrada) + somarTotaisAoVivo(totaisAbertos, "totalTransferenciasEntrada"),
      totalTransferenciasSaida:
        numero(totais?.totalTransferenciasSaida) + somarTotaisAoVivo(totaisAbertos, "totalTransferenciasSaida"),
      totalDespesas: numero(totais?.totalDespesas) + somarTotaisAoVivo(totaisAbertos, "totalDespesas"),
      totalRetiradas: numero(totais?.totalRetiradas) + somarTotaisAoVivo(totaisAbertos, "totalRetiradas"),
      totalMercadorias: numero(totais?.totalMercadorias) + somarTotaisAoVivo(totaisAbertos, "totalMercadorias"),
      saldo: numero(totais?.saldo) + somarTotaisAoVivo(totaisAbertos, "saldo"),
      caixas: totais?.caixas ?? 0
    }
  };
}

type TotaisHistoricoAoVivo = Pick<
  LinhaHistoricoCaixa,
  | "totalEntradas"
  | "totalTransferencias"
  | "totalTransferenciasEntrada"
  | "totalTransferenciasSaida"
  | "totalDespesas"
  | "totalRetiradas"
  | "totalMercadorias"
  | "saldo"
>;

// Projecao do mesmo acumulador em centavos usado pelo Caixa aberto para a forma da linha do
// historico. A transferencia total do snapshot e liquida (entrada - saida), igual ao fechamento.
function totaisHistoricoAoVivo(totais: TotaisCaixaCentavos): TotaisHistoricoAoVivo {
  return {
    totalEntradas: deCentavos(totais.entradas),
    totalTransferencias: deCentavos(totais.transferenciasEntrada - totais.transferenciasSaida),
    totalTransferenciasEntrada: deCentavos(totais.transferenciasEntrada),
    totalTransferenciasSaida: deCentavos(totais.transferenciasSaida),
    totalDespesas: deCentavos(totais.despesas),
    totalRetiradas: deCentavos(totais.retiradas),
    totalMercadorias: deCentavos(totais.mercadorias),
    saldo: deCentavos(saldoCaixaCentavos(totais))
  };
}

function somarTotaisAoVivo(
  totais: ReadonlyMap<string, TotaisHistoricoAoVivo>,
  campo: Exclude<keyof TotaisHistoricoAoVivo, "totalTransferencias">
) {
  return [...totais.values()].reduce((soma, caixa) => soma + caixa[campo], 0);
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
// Os lancamentos NAO vem daqui â€” a tela reusa as listagens existentes filtradas por caixaId.
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
      // tokenUsado e segredo: sai so como "foi por token?" â€” o valor nunca vai para o cliente.
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
  // do PDV, saida quando SAI dela â€” testes independentes. Uma transferencia entre duas contas que
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

// P0 lancamento x fechamento â€” a PORTA UNICA do caixa do ator, agora com o contrato de lock:
// resolver -> travar FOR SHARE -> revalidar o status POS-lock. O SELECT resolve o id sem lock
// (tem joins); a trava e por PK; e o status decisivo e o do locked-read, nunca o do retrato
// anterior. Se o caixa fechou no meio da corrida, o chamador recebe o MESMO desfecho de sempre â€”
// nada de comportamento novo fora da janela.
//
// `TransacaoBanco` obrigatorio: todo caminho de escrita ja roda em `executarEmTransacao`; um
// FOR SHARE fora de transacao evaporaria na instrucao seguinte.

/** Retaguarda (caixa opcional): devolve o caixa aberto TRAVADO, ou quem fechou durante a corrida. */
export async function travarCaixaAbertoDoAtor(
  empresaId: string,
  usuarioId: string,
  tx: TransacaoBanco
): Promise<{
  caixa: Awaited<ReturnType<typeof buscarCaixaAbertoUsuarioRepository>>;
  caixaFechadoNaCorrida: Awaited<ReturnType<typeof buscarCaixaAbertoUsuarioRepository>>;
}> {
  const caixa = await buscarCaixaAbertoUsuarioRepository(empresaId, usuarioId, tx);
  if (!caixa) return { caixa: null, caixaFechadoNaCorrida: null };
  const trava = await travarCaixaCompartilhadoRepository(caixa.id, tx);
  if (trava?.status === "aberto") return { caixa, caixaFechadoNaCorrida: null };
  // Fechou entre o SELECT e o lock (ou a linha sumiu, o que a FK impede): quem decide o desfecho e
  // o chamador â€” Q2 recusa se a conta em uso for a do PDV deste caixa; qualquer outra conta segue
  // como se nao houvesse caixa (A-1/R-032).
  return { caixa: null, caixaFechadoNaCorrida: caixa };
}

// Suprimento criado pela Tesouraria: ela nao tem (nem deve ter) um caixa proprio para que o
// dinheiro entre no PDV. A conta de destino identifica o caixa aberto que recebe o malote. So a
// transferencia direta usa esta resolucao; em multiplo destino a conta vencedora so existe na
// conferencia, e no planejamento o vinculo nasce na abertura pelo lacre.
export async function travarCaixaAbertoDaContaPdv(
  empresaId: string,
  contaId: string,
  tx: TransacaoBanco
): Promise<CaixaLinha | null> {
  const caixas = await listarCaixasAbertosDaContaPdvRepository(empresaId, contaId, tx);
  if (caixas.length > 1) {
    throw new Error("Mais de um caixa aberto usa esta conta de PDV; corrija o cadastro antes de transferir");
  }
  const caixaAberto = caixas[0];
  if (!caixaAberto) return null;

  // A trava compartilha a mesma porta do fechamento. Se ele venceu a corrida, a transferencia
  // continua um movimento entre contas, mas nao e anexada ao turno que ja encerrou.
  const trava = await travarCaixaCompartilhadoRepository(caixaAberto.id, tx);
  if (trava?.status !== "aberto") return null;
  return buscarCaixaPorIdRepository(caixaAberto.id, tx);
}

export async function obterCaixaAbertoParaLancamento(empresaId: string, usuarioId: string, tx: TransacaoBanco) {
  const { caixa } = await travarCaixaAbertoDoAtor(empresaId, usuarioId, tx);
  // Caixa que fechou na corrida = caixa que nao existe mais para o operador: o erro oficial e o
  // MESMO que ele receberia fora da janela (matriz P0, linha "fechamento antes").
  if (!caixa) throw new Error("Abra um caixa antes de registrar este lancamento");
  if (!caixa.pdvId || !caixa.pdvContaId) throw new Error("Caixa operacional invalido");
  return caixa;
}
