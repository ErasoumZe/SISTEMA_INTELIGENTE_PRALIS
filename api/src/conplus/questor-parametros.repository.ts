import { and, eq } from "drizzle-orm";
import { admissoesProcessos } from "@padaria/db/schema/admissoes";
import type { ParametrosQuestorSnapshot } from "@padaria/shared/conplus";
import { banco } from "../banco/conexao.js";
import { obterContratoQuestorRepository } from "./questor-contrato-dp.repository.js";
import { obterConfiguracaoQuestorRepository } from "./questor-configuracao.repository.js";
import { obterFuncaoQuestorRepository, obterTurnoQuestorRepository } from "./questor-cadastros.repository.js";

/**
 * E2/E3/E4 de UM processo, no formato que a montagem do TXT e a prévia de prontidão consomem:
 * configuração da empresa, função e turno do processo e o contrato do DP. Tudo da mesma empresa.
 *
 * Lança 42P01/42703 enquanto as migrations 0064–0066 não existirem no banco — quem chama decide.
 */
export async function lerParametrosQuestorRepository(
  processoId: string,
  empresaId: string
): Promise<ParametrosQuestorSnapshot | null> {
  const [processo] = await banco
    .select({ funcaoId: admissoesProcessos.funcaoId, turnoId: admissoesProcessos.turnoId })
    .from(admissoesProcessos)
    .where(and(eq(admissoesProcessos.id, processoId), eq(admissoesProcessos.empresaId, empresaId)))
    .limit(1);
  if (!processo) return null;

  const [configuracao, contrato, funcao, turno] = await Promise.all([
    obterConfiguracaoQuestorRepository(empresaId),
    obterContratoQuestorRepository(empresaId, processoId),
    processo.funcaoId ? obterFuncaoQuestorRepository(empresaId, processo.funcaoId) : null,
    processo.turnoId ? obterTurnoQuestorRepository(empresaId, processo.turnoId) : null
  ]);

  return {
    configuracao: configuracao
      ? {
          codigoEstabelecimento: configuracao.codigoEstabelecimento,
          classificacaoOrganograma: configuracao.classificacaoOrganograma,
          padroes: configuracao.padroes
        }
      : null,
    contrato: contrato
      ? {
          questorTipoSalario: contrato.questorTipoSalario,
          salarioCentavos: contrato.salarioCentavos,
          descricaoSalario: contrato.descricaoSalario,
          diasExperiencia: contrato.diasExperiencia,
          diasProrrogacao: contrato.diasProrrogacao,
          questorTipoContrato: contrato.questorTipoContrato,
          questorSindicato: contrato.questorSindicato,
          questorTipoAdmissao: contrato.questorTipoAdmissao,
          pcdCotista: contrato.pcdCotista,
          utilizaCtpsDigital: contrato.utilizaCtpsDigital,
          possuiAlvara: contrato.possuiAlvara,
          jaExpostoAgenteNocivo: contrato.jaExpostoAgenteNocivo
        }
      : null,
    funcao: funcao
      ? { questorCodigoCargo: funcao.questorCodigoCargo, questorAgenteNocivo: funcao.questorAgenteNocivo }
      : null,
    turno: turno
      ? {
          questorCodigoEscala: turno.questorCodigoEscala,
          questorTipoJornada: turno.questorTipoJornada,
          questorTempoParcial: turno.questorTempoParcial,
          questorRegimeJornada: turno.questorRegimeJornada
        }
      : null
  };
}
