// Reconcilia o historico do Drizzle de um banco que aplicou as migrations da integracao Conplus/Questor
// com a numeracao ANTIGA (0060..0070, antes do merge da main na PR #203) com o journal atual, em que a
// main ocupou 0060..0068 (Compras) e as da integracao viraram 0069..0079 sem mudar o SQL.
//
// Sem isto o `drizzle-kit migrate` decide pelo `when`: pularia em silencio as 0060..0067 da main (datas
// anteriores a ultima aplicada) e reaplicaria as da integracao (datas novas), quebrando em CREATE TABLE
// de tabela existente.
//
// O que faz, numa unica transacao: (1) aplica o SQL das migrations da main que faltam (0060..0068);
// (2) troca o `created_at` das linhas da integracao pelo `when` novo; (3) registra as da main. O
// resultado e um historico que e prefixo exato do journal; o resto segue pelo caminho normal
// (`bootstrap-homologacao.mjs` na 5544, `db:migrate` no desenvolvimento).
//
// Padrao: SIMULACAO somente leitura. Grava apenas com `--aplicar` e PRALIS_RECONCILIACAO_CONFIRMADA=SIM.
// Alvos aceitos: homologacao (5544/padaria_homologacao), desenvolvimento (5543/padaria) ou descartavel
// (PRALIS_RECONCILIACAO_DESCARTAVEL=SIM, banco padaria_reconciliacao_teste_* ou padaria_homologacao_teste_*,
// porta fora de 5543/5544).

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { readMigrationFiles } from "drizzle-orm/migrator";

const { Pool } = pg;
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsFolder = path.join(rootDir, "db", "migrations");

/** `when` da numeracao antiga, na ordem em que foram aplicadas, e o tag atual de cada uma. */
const ANTIGAS = [
  { when: 1792422373158, tagAtual: "0069_left_george_stacy" },
  { when: 1792426055938, tagAtual: "0070_kind_squirrel_girl" },
  { when: 1792513409463, tagAtual: "0071_light_xorn" },
  { when: 1792585113004, tagAtual: "0072_conplus_importacoes" },
  { when: 1792679633583, tagAtual: "0073_questor_configuracao" },
  { when: 1792679639569, tagAtual: "0074_questor_cadastros" },
  { when: 1792679651282, tagAtual: "0075_questor_contrato_dp" },
  { when: 1792685411122, tagAtual: "0076_e5_campos_candidato" },
  { when: 1792691856390, tagAtual: "0077_questor_exportacoes" },
  { when: 1792692289455, tagAtual: "0078_conplus_api_estrutura" },
  { when: 1792760751638, tagAtual: "0079_eventos_layout_oficial" }
];
/** Ultima migration comum as duas numeracoes. */
const IDX_BASE = 59;
/** A antiga 0061 ganhou depois o bloco idempotente da UNIQUE: o hash gravado e o do arquivo anterior. */
const HASH_DIFERENTE_ACEITO = new Set(["0070_kind_squirrel_girl"]);

const ALVOS = [
  { porta: "5544", banco: "padaria_homologacao" },
  { porta: "5543", banco: "padaria" }
];

function falhar(mensagem) {
  throw new Error(`[reconciliar-migrations] ${mensagem}`);
}

function conexao(databaseUrl, aplicar) {
  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    falhar("DATABASE_URL invalida");
  }
  const host = url.hostname === "[::1]" ? "::1" : url.hostname;
  const porta = url.port || "5432";
  const banco = decodeURIComponent(url.pathname.replace(/^\//u, ""));
  const descartavel = process.env.PRALIS_RECONCILIACAO_DESCARTAVEL === "SIM";

  if (process.env.NODE_ENV === "production") falhar("recusado em NODE_ENV=production");
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) falhar("host fora da lista local permitida");
  if (descartavel) {
    if (porta === "5543" || porta === "5544") falhar("teste descartavel nao pode usar as portas 5543 ou 5544");
    if (!/^padaria_(?:reconciliacao|homologacao)_teste_[a-z0-9_-]+$/u.test(banco)) {
      falhar("banco descartavel deve usar o prefixo padaria_reconciliacao_teste_ ou padaria_homologacao_teste_");
    }
  } else if (!ALVOS.some((alvo) => alvo.porta === porta && alvo.banco === banco)) {
    falhar("alvo fora da lista (5544/padaria_homologacao ou 5543/padaria)");
  }
  if (aplicar && process.env.PRALIS_RECONCILIACAO_CONFIRMADA !== "SIM") {
    falhar("--aplicar exige PRALIS_RECONCILIACAO_CONFIRMADA=SIM");
  }
  return { banco, porta, descartavel };
}

