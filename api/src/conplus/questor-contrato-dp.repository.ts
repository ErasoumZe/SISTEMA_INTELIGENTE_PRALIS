import { and, eq } from "drizzle-orm";
import type { ContratoQuestorPayload } from "@padaria/shared/conplus";
import { admissoesProcessosInternos as internosQuestorTabela } from "@padaria/db/schema/admissoes";
import { banco } from "../banco/conexao.js";

/**
 * E4 — dados contratuais no bloco interno do processo. Usa a MESMA `versao` do bloco interno: o
 * diálogo atual (exame, CTPS, PIS) e este bloco não se sobrescrevem em silêncio.
 */

const colunasContrato = {
  processoId: internosQuestorTabela.processoId,
  versao: internosQuestorTabela.versao,
  questorTipoSalario: internosQuestorTabela.questorTipoSalario,
  salarioCentavos: internosQuestorTabela.salarioCentavos,
  descricaoSalario: internosQuestorTabela.descricaoSalario,
  diasExperiencia: internosQuestorTabela.diasExperiencia,
  diasProrrogacao: internosQuestorTabela.diasProrrogacao,
  questorTipoContrato: internosQuestorTabela.questorTipoContrato,
  questorSindicato: internosQuestorTabela.questorSindicato,
  questorTipoAdmissao: internosQuestorTabela.questorTipoAdmissao,
  pcdCotista: internosQuestorTabela.pcdCotista,
  utilizaCtpsDigital: internosQuestorTabela.utilizaCtpsDigital,
  possuiAlvara: internosQuestorTabela.possuiAlvara,
  jaExpostoAgenteNocivo: internosQuestorTabela.jaExpostoAgenteNocivo
};

export async function obterContratoQuestorRepository(empresaId: string, processoId: string) {
  const [linha] = await banco
    .select(colunasContrato)
    .from(internosQuestorTabela)
    .where(and(eq(internosQuestorTabela.processoId, processoId), eq(internosQuestorTabela.empresaId, empresaId)))
    .limit(1);
  return linha ?? null;
}

/** `null` = versão lida desatualizada (ou bloco interno inexistente nesta empresa). */
export async function atualizarContratoQuestorRepository(
  empresaId: string,
  processoId: string,
  versaoLida: number,
  dados: Omit<ContratoQuestorPayload, "versao">
) {
  const [linha] = await banco
    .update(internosQuestorTabela)
    .set({ ...dados, versao: versaoLida + 1 })
    .where(
      and(
        eq(internosQuestorTabela.processoId, processoId),
        eq(internosQuestorTabela.empresaId, empresaId),
        eq(internosQuestorTabela.versao, versaoLida)
      )
    )
    .returning(colunasContrato);
  return linha ?? null;
}
