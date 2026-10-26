import type { PerfilUsuario } from "@padaria/shared";
import type { DadosExternos } from "@padaria/shared/api";
import {
  funcaoQuestorRequisicaoSchema,
  turnoQuestorRequisicaoSchema,
  type FuncaoQuestorDto,
  type TurnoQuestorDto
} from "@padaria/shared/conplus";
import { empresaDoAtor } from "../admissoes/ator.js";
import { naoEncontrado } from "../erros.js";
import {
  comMigrationQuestor,
  exigirCodigosAtivosNoCatalogo,
  versaoQuestorDesatualizada
} from "./questor-comum.service.js";
import {
  atualizarFuncaoQuestorRepository,
  atualizarTurnoQuestorRepository,
  listarFuncoesQuestorRepository,
  listarTurnosQuestorRepository,
  obterFuncaoQuestorRepository,
  obterTurnoQuestorRepository
} from "./questor-cadastros.repository.js";

/** E3 — código de cargo/agente nocivo na função e código de escala/jornada no turno. */

const comInstanteIso = <T extends { atualizadoEm: Date }>(
  linha: T
): Omit<T, "atualizadoEm"> & { atualizadoEm: string } => ({
  ...linha,
  atualizadoEm: linha.atualizadoEm.toISOString()
});

export async function listarFuncoesQuestor(perfil?: PerfilUsuario): Promise<FuncaoQuestorDto[]> {
  const empresaId = empresaDoAtor(perfil);
  return comMigrationQuestor(async () => (await listarFuncoesQuestorRepository(empresaId)).map(comInstanteIso));
}

export async function salvarFuncaoQuestor(
  id: string,
  body: DadosExternos,
  perfil?: PerfilUsuario
): Promise<FuncaoQuestorDto> {
  const empresaId = empresaDoAtor(perfil);
  const { atualizadoEmLido, ...dados } = funcaoQuestorRequisicaoSchema.parse(body);
  return comMigrationQuestor(async () => {
    const atual = await obterFuncaoQuestorRepository(empresaId, id);
    if (!atual) throw naoEncontrado("Função não encontrada");
    await exigirCodigosAtivosNoCatalogo(empresaId, [
      { tabela: "cargo", codigo: dados.questorCodigoCargo, caminho: "questorCodigoCargo" }
    ]);
    const gravada = await atualizarFuncaoQuestorRepository(empresaId, id, atualizadoEmLido, dados);
    if (!gravada) throw versaoQuestorDesatualizada();
    return comInstanteIso(gravada);
  });
}

export async function listarTurnosQuestor(perfil?: PerfilUsuario): Promise<TurnoQuestorDto[]> {
  const empresaId = empresaDoAtor(perfil);
  return comMigrationQuestor(async () => (await listarTurnosQuestorRepository(empresaId)).map(comInstanteIso));
}

export async function salvarTurnoQuestor(
  id: string,
  body: DadosExternos,
  perfil?: PerfilUsuario
): Promise<TurnoQuestorDto> {
  const empresaId = empresaDoAtor(perfil);
  const { atualizadoEmLido, ...dados } = turnoQuestorRequisicaoSchema.parse(body);
  return comMigrationQuestor(async () => {
    const atual = await obterTurnoQuestorRepository(empresaId, id);
    if (!atual) throw naoEncontrado("Turno não encontrado");
    await exigirCodigosAtivosNoCatalogo(empresaId, [
      { tabela: "escala", codigo: dados.questorCodigoEscala, caminho: "questorCodigoEscala" }
    ]);
    const gravado = await atualizarTurnoQuestorRepository(empresaId, id, atualizadoEmLido, dados);
    if (!gravado) throw versaoQuestorDesatualizada();
    return comInstanteIso(gravado);
  });
}
