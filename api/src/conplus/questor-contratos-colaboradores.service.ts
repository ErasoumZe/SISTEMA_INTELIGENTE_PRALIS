import type { PerfilUsuario } from "@padaria/shared";
import type { DadosExternos } from "@padaria/shared/api";
import {
  contratoColaboradorQuestorRequisicaoSchema,
  ERROS_QUESTOR,
  type ContratoColaboradorQuestorDto
} from "@padaria/shared/conplus";
import { empresaDoAtor } from "../admissoes/ator.js";
import { codigoPostgresDoErro, conflito, naoEncontrado, type ErroEncadeado } from "../erros.js";
import { comMigrationQuestor, versaoQuestorDesatualizada } from "./questor-comum.service.js";
import {
  atualizarContratoColaboradorQuestorRepository,
  listarContratosColaboradoresQuestorRepository,
  obterContratoColaboradorQuestorRepository
} from "./questor-contratos-colaboradores.repository.js";

/**
 * Código do contrato do colaborador no Questor (coluna 1 do CSV de eventos variáveis). O DP copia o
 * código que o Questor atribuiu; o Pralís nunca gera nem sugere um. Vale também para desligados,
 * porque eventos e relatórios de competências passadas continuam chegando.
 */

type LinhaContrato = Omit<ContratoColaboradorQuestorDto, "atualizadoEm"> & { atualizadoEm: Date };

const paraDto = (linha: LinhaContrato): ContratoColaboradorQuestorDto => ({
  ...linha,
  atualizadoEm: linha.atualizadoEm.toISOString()
});

export async function listarContratosColaboradoresQuestor(
  perfil?: PerfilUsuario
): Promise<ContratoColaboradorQuestorDto[]> {
  const empresaId = empresaDoAtor(perfil);
  return comMigrationQuestor(async () => (await listarContratosColaboradoresQuestorRepository(empresaId)).map(paraDto));
}

export async function salvarContratoColaboradorQuestor(
  vinculoId: string,
  body: DadosExternos,
  perfil?: PerfilUsuario
): Promise<ContratoColaboradorQuestorDto> {
  const empresaId = empresaDoAtor(perfil);
  const { atualizadoEmLido, ...dados } = contratoColaboradorQuestorRequisicaoSchema.parse(body);
  return comMigrationQuestor(async () => {
    const atual = await obterContratoColaboradorQuestorRepository(empresaId, vinculoId);
    if (!atual) throw naoEncontrado("Vínculo do colaborador não encontrado");
    try {
      const gravado = await atualizarContratoColaboradorQuestorRepository(
        empresaId,
        vinculoId,
        atualizadoEmLido,
        dados
      );
      if (!gravado) throw versaoQuestorDesatualizada();
    } catch (erro) {
      // 23505: índice único parcial (empresa, código) — o mesmo contrato em dois vínculos.
      if (codigoPostgresDoErro(erro as ErroEncadeado) === "23505") {
        throw conflito(
          "Este código de contrato Questor já está em outro vínculo desta empresa",
          ERROS_QUESTOR.contratoColaboradorDuplicado
        );
      }
      throw erro;
    }
    const recarregado = await obterContratoColaboradorQuestorRepository(empresaId, vinculoId);
    if (!recarregado) throw naoEncontrado("Vínculo do colaborador não encontrado");
    return paraDto(recarregado);
  });
}
