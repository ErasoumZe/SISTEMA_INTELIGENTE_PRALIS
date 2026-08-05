import { empresas } from "@padaria/db/schema";
import { banco } from "../banco/conexao.js";

/**
 * Ida e volta ao Postgres para o `/health` (G-04 / D-21).
 *
 * A issue pedia `SELECT 1`, mas SQL cru é proibido em `api/src` — o `verificar-arquitetura.mjs`
 * barra tanto o template marcado do Drizzle quanto a consulta direta pelo driver, em qualquer
 * arquivo da API. Abrir exceção numa trava dessas por causa de uma linha não se paga.
 *
 * O que ficou no lugar é mais forte, e não um contorno: um `select ... limit 1` pelo construtor do
 * Drizzle na tabela raiz. `SELECT 1` responde OK mesmo conectado ao banco ERRADO ou a um banco vazio
 * sem migration nenhuma — os dois casos em que a API não tem como servir e mesmo assim ficaria
 * verde. Esta consulta prova conexão E que o schema da aplicação está lá.
 *
 * Zero linha é sucesso: o que se mede aqui é o banco responder, não haver empresa cadastrada.
 */
export async function pingBancoRepository(): Promise<void> {
  await banco.select({ id: empresas.id }).from(empresas).limit(1);
}
