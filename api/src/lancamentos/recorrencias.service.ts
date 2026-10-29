import { and, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { despesas } from "@padaria/db/schema/despesa";
import { lancamentosRecorrencias } from "@padaria/db/schema/lancamento";
import { mercadorias } from "@padaria/db/schema/mercadoria";
import { retiradas } from "@padaria/db/schema/retirada";
import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import { diaNegocio } from "@padaria/shared/datas";
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
  // Dia de negocio em Sao Paulo (BUG B): em UTC, das 21h a meia-noite o "hoje" ja seria amanha e a
  // parcela de amanha deixaria de ser futura (nao seria cancelada).
  hoje = diaNegocio(new Date())
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

    // O DELETE reavalia TODOS os predicados da R-063 no proprio comando (READ COMMITTED refaz o
    // teste sobre a versao corrente da linha): parcela que foi PAGA, ou que ganhou `caixa_id`
    // novo, entre a listagem e o DELETE, escapa sozinha — a revisao pegou a versao anterior, que
    // decidia por retrato sem trava e confiava numa lista de ids. So cai parcela sem caixa ou de
    // caixa ABERTO E TRAVADO acima; caixa que apareceu depois (nunca travado) preserva a parcela.
    const caixasAbertosTravados = [...caixasVistos].filter((caixaId) => !caixasFechados.has(caixaId));
    const removidas = await tx
      .delete(tabela)
      .where(
        and(
          eq(tabela.recorrenciaId, recorrenciaId),
          gt(tabela.dataVencimento, hoje),
          isNull(tabela.dataPagamento),
          caixasAbertosTravados.length > 0
            ? or(isNull(tabela.caixaId), inArray(tabela.caixaId, caixasAbertosTravados))
            : isNull(tabela.caixaId)
        )
      )
      .returning({ id: tabela.id });
    return { removidas: removidas.length };
  });
}
