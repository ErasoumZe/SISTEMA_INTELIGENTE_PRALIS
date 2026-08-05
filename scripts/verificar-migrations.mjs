// Paridade entre `db/migrations/*.sql`, `meta/_journal.json` e `meta/*_snapshot.json`.
//
// O `drizzle-kit check` so olha versao do snapshot e colisao de prevId: ele NAO percebe um snapshot
// que ficou para tras. Quando isso acontece o proximo `db:generate` reemite um `ALTER TABLE ... ADD
// COLUMN` que ja existe no banco, sem `IF NOT EXISTS`, e o deploy quebra na migration. Ja aconteceu
// duas vezes (0027/0028 e 0029), por isso esta verificacao entra no `npm run check`.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const raiz = process.cwd();
const pastaMigrations = path.join(raiz, "db", "migrations");
const pastaMeta = path.join(pastaMigrations, "meta");
const caminhoJournal = path.join(pastaMeta, "_journal.json");

const falhas = [];

function falhar(motivo) {
  falhas.push(motivo);
}

function encerrar() {
  console.error("[migrations] ERRO: paridade quebrada entre SQL, journal e snapshots");
  for (const falha of falhas) console.error(`[migrations] - ${falha}`);
  console.error("[migrations] gere de novo com `npm run db:generate --workspace @padaria/db` ou");
  console.error("[migrations] recupere o arquivo faltando do historico do git antes de subir.");
  process.exit(1);
}

function sufixoSnapshot(idx) {
  return `${String(idx).padStart(4, "0")}_snapshot.json`;
}

function lerJson(caminho) {
  try {
    return JSON.parse(readFileSync(caminho, "utf8"));
  } catch (erro) {
    falhar(`${path.relative(raiz, caminho).replaceAll("\\", "/")}: JSON invalido (${erro.message})`);
    return null;
  }
}

for (const pasta of [pastaMigrations, pastaMeta]) {
  if (!existsSync(pasta)) falhar(`pasta ausente: ${path.relative(raiz, pasta).replaceAll("\\", "/")}`);
}
if (!existsSync(caminhoJournal)) falhar("db/migrations/meta/_journal.json ausente");
if (falhas.length) encerrar();

const arquivosSql = readdirSync(pastaMigrations)
  .filter((nome) => nome.endsWith(".sql"))
  .sort();
const arquivosSnapshot = readdirSync(pastaMeta)
  .filter((nome) => /^\d{4}_snapshot\.json$/u.test(nome))
  .sort();

const journal = lerJson(caminhoJournal);
if (falhas.length) encerrar();

const entradas = Array.isArray(journal?.entries) ? journal.entries : null;
if (!entradas) {
  falhar("_journal.json nao tem a lista `entries`");
  encerrar();
}

// 1. As tres contagens tem que bater. E o sintoma mais barato de detectar.
if (arquivosSql.length !== entradas.length || arquivosSnapshot.length !== entradas.length) {
  falhar(
    `contagens divergentes: ${arquivosSql.length} arquivo(s) .sql, ${entradas.length} entrada(s) no ` +
      `journal, ${arquivosSnapshot.length} snapshot(s)`
  );
}

// 2. Cada entrada do journal precisa do seu .sql (pelo tag) e do seu snapshot (pelo idx).
const sqlPorNome = new Set(arquivosSql);
const snapshotPorNome = new Set(arquivosSnapshot);
const sqlEsperados = new Set();
const snapshotsEsperados = new Set();
const indicesVistos = new Set();

for (const [posicao, entrada] of entradas.entries()) {
  const rotulo = entrada?.tag ?? `entrada #${posicao}`;

  if (typeof entrada?.idx !== "number") {
    falhar(`journal: ${rotulo} sem idx numerico`);
    continue;
  }
  if (typeof entrada?.tag !== "string" || entrada.tag.length === 0) {
    falhar(`journal: entrada idx ${entrada.idx} sem tag`);
    continue;
  }

  if (entrada.idx !== posicao) falhar(`journal: idx ${entrada.idx} fora de ordem (esperado ${posicao})`);
  if (indicesVistos.has(entrada.idx)) falhar(`journal: idx ${entrada.idx} duplicado`);
  indicesVistos.add(entrada.idx);

  const prefixoTag = entrada.tag.slice(0, 4);
  if (prefixoTag !== String(entrada.idx).padStart(4, "0")) {
    falhar(`journal: tag ${entrada.tag} nao casa com o idx ${entrada.idx}`);
  }

  const nomeSql = `${entrada.tag}.sql`;
  sqlEsperados.add(nomeSql);
  if (!sqlPorNome.has(nomeSql)) falhar(`db/migrations/${nomeSql} nao existe, mas esta no journal`);

  const nomeSnapshot = sufixoSnapshot(entrada.idx);
  snapshotsEsperados.add(nomeSnapshot);
  if (!snapshotPorNome.has(nomeSnapshot)) {
    falhar(`db/migrations/meta/${nomeSnapshot} nao existe (migration ${entrada.tag} ficou sem snapshot)`);
  }
}

// 3. O caminho inverso: arquivo solto que ninguem registrou no journal nunca roda em producao.
for (const nome of arquivosSql) {
  if (!sqlEsperados.has(nome)) falhar(`db/migrations/${nome} nao esta no journal (nao seria aplicado)`);
}
for (const nome of arquivosSnapshot) {
  if (!snapshotsEsperados.has(nome)) falhar(`db/migrations/meta/${nome} nao corresponde a nenhuma entrada do journal`);
}

// 4. Corrente de prevId. Um snapshot regravado fora de ordem passa nas contagens e quebra o generate.
const RAIZ_DA_CORRENTE = "00000000-0000-0000-0000-000000000000";
let idAnterior = RAIZ_DA_CORRENTE;

for (const entrada of entradas) {
  if (typeof entrada?.idx !== "number") continue;
  const nomeSnapshot = sufixoSnapshot(entrada.idx);
  if (!snapshotPorNome.has(nomeSnapshot)) {
    idAnterior = null;
    continue;
  }

  const snapshot = lerJson(path.join(pastaMeta, nomeSnapshot));
  if (!snapshot) {
    idAnterior = null;
    continue;
  }

  if (idAnterior !== null && snapshot.prevId !== idAnterior) {
    falhar(
      `db/migrations/meta/${nomeSnapshot}: prevId ${snapshot.prevId} nao aponta para o snapshot anterior ` +
        `(${idAnterior})`
    );
  }
  idAnterior = typeof snapshot.id === "string" ? snapshot.id : null;
}

if (falhas.length) encerrar();

console.info(`[migrations] OK ${entradas.length} migration(s) com .sql, entrada no journal e snapshot correspondentes`);
