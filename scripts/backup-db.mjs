// Backup do Postgres via pg_dump (formato custom, comprimido). Roda contra DATABASE_URL,
// grava em backups/ com timestamp e aplica retencao (mantem os N mais recentes).
//
// Uso:
//   node scripts/backup-db.mjs                 (usa DATABASE_URL do ambiente)
//   BACKUP_RETENCAO=30 node scripts/backup-db.mjs
//
// Requer `pg_dump` no PATH (postgres-client). Em dev, o banco roda no container:
//   docker exec padaria-db-dev-db-1 pg_dump -Fc -U padaria padaria > backups/dev.dump
// (o npm run db:backup ja resolve o caminho local — ver package.json).
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const raiz = fileURLToPath(new URL("..", import.meta.url));
const destino = path.join(raiz, "backups");
const databaseUrl = process.env.DATABASE_URL;
const retencao = Number.parseInt(process.env.BACKUP_RETENCAO ?? "14", 10);

if (!databaseUrl) {
  console.error("[backup] DATABASE_URL nao definido.");
  process.exit(1);
}

mkdirSync(destino, { recursive: true });

// Timestamp seguro para nome de arquivo (sem ':').
const carimbo = new Date().toISOString().replace(/[:.]/g, "-");
const arquivo = path.join(destino, `padaria_${carimbo}.dump`);

console.info(`[backup] gerando ${path.relative(raiz, arquivo)} ...`);
const resultado = spawnSync(
  "pg_dump",
  ["--format=custom", "--no-owner", "--no-privileges", "--file", arquivo, databaseUrl],
  { stdio: "inherit", shell: process.platform === "win32" }
);

if (resultado.error || resultado.status !== 0) {
  console.error(
    `[backup] falhou (${resultado.error?.message ?? `codigo ${resultado.status}`}). ` +
      "Confirme que pg_dump esta instalado (postgres-client) e que DATABASE_URL esta acessivel."
  );
  process.exit(1);
}

// Retencao: mantem os `retencao` dumps mais recentes.
const dumps = readdirSync(destino)
  .filter((nome) => nome.startsWith("padaria_") && nome.endsWith(".dump"))
  .map((nome) => ({ nome, mtime: statSync(path.join(destino, nome)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime);

const removidos = dumps.slice(retencao);
for (const { nome } of removidos) unlinkSync(path.join(destino, nome));

console.info(
  `[backup] OK. ${dumps.length - removidos.length} backup(s) retido(s)` +
    (removidos.length ? `, ${removidos.length} antigo(s) removido(s).` : ".")
);
