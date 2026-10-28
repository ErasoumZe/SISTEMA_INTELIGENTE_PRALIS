import { and, asc, eq, inArray, isNotNull, type SQL } from "drizzle-orm";
import { produtos, siaProdutoDepara } from "@padaria/db/schema/cadastro";
import { banco, type ExecutorBanco, type TransacaoBanco } from "../banco/conexao.js";

/**
 * A balanca da loja como os planos de pesavel do app oficial leem (R-222): produtos e o de-para do SIA.
 * `pesavel` vira 'S'/'N'/null para os planos do oficial ficarem literais. Com `bloquear`, trava as linhas
 * ate o fim da transacao — a aplicacao confere o hash da previa contra o que esta travado.
 */
export interface FiltroDaBalanca {
  bloquear: boolean;
  /** Pesaveis pela exportacao: so quem tem codigo interno (o plano casa por ele). */
  comCodigoInterno?: boolean;
  /** Padronizar: so os ativos (oficial `status = 'ativo'`). */
  somenteAtivos?: boolean;
  /** Ordem do de-para (entra no hash da previa): o backfill do oficial ordena por coditem. */
  espelhoPorCoditem?: boolean;
}

export async function estadoDaBalancaRepository(empresaId: string, filtro: FiltroDaBalanca, tx: ExecutorBanco = banco) {
  const condicoes: SQL[] = [eq(produtos.empresaId, empresaId)];
  if (filtro.comCodigoInterno) condicoes.push(isNotNull(produtos.codigoInterno));
  if (filtro.somenteAtivos) condicoes.push(eq(produtos.status, "ativo"));
  const consultaProdutos = tx
    .select({
      id: produtos.id,
      codigoInterno: produtos.codigoInterno,
      codigoBarras: produtos.codigoBarras,
      nomeCatalogo: produtos.nomeCatalogo,
      descricao: produtos.descricao,
      pesavel: produtos.pesavel,
      teclaBalanca: produtos.teclaBalanca,
      validadeBalanca: produtos.validadeBalanca
    })
    .from(produtos)
    .where(and(...condicoes))
    .orderBy(asc(produtos.id));
  const consultaEspelhos = tx
    .select({
      id: siaProdutoDepara.id,
      coditem: siaProdutoDepara.coditem,
      chaveBarras: siaProdutoDepara.chaveBarras,
      pesavel: siaProdutoDepara.pesavel,
      teclaBalanca: siaProdutoDepara.teclaBalanca,
      validadeBalanca: siaProdutoDepara.validadeBalanca
    })
    .from(siaProdutoDepara)
    .where(eq(siaProdutoDepara.empresaId, empresaId))
    .orderBy(asc(filtro.espelhoPorCoditem ? siaProdutoDepara.coditem : siaProdutoDepara.id));
  const [linhas, espelhos] = filtro.bloquear
    ? [await consultaProdutos.for("update"), await consultaEspelhos.for("update")]
    : [await consultaProdutos, await consultaEspelhos];
  return {
    produtos: linhas.map((linha) => ({
      id: linha.id,
      codigoInterno: linha.codigoInterno,
      codigoBarras: linha.codigoBarras,
      nome: linha.nomeCatalogo ?? linha.descricao,
      pesavel: linha.pesavel == null ? null : linha.pesavel ? "S" : "N",
      teclaBalanca: linha.teclaBalanca,
      validadeBalanca: linha.validadeBalanca
    })),
    espelhos
  };
}

export interface BalancaDoProduto {
  pesavel: "S" | "N";
  teclaBalanca: number;
  validadeBalanca: number;
}

/** Grava pesavel/tecla/validade nos produtos (em lotes de 500, como o oficial). */
export async function gravarBalancaDosProdutosRepository(tx: TransacaoBanco, ids: string[], valores: BalancaDoProduto) {
  for (let inicio = 0; inicio < ids.length; inicio += 500) {
    await tx
      .update(produtos)
      .set({
        pesavel: valores.pesavel === "S",
        teclaBalanca: valores.teclaBalanca,
        validadeBalanca: valores.validadeBalanca,
        atualizadoEm: new Date()
      })
      .where(inArray(produtos.id, ids.slice(inicio, inicio + 500)));
  }
}

/** O mesmo no de-para do SIA, na grafia de texto dele ('000', '5'). */
export async function gravarBalancaDoEspelhoRepository(
  tx: TransacaoBanco,
  ids: string[],
  valores: { pesavel: string; teclaBalanca: string; validadeBalanca: string }
) {
  for (let inicio = 0; inicio < ids.length; inicio += 500) {
    await tx
      .update(siaProdutoDepara)
      .set(valores)
      .where(inArray(siaProdutoDepara.id, ids.slice(inicio, inicio + 500)));
  }
}
