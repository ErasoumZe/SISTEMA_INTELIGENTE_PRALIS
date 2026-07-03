// Restore do Postgres via pg_restore. DESTRUTIVO: recria objetos (--clean --if-exists).
// Exige --confirmar para rodar, para nao apagar dados por acidente.
//
// Uso:
//   node scripts/restore-db.mjs backups/padaria_<carimbo>.dump --confirmar
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const databaseUrl = process.env.DATABASE_URL;
const arquivo = process.argv[2];
const confirmado = process.argv.includes("--confirmar");

if (!databaseUrl) {
  console.error("[restore] DATABASE_URL nao definido.");
  process.exit(1);
}
if (!arquivo || !existsSync(arquivo)) {
  console.error("[restore] informe o caminho de um arquivo .dump existente.");
  process.exit(1);
}
if (!confirmado) {
  console.error(
    "[restore] operacao DESTRUTIVA. Reexecute com --confirmar para restaurar sobre " +
      `${databaseUrl.replace(/:[^:@/]+@/, ":***@")}.`
  );
  process.exit(1);
}

console.info(`[restore] restaurando ${arquivo} ...`);
const resultado = spawnSync(
  "pg_restore",
  ["--clean", "--if-exists", "--no-owner", "--no-privileges", "--dbname", databaseUrl, arquivo],
  { stdio: "inherit", shell: process.platform === "win32" }
);

if (resultado.error || resultado.status !== 0) {
  console.error(`[restore] falhou (${resultado.error?.message ?? `codigo ${resultado.status}`}).`);
  process.exit(1);
}
console.info("[restore] OK.");
