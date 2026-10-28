import { sql, type SQLWrapper } from "drizzle-orm";

// Tetos POR TRANSACAO da API (P0 lancamento x fechamento do caixa). `set_config(..., true)` e
// LOCAL: vale so ate o commit/rollback da transacao que o executa — migrations, better-auth e um
// eventual pooler no DATABASE_URL ficam de fora (a revisao final derrubou a versao anterior, que
// punha os tetos no startup packet do pool inteiro).
//
// Mora no pacote de banco porque SQL cru e proibido em `api/src` (scripts/verificar-arquitetura):
// a API importa a constante pronta e executa dentro de `executarEmTransacao`.
export const sqlTetosDaTransacaoApi = sql`select set_config('lock_timeout', '10s', true), set_config('idle_in_transaction_session_timeout', '60s', true)`;

// Serializa a escolha de codigo interno global e as verificacoes de duplicidade no cadastro.
//
// Por que advisory e nao uma trava de linha: as duas coisas que precisam ser seriais aqui —
// escolher o proximo `codigo_interno` (max + 1) e decidir se ja existe duplicado — leem o
// AGREGADO da tabela, nao uma linha. `SELECT max(...)` nao trava nada em READ COMMITTED, entao
// dois cadastros simultaneos leem o mesmo maximo e o segundo estoura o unique
// `produtos_codigo_interno_empresa_uidx` (ou, sem ele, duplicaria em silencio). A sequência oficial
// considera as lojas em conjunto, então todas as empresas usam a mesma trava.
//
// `pg_advisory_xact_lock` solta sozinho no commit/rollback e nao exige migration nem coluna nova.
// O escopo é global; a trava transacional não exige migration nem coluna nova.
//
// Mora aqui porque SQL cru e proibido em `api/src` (scripts/verificar-arquitetura).
export function sqlTravarCadastroDeProdutos() {
  return sql`select pg_advisory_xact_lock(hashtext('produtos:codigo-interno-global'))`;
}

/**
 * Consulta completa do maior código interno numérico dentro da faixa de produtos (app oficial): empresas e
 * catálogo BASE juntos. Sempre devolve UMA linha (`maximo`), mesmo sem nenhum produto — selecionar a expressão
 * "from produtos" devolvia zero linhas com a tabela vazia e ignorava os códigos da BASE.
 */
export function sqlConsultaMaiorCodigoInterno() {
  const codigoEmpresa = sql.raw('"produtos"."codigo_interno"');
  const numeroEmpresa = sql`NULLIF(regexp_replace(${codigoEmpresa}, '\\D', '', 'g'), '')`;
  const codigoBase = sql.raw('"produtos_catalogo_base"."codigo_interno"');
  const numeroBase = sql`NULLIF(regexp_replace(${codigoBase}, '\\D', '', 'g'), '')`;
  return sql`SELECT (
    SELECT COALESCE(MAX(codigo), 13129)::numeric
    FROM (
      SELECT CASE
        WHEN ${numeroEmpresa} ~ '^[0-9]+$' AND ${numeroEmpresa}::numeric < 700000
        THEN ${numeroEmpresa}::numeric
        ELSE NULL
      END AS codigo
      FROM produtos
      UNION ALL
      SELECT CASE
        WHEN ${numeroBase} ~ '^[0-9]+$' AND ${numeroBase}::numeric < 700000
        THEN ${numeroBase}::numeric
        ELSE NULL
      END AS codigo
      FROM produtos_catalogo_base
    ) AS codigos_internos
  ) AS maximo`;
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
 * Serializa a APLICACAO da carga inicial de preco-base de UMA empresa.
 *
 * Por que advisory e nao a trava da linha: a regra ("a carga inicial acontece uma unica vez por
 * empresa", R-218) depende de um agregado — "existe alguma importacao aplicada?" — e nao da linha
 * sendo aplicada. O `FOR UPDATE` da importacao escolhida nao impede duas importacoes DIFERENTES de
 * passarem juntas pela mesma pre-checagem em READ COMMITTED: com produtos disjuntos as duas gravam
 * e a regra e violada em silencio; com produtos em comum uma morre no indice parcial e devolve 500.
 *
 * Mora aqui porque SQL cru e proibido em `api/src` (scripts/verificar-arquitetura).
 */
export function sqlTravarPrecoBaseDaEmpresa(empresaId: string) {
  return sql`select pg_advisory_xact_lock(hashtext('compras:preco-base'), hashtext(${empresaId}::text))`;
}

/** Serializa a escolha da próxima matrícula dentro de uma empresa. */
export function sqlTravarMatriculaDaEmpresa(empresaId: string) {
  return sql`select pg_advisory_xact_lock(hashtext('dp:matricula'), hashtext(${empresaId}::text))`;
}

/**
 * Serializa, dentro da transacao corrente, tudo que decide sobre a rodada de cotacao de UMA
 * solicitacao — abrir, enviar convite, registrar resposta e adjudicar/fechar (Fase 2 do Compras).
 *
 * Por que advisory e nao so a linha da rodada: a regra "uma rodada aberta por solicitacao" e
 * "resposta tardia nunca substitui compra realizada" dependem de agregados que cruzam rodada,
 * convite, proposta e adjudicacao; o `FOR UPDATE` de uma linha nao impede duas transacoes de
 * passarem juntas pela pre-checagem em READ COMMITTED. O escopo e a SOLICITACAO (casa com o unique
 * parcial `compras_rodadas_solicitacao_aberta_unica`): solicitacoes diferentes nunca esperam uma
 * pela outra. Solta sozinho no commit/rollback. É a primeira trava da ordem canonica (PROJECT_BRAIN
 * 54): advisory por rodada -> rodada FOR UPDATE -> convite FOR UPDATE -> itens do envelope.
 *
 * Mora aqui porque SQL cru e proibido em `api/src` (scripts/verificar-arquitetura).
 */
export function sqlTravarRodadaDeCompras(solicitacaoId: string) {
  return sql`select pg_advisory_xact_lock(hashtext('compras:rodada'), hashtext(${solicitacaoId}::text))`;
}

/** Expressao unica para comparar CPF com ou sem mascara nas consultas do dominio. */
export function sqlCpfNormalizado(cpf: SQLWrapper) {
  return sql`regexp_replace(${cpf}, '\\D', '', 'g')`;
}
