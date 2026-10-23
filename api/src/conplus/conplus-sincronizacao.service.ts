import { randomUUID } from "node:crypto";
import type { PerfilUsuario } from "@padaria/shared";
import type { ConplusSincronizacaoEstadoDto, ConplusTipoRelatorio } from "@padaria/shared/conplus";
import { empresaDoAtor } from "../admissoes/ator.js";
import { executarEmTransacao } from "../banco/conexao.js";
import { comMigrationQuestor } from "./questor-comum.service.js";
import {
  alterarEstadoSincronizacaoRepository,
  listarEstadosSincronizacaoRepository,
  travarEstadoPorBloqueioRepository,
  travarEstadoSincronizacaoRepository,
  type EstadoSincronizacaoConplus
} from "./conplus-sincronizacao.repository.js";

/**
 * Controle da busca automática na API Conplus — pronto antes da API existir.
 *
 * A rotina (quando a Conplus liberar endereço, login e formato) fará, por empresa e tipo:
 *   1. `reservarSincronizacaoConplus` — só uma instância por vez; respeita a espera após falha;
 *   2. busca a partir de `ultimaCompetencia`/`cursor` e grava o conteúdo como importação com
 *      `origem = 'api'` (mesma prévia, confirmação e idempotência por hash do upload manual);
 *   3. `concluirSincronizacaoConplus` ou `falharSincronizacaoConplus` com o token recebido.
 * Nada aqui chama a Conplus: não há endereço nem credencial no sistema.
 */

export const TIPOS_RELATORIO_CONPLUS: readonly ConplusTipoRelatorio[] = [
  "folha_05",
  "adiantamento_20",
  "rescisoes",
  "ferias"
];

/** Prazo da reserva: passado isso, outra instância pode assumir uma execução que morreu no meio. */
export const DURACAO_BLOQUEIO_MS = 15 * 60 * 1000;
const ESPERA_BASE_MS = 5 * 60 * 1000;
const ESPERA_MAXIMA_MS = 6 * 60 * 60 * 1000;

/** Espera após a N-ésima falha seguida: 5 min, 10, 20, 40… até 6 h. */
export function esperaAposFalhaConplus(falhasSeguidas: number): number {
  const expoente = Math.max(0, Math.min(falhasSeguidas - 1, 16));
  return Math.min(ESPERA_BASE_MS * 2 ** expoente, ESPERA_MAXIMA_MS);
}

function paraDto(
  tipo: ConplusTipoRelatorio,
  linha: EstadoSincronizacaoConplus | undefined
): ConplusSincronizacaoEstadoDto {
  if (!linha) {
    return {
      tipo,
      status: "nunca_executada",
      ultimaCompetencia: null,
      tentativas: 0,
      proximaTentativaEm: null,
      ultimaExecucaoEm: null,
      ultimoSucessoEm: null,
      ultimaImportacaoId: null,
      ultimoErroCodigo: null
    };
  }
  return {
    tipo,
    status: linha.status,
    ultimaCompetencia: linha.ultimaCompetencia,
    tentativas: linha.tentativas,
    proximaTentativaEm: linha.proximaTentativaEm?.toISOString() ?? null,
    ultimaExecucaoEm: linha.ultimaExecucaoEm?.toISOString() ?? null,
    ultimoSucessoEm: linha.ultimoSucessoEm?.toISOString() ?? null,
    ultimaImportacaoId: linha.ultimaImportacaoId,
    ultimoErroCodigo: linha.ultimoErroCodigo
  };
}

/** Situação da busca automática dos quatro relatórios da empresa da sessão (sem cursor nem erro bruto). */
export async function listarEstadoSincronizacaoConplus(
  perfil?: PerfilUsuario
): Promise<ConplusSincronizacaoEstadoDto[]> {
  const empresaId = empresaDoAtor(perfil);
  const linhas = await comMigrationQuestor(() => listarEstadosSincronizacaoRepository(empresaId));
  return TIPOS_RELATORIO_CONPLUS.map((tipo) =>
    paraDto(
      tipo,
      linhas.find((linha) => linha.tipo === tipo)
    )
  );
}

