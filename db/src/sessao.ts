import { sql } from "drizzle-orm";

// Tetos POR TRANSACAO da API (P0 lancamento x fechamento do caixa). `set_config(..., true)` e
// LOCAL: vale so ate o commit/rollback da transacao que o executa — migrations, better-auth e um
// eventual pooler no DATABASE_URL ficam de fora (a revisao final derrubou a versao anterior, que
// punha os tetos no startup packet do pool inteiro).
//
// Mora no pacote de banco porque SQL cru e proibido em `api/src` (scripts/verificar-arquitetura):
// a API importa a constante pronta e executa dentro de `executarEmTransacao`.
export const sqlTetosDaTransacaoApi = sql`select set_config('lock_timeout', '10s', true), set_config('idle_in_transaction_session_timeout', '60s', true)`;
