import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { despesas } from "@padaria/db/schema/despesa";
import { lancamentosRecorrencias } from "@padaria/db/schema/lancamento";
import { mercadorias } from "@padaria/db/schema/mercadoria";
import { retiradas } from "@padaria/db/schema/retirada";
import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import { executarEmTransacao } from "../banco/conexao.js";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { travarCaixaCompartilhadoRepository } from "../caixa/caixa.repository.js";
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
    // S2 (R-164, Jose 11/08): apagar parcela ALTERA o total do caixa dela — a R-063 continua
    // valendo (so futuras nao pagas), mas agora sob a porta do caixa. As candidatas saem em ordem
    // deterministica (caixa_id, id); os caixas DISTINTOS sao travados (FOR SHARE) nessa ordem e
    // revalidados: parcela presa a caixa FECHADO nao e apagada — os sete totais congelados ficam
    // intactos; com caixa aberto o DELETE roda sob o lock, e um fechamento em voo espera e
    // congela ja sem a parcela. A ordem unica caixa -> linhas vale aqui como nas rotas.
    const candidatas = await tx
      .select({ id: tabela.id, caixaId: tabela.caixaId })
      .from(tabela)
      .where(
        and(eq(tabela.recorrenciaId, recorrenciaId), gt(tabela.dataVencimento, hoje), isNull(tabela.dataPagamento))
      )
      .orderBy(tabela.caixaId, tabela.id);

    const caixasFechados = new Set<string>();
    const caixasVistos = new Set<string>();
    for (const parcela of candidatas) {
      if (!parcela.caixaId || caixasVistos.has(parcela.caixaId)) continue;
      caixasVistos.add(parcela.caixaId);
      const trava = await travarCaixaCompartilhadoRepository(parcela.caixaId, tx);
      if (trava?.status !== "aberto") caixasFechados.add(parcela.caixaId);
    }

    const removiveis = candidatas.filter((parcela) => !parcela.caixaId || !caixasFechados.has(parcela.caixaId));
    if (removiveis.length === 0) return { removidas: 0 };
    const removidas = await tx
      .delete(tabela)
      .where(
        inArray(
          tabela.id,
          removiveis.map((parcela) => parcela.id)
        )
      )
      .returning({ id: tabela.id });
    return { removidas: removidas.length };
  });
}