/** Decide o que fazer a partir do historico gravado; nao escreve nada. */
function planejar(historico, migrations, journal) {
  const tags = journal.entries.map((entrada) => entrada.tag);
  const porTag = new Map(tags.map((tag, idx) => [tag, migrations[idx]]));

  if (historico.length <= IDX_BASE + 1) falhar("historico sem nenhuma migration da numeracao antiga");
  for (let idx = 0; idx <= IDX_BASE; idx++) {
    if (historico[idx]?.created_at !== String(migrations[idx]?.folderMillis)) {
      falhar(`historico diverge do journal antes da ${String(IDX_BASE + 1).padStart(4, "0")} (posicao ${idx})`);
    }
  }

  const resto = historico.slice(IDX_BASE + 1);
  if (resto.every((linha, i) => linha.created_at === String(migrations[IDX_BASE + 1 + i]?.folderMillis))) {
    falhar("historico ja segue a numeracao atual: nada a reconciliar");
  }
  if (resto.length > ANTIGAS.length) falhar("historico tem mais migrations do que a numeracao antiga conhecia");

  const renomear = resto.map((linha, i) => {
    const antiga = ANTIGAS[i];
    if (!antiga || linha.created_at !== String(antiga.when)) {
      falhar(`linha ${IDX_BASE + 1 + i} (${linha.created_at}) nao e a migration antiga esperada`);
    }
    const atual = porTag.get(antiga.tagAtual);
    if (!atual) falhar(`${antiga.tagAtual} ausente do journal`);
    if (linha.hash !== atual.hash && !HASH_DIFERENTE_ACEITO.has(antiga.tagAtual)) {
      falhar(`${antiga.tagAtual}: o SQL aplicado no banco nao e o mesmo do arquivo atual`);
    }
    return { id: linha.id, de: antiga.when, para: atual.folderMillis, tag: antiga.tagAtual };
  });

  const ultimoIdx = tags.indexOf(renomear.at(-1).tag);
  const faltam = [];
  for (let idx = IDX_BASE + 1; idx <= ultimoIdx; idx++) {
    if (!renomear.some((item) => item.tag === tags[idx])) faltam.push({ tag: tags[idx], migration: migrations[idx] });
  }
  if (faltam.some((item) => ANTIGAS.some((antiga) => antiga.tagAtual === item.tag))) {
    falhar("o historico antigo tem buraco no meio: reconciliacao recusada");
  }
  return { renomear, faltam, total: ultimoIdx + 1 };
}

async function lerHistorico(cliente) {
  const tabela = await cliente.query("SELECT to_regclass('drizzle.__drizzle_migrations') AS t");
  if (!tabela.rows[0].t) falhar("banco sem drizzle.__drizzle_migrations");
  const linhas = await cliente.query(
    "SELECT id, hash, created_at::text AS created_at FROM drizzle.__drizzle_migrations ORDER BY created_at ASC"
  );
  return linhas.rows;
}

async function main() {
  const aplicar = process.argv.includes("--aplicar");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) falhar("DATABASE_URL obrigatoria");
  const info = conexao(databaseUrl, aplicar);
  const journal = JSON.parse(readFileSync(path.join(migrationsFolder, "meta", "_journal.json"), "utf8"));
  const migrations = readMigrationFiles({ migrationsFolder });

  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    await cliente.query("LOCK TABLE drizzle.__drizzle_migrations IN EXCLUSIVE MODE");
    const plano = planejar(await lerHistorico(cliente), migrations, journal);
    const resumo =
      `banco=${info.banco}|renomear=${plano.renomear.length}|aplicar_sql=${plano.faltam.map((f) => f.tag.slice(0, 4)).join(",")}` +
      `|migrations_depois=${plano.total}`;

    if (!aplicar) {
      await cliente.query("ROLLBACK");
      console.log(`estado=simulacao|${resumo}`);
      return;
    }

    for (const { migration } of plano.faltam) {
      for (const comando of migration.sql) {
        if (comando.trim()) await cliente.query(comando);
      }
    }
    for (const item of plano.renomear) {
      await cliente.query("UPDATE drizzle.__drizzle_migrations SET created_at = $1 WHERE id = $2 AND created_at = $3", [
        item.para,
        item.id,
        item.de
      ]);
    }
    for (const { migration } of plano.faltam) {
      await cliente.query("INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)", [
        migration.hash,
        migration.folderMillis
      ]);
    }

    const depois = await lerHistorico(cliente);
    const prefixo =
      depois.length === plano.total &&
      depois.every((linha, idx) => linha.created_at === String(migrations[idx]?.folderMillis));
    if (!prefixo) falhar("depois da reconciliacao o historico nao e prefixo exato do journal; nada foi gravado");
    await cliente.query("COMMIT");
    console.log(`estado=reconciliado|${resumo}`);
  } catch (erro) {
    await cliente.query("ROLLBACK").catch(() => undefined);
    throw erro;
  } finally {
    cliente.release();
    await pool.end();
  }
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : "erro desconhecido");
  process.exitCode = 1;
});
