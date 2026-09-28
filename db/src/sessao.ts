import { sql } from "drizzle-orm";

// Tetos POR TRANSACAO da API (P0 lancamento x fechamento do caixa). `set_config(..., true)` e
// LOCAL: vale so ate o commit/rollback da transacao que o executa — migrations, better-auth e um
// eventual pooler no DATABASE_URL ficam de fora (a revisao final derrubou a versao anterior, que
// punha os tetos no startup packet do pool inteiro).
//
// Mora no pacote de banco porque SQL cru e proibido em `api/src` (scripts/verificar-arquitetura):
// a API importa a constante pronta e executa dentro de `executarEmTransacao`.
export const sqlTetosDaTransacaoApi = sql`select set_config('lock_timeout', '10s', true), set_config('idle_in_transaction_session_timeout', '60s', true)`;

// Serializa o CADASTRO DE PRODUTOS de UMA empresa dentro da transacao corrente.
//
// Por que advisory e nao uma trava de linha: as duas coisas que precisam ser seriais aqui —
// escolher o proximo `codigo_interno` (max + 1) e decidir se ja existe duplicado — leem o
// AGREGADO da tabela, nao uma linha. `SELECT max(...)` nao trava nada em READ COMMITTED, entao
// dois cadastros simultaneos leem o mesmo maximo e o segundo estoura o unique
// `produtos_codigo_interno_empresa_uidx` (ou, sem ele, duplicaria em silencio).
//
// `pg_advisory_xact_lock` solta sozinho no commit/rollback e nao exige migration nem coluna nova.
// O escopo e a EMPRESA: duas lojas cadastrando ao mesmo tempo nao esperam uma pela outra, e o
// volume real (dezenas de cadastros por dia) nao justifica nada mais fino.
//
// Mora aqui porque SQL cru e proibido em `api/src` (scripts/verificar-arquitetura).
export function sqlTravarCadastroDeProdutosDaEmpresa(empresaId: string) {
  return sql`select pg_advisory_xact_lock(hashtext('produtos:cadastro'), hashtext(${empresaId}::text))`;
}

/**
 * Serializa, dentro da transacao corrente, tudo que decide sobre a MESMA PESSOA na MESMA empresa —
 * criar periodo de teste e criar admissao direta.
 *
 * Por que advisory e nao indice: a garantia precisa cruzar DUAS tabelas. `admissoes_testes` tem o
 * seu unique parcial e `admissoes_processos` tem o dele, mas indice nao enxerga a tabela vizinha, e
 * as duas pre-checagens em READ COMMITTED nao travam nada — duas transacoes simultaneas passam pelas
 * duas e as duas gravam. Alegar que o indice resolve seria mentira.
 *
 * A chave e (empresa, CPF): duas pessoas diferentes nunca esperam uma pela outra, e a mesma pessoa
 * em empresas diferentes tambem nao — que e o caso real de uma rede. Solta sozinho no commit ou no
 * rollback.
 *
 * Mora aqui porque SQL cru e proibido em `api/src` (scripts/verificar-arquitetura).
 */
export function sqlTravarAdmissaoDaPessoa(empresaId: string, cpf: string) {
  return sql`select pg_advisory_xact_lock(hashtext('admissoes:pessoa'), hashtext(${empresaId}::text || ':' || ${cpf}::text))`;
}

/**
 * A matricula e sequencial dentro de uma empresa. A escolha do proximo numero le um agregado, e
 * agregado nao se trava sozinho em READ COMMITTED; por isso a trava advisory e por empresa.
 */
export function sqlTravarMatriculaDaEmpresa(empresaId: string) {
  return sql`select pg_advisory_xact_lock(hashtext('dp:matricula'), hashtext(${empresaId}::text))`;
}
