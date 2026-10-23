import { executarSql } from "./integracao.js";

/**
 * Doc 57 §5: cada fechamento de rodada grava a MENOR oferta como a nova base do produto. Os testes de Compras
 * dividem o mesmo produto do seed, entao cada caso volta para a base importada do proprio arquivo — senao herda
 * a referencia que o caso anterior deixou (e um 12 "acima da base" passa a comprar sozinho).
 *
 * A base de origem 'rodada' nao pode ser apagada (o item da rodada aponta para ela): a vigencia e encerrada e a
 * importada volta a valer.
 */
export async function restaurarBaseImportada(empresaId: string, produtoIds: string[], precoBaseImportadoId: string) {
  await executarSql(
    "update produtos_precos_base set valido_ate = valido_desde + interval '1 millisecond' where empresa_id = $1 and produto_id = any($2) and origem = 'rodada' and valido_ate is null",
    [empresaId, produtoIds]
  );
  await executarSql("update produtos_precos_base set valido_ate = null where id = $1", [precoBaseImportadoId]);
}
