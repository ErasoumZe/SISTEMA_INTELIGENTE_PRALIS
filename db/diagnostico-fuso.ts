// Diagnostico do fuso (SOMENTE LEITURA). Conta e amostra os fechamentos_caixa cujo data_movimento
// ficou no dia UTC errado (bug corrigido no codigo em fc39e34). NAO altera nada — so SELECT.
//
// Rodar ONDE a DATABASE_URL existe (ex.: shell do servico api no Coolify), no mesmo padrao dos
// scripts de prod:
//
//   npx tsx db/diagnostico-fuso.ts
//   (ou:  npm run diagnostico:fuso -w db )
//
// diaNegocio() = (data_hora_abertura AT TIME ZONE 'America/Sao_Paulo')::date. Afetados: caixas
// abertos na janela ~21:00-23:59 BRT. Depois de ver a contagem, o UPDATE corretivo esta no
// fim deste arquivo (comentado) e so deve rodar apos revisao/aprovacao.
import "dotenv/config";
import pg from "pg";

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) {
  console.error("DATABASE_URL ausente. Rode onde o secret existe (servico api no Coolify).");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl });

const CONDICAO = `data_hora_abertura IS NOT NULL
  AND data_movimento <> (data_hora_abertura AT TIME ZONE 'America/Sao_Paulo')::date`;

try {
  const { rows: contagem } = await pool.query<{ total_errados: string }>(
    `SELECT count(*)::int AS total_errados FROM fechamentos_caixa WHERE ${CONDICAO};`
  );
  const total = Number(contagem[0]?.total_errados ?? 0);
  console.info(`\n=== fechamentos_caixa com data_movimento no dia errado: ${total} ===\n`);

  if (total > 0) {
    const { rows: amostra } = await pool.query(
      `SELECT id, empresa_id, pdv_id,
              data_movimento                                             AS data_movimento_gravado,
              data_hora_abertura,
              (data_hora_abertura AT TIME ZONE 'America/Sao_Paulo')::date AS dia_local_correto,
              status
       FROM fechamentos_caixa
       WHERE ${CONDICAO}
       ORDER BY data_hora_abertura DESC
       LIMIT 30;`
    );
    console.table(amostra);
    console.info("\nPARE aqui. Cole a contagem + amostra para revisao ANTES de qualquer UPDATE corretivo.\n");
  } else {
    console.info("Nada a corrigir — o dado historico esta limpo.\n");
  }
} finally {
  await pool.end();
}

// --- CORRECAO (NAO roda neste script) -----------------------------------------------------------
// So apos revisar a contagem e aprovar, rodar manualmente (idempotente):
//
// UPDATE fechamentos_caixa
// SET data_movimento = (data_hora_abertura AT TIME ZONE 'America/Sao_Paulo')::date
// WHERE data_hora_abertura IS NOT NULL
//   AND data_movimento <> (data_hora_abertura AT TIME ZONE 'America/Sao_Paulo')::date;
