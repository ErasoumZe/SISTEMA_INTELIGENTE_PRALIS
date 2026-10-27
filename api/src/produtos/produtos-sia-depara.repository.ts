import { count, eq, max } from "drizzle-orm";
import type { LinhaDeParaSia } from "@padaria/shared/produtos";
import { empresas, siaProdutoDepara } from "@padaria/db/schema/cadastro";
import { banco, executarEmTransacao } from "../banco/conexao.js";

/** Quantas linhas a loja tem hoje (o que a importacao substituiria) e quando foi a ultima. */
export async function situacaoDoDeParaRepository(empresaId: string) {
  const [linha] = await banco
    .select({ total: count(), importadoEm: max(siaProdutoDepara.importadoEm) })
    .from(siaProdutoDepara)
    .where(eq(siaProdutoDepara.empresaId, empresaId));
  return { total: Number(linha?.total ?? 0), importadoEm: linha?.importadoEm ?? null };
}

/**
 * Substitui o de-para da loja INTEIRO numa transacao so (oficial): a exportacao e a verdade daquele
 * momento — mesclar deixaria produto que o SIA apagou e mandaria o TXT atualizar item inexistente.
 */
export async function substituirDeParaRepository(empresaId: string, linhas: LinhaDeParaSia[]): Promise<number> {
  return executarEmTransacao(async (tx) => {
    // Serializa duas importacoes da mesma loja (a segunda espera a primeira, nunca colide no indice).
    await tx.select({ id: empresas.id }).from(empresas).where(eq(empresas.id, empresaId)).for("update");
    const apagadas = await tx
      .delete(siaProdutoDepara)
      .where(eq(siaProdutoDepara.empresaId, empresaId))
      .returning({ id: siaProdutoDepara.id });
    for (let inicio = 0; inicio < linhas.length; inicio += 500) {
      await tx
        .insert(siaProdutoDepara)
        .values(linhas.slice(inicio, inicio + 500).map((linha) => ({ ...linha, empresaId, importadoEm: new Date() })));
    }
    return apagadas.length;
  });
}

/** O de-para de todas as lojas, com o prefixo de matricula da empresa (que diz qual loja ela e). */
export async function deParaDeTodasAsLojasRepository() {
  return banco
    .select({
      matriculaPrefixo: empresas.matriculaPrefixo,
      chaveBarras: siaProdutoDepara.chaveBarras,
      aliqSaidaEcf: siaProdutoDepara.aliqSaidaEcf,
      reducao: siaProdutoDepara.reducao,
      aliquotaInterna: siaProdutoDepara.aliquotaInterna,
      codGrupo: siaProdutoDepara.codGrupo,
      ncm: siaProdutoDepara.ncm
    })
    .from(siaProdutoDepara)
    .innerJoin(empresas, eq(siaProdutoDepara.empresaId, empresas.id));
}
