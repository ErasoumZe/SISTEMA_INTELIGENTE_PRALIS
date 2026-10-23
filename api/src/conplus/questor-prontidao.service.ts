import type { PerfilUsuario } from "@padaria/shared";
import {
  avaliarProntidaoQuestor,
  type ParametrosQuestorSnapshot,
  type ProntidaoQuestorDto
} from "@padaria/shared/conplus";
import { empresaDoAtor } from "../admissoes/ator.js";
import { naoEncontrado, type ErroEncadeado } from "../erros.js";
import { ehMigrationQuestorPendente } from "./questor-comum.service.js";
import { lerParametrosQuestorRepository } from "./questor-parametros.repository.js";
import { lerSnapshotQuestorRepository } from "./questor-prontidao.repository.js";

/**
 * Prévia de prontidão Questor — somente leitura. Não grava, não gera arquivo, não envia nada.
 * A empresa vem do perfil do ator, nunca da requisição.
 */
export async function obterProntidaoQuestor(
  processoId: string,
  perfil?: PerfilUsuario,
  agora: () => Date = () => new Date()
): Promise<ProntidaoQuestorDto> {
  const empresaId = empresaDoAtor(perfil);
  const snapshot = await lerSnapshotQuestorRepository(processoId, empresaId);
  if (!snapshot) throw naoEncontrado("Processo de admissao nao encontrado");
  const questor = await lerParametrosSeDisponiveis(processoId, empresaId);
  return avaliarProntidaoQuestor({
    processoId,
    snapshot: questor ? { ...snapshot, questor } : snapshot,
    geradoEm: agora()
  });
}

/**
 * Antes das migrations 0073–0075 a prévia continua funcionando como na E1: sem parâmetros, os
 * campos de E2–E4 aparecem pendentes. Qualquer outro erro sobe normalmente.
 */
async function lerParametrosSeDisponiveis(
  processoId: string,
  empresaId: string
): Promise<ParametrosQuestorSnapshot | null> {
  try {
    return await lerParametrosQuestorRepository(processoId, empresaId);
  } catch (erro) {
    if (ehMigrationQuestorPendente(erro as ErroEncadeado)) return null;
    throw erro;
  }
}
