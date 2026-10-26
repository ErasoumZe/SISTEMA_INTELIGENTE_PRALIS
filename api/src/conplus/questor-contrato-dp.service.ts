import type { PerfilUsuario } from "@padaria/shared";
import type { DadosExternos } from "@padaria/shared/api";
import {
  contratoQuestorRequisicaoSchema,
  referenciasDoContratoQuestor,
  type ContratoQuestorDto
} from "@padaria/shared/conplus";
import { empresaDoAtor } from "../admissoes/ator.js";
import { naoEncontrado } from "../erros.js";
import {
  comMigrationQuestor,
  exigirCodigosAtivosNoCatalogo,
  versaoQuestorDesatualizada
} from "./questor-comum.service.js";
import {
  atualizarContratoQuestorRepository,
  obterContratoQuestorRepository
} from "./questor-contrato-dp.repository.js";

/** E4 — dados contratuais que o DP preenche no processo (bloco interno). */

const BLOCO_AUSENTE = "Bloco interno do processo não encontrado";

export async function obterContratoQuestor(processoId: string, perfil?: PerfilUsuario): Promise<ContratoQuestorDto> {
  const empresaId = empresaDoAtor(perfil);
  return comMigrationQuestor(async () => {
    const contrato = await obterContratoQuestorRepository(empresaId, processoId);
    if (!contrato) throw naoEncontrado(BLOCO_AUSENTE);
    return contrato;
  });
}

export async function salvarContratoQuestor(
  processoId: string,
  body: DadosExternos,
  perfil?: PerfilUsuario
): Promise<ContratoQuestorDto> {
  const empresaId = empresaDoAtor(perfil);
  const { versao, ...dados } = contratoQuestorRequisicaoSchema.parse(body);
  return comMigrationQuestor(async () => {
    const atual = await obterContratoQuestorRepository(empresaId, processoId);
    if (!atual) throw naoEncontrado(BLOCO_AUSENTE);
    await exigirCodigosAtivosNoCatalogo(empresaId, referenciasDoContratoQuestor(dados));
    const gravado = await atualizarContratoQuestorRepository(empresaId, processoId, versao, dados);
    if (!gravado) throw versaoQuestorDesatualizada();
    return gravado;
  });
}
