import { and, eq, gt, isNull } from "drizzle-orm";
import { despesas } from "@padaria/db/schema/despesa";
import { lancamentosRecorrencias } from "@padaria/db/schema/lancamento";
import { mercadorias } from "@padaria/db/schema/mercadoria";
import { retiradas } from "@padaria/db/schema/retirada";
import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import { executarEmTransacao } from "../banco/conexao.js";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { exigirPermissaoLancamento } from "./lancamentos.dominio.js";
import type { DominioRecorrencia } from "./lancamentos.recorrencia.js";

const tabelas = { despesa: despesas, mercadoria: mercadorias, retirada: retiradas } as const;
const permissoes = {
  despesa: "despesas_excluir",
  mercadoria: "mercadorias_excluir",
  retirada: "retiradas_excluir"
} as const;

export async function cancelarSerieRecorrencia(
  recorrenciaId: string,
  dominio: DominioRecorrencia,
  empresaId: string,
  perfil: PerfilUsuario,
  hoje = new Date().toISOString().slice(0, 10)
) {
  exigirPermissaoLancamento(perfil.permissoes, permissoes[dominio]);
  if (!podeAcessarEmpresa(perfil, empresaId)) throw new Error("Empresa nao permitida");
  return executarEmTransacao(async (tx) => {
    const [serie] = await tx
      .select({ id: lancamentosRecorrencias.id })
      .from(lancamentosRecorrencias)
      .where(
        and(
          eq(lancamentosRecorrencias.id, recorrenciaId),
          eq(lancamentosRecorrencias.empresaId, empresaId),
          eq(lancamentosRecorrencias.dominio, dominio)
        )
      )
      .limit(1);
    if (!serie) throw new Error("Serie nao encontrada");
    const tabela = tabelas[dominio];
    const removidas = await tx
      .delete(tabela)
      .where(
        and(eq(tabela.recorrenciaId, recorrenciaId), gt(tabela.dataVencimento, hoje), isNull(tabela.dataPagamento))
      )
      .returning({ id: tabela.id });
    return { removidas: removidas.length };
  });
}