export type ReservaSincronizacaoConplus = {
  bloqueioToken: string;
  ultimaCompetencia: string | null;
  cursor: string | null;
};

/**
 * Reserva a execução. `null` = não é a vez: outra instância está com a reserva válida, ou a última
 * falha ainda está no intervalo de espera.
 */
export async function reservarSincronizacaoConplus(params: {
  empresaId: string;
  tipo: ConplusTipoRelatorio;
  agora?: Date;
}): Promise<ReservaSincronizacaoConplus | null> {
  const agora = params.agora ?? new Date();
  return executarEmTransacao(async (tx) => {
    const atual = await travarEstadoSincronizacaoRepository(tx, params.empresaId, params.tipo);
    const reservaValida = atual.status === "executando" && atual.bloqueioAte !== null && atual.bloqueioAte > agora;
    const emEspera = atual.proximaTentativaEm !== null && atual.proximaTentativaEm > agora;
    if (reservaValida || emEspera) return null;
    const bloqueioToken = randomUUID();
    await alterarEstadoSincronizacaoRepository(tx, atual.id, {
      status: "executando",
      bloqueioToken,
      bloqueioAte: new Date(agora.getTime() + DURACAO_BLOQUEIO_MS),
      ultimaExecucaoEm: agora
    });
    return { bloqueioToken, ultimaCompetencia: atual.ultimaCompetencia, cursor: atual.cursor };
  });
}

/** `false` = a reserva já não era deste token (expirou e outra instância assumiu): nada é gravado. */
export async function concluirSincronizacaoConplus(params: {
  empresaId: string;
  tipo: ConplusTipoRelatorio;
  bloqueioToken: string;
  ultimaCompetencia: string | null;
  cursor: string | null;
  importacaoId: string | null;
  agora?: Date;
}): Promise<boolean> {
  const agora = params.agora ?? new Date();
  return executarEmTransacao(async (tx) => {
    const atual = await travarEstadoPorBloqueioRepository(tx, params.empresaId, params.tipo, params.bloqueioToken);
    if (!atual) return false;
    await alterarEstadoSincronizacaoRepository(tx, atual.id, {
      status: "ociosa",
      bloqueioToken: null,
      bloqueioAte: null,
      tentativas: 0,
      proximaTentativaEm: null,
      ultimoSucessoEm: agora,
      // Sem novidade na API, o ponto de partida não anda para trás.
      ultimaCompetencia: params.ultimaCompetencia ?? atual.ultimaCompetencia,
      cursor: params.cursor ?? atual.cursor,
      ultimaImportacaoId: params.importacaoId ?? atual.ultimaImportacaoId,
      ultimoErroCodigo: null,
      ultimoErroMensagem: null
    });
    return true;
  });
}

/** Registra a falha e agenda a próxima tentativa com espera crescente. `false` = reserva perdida. */
export async function falharSincronizacaoConplus(params: {
  empresaId: string;
  tipo: ConplusTipoRelatorio;
  bloqueioToken: string;
  codigo: string;
  mensagem: string;
  agora?: Date;
}): Promise<boolean> {
  const agora = params.agora ?? new Date();
  return executarEmTransacao(async (tx) => {
    const atual = await travarEstadoPorBloqueioRepository(tx, params.empresaId, params.tipo, params.bloqueioToken);
    if (!atual) return false;
    const tentativas = atual.tentativas + 1;
    await alterarEstadoSincronizacaoRepository(tx, atual.id, {
      status: "falhou",
      bloqueioToken: null,
      bloqueioAte: null,
      tentativas,
      proximaTentativaEm: new Date(agora.getTime() + esperaAposFalhaConplus(tentativas)),
      ultimoErroCodigo: params.codigo.slice(0, 120),
      ultimoErroMensagem: params.mensagem.slice(0, 500)
    });
    return true;
  });
}
