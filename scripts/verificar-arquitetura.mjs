import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const raiz = process.cwd();
const falhas = [];

function listarArquivos(diretorio, filtro) {
  if (!existsSync(diretorio)) return [];
  const encontrados = [];
  for (const entrada of readdirSync(diretorio)) {
    const caminho = path.join(diretorio, entrada);
    const stat = statSync(caminho);
    if (stat.isDirectory()) encontrados.push(...listarArquivos(caminho, filtro));
    else if (filtro(caminho)) encontrados.push(caminho);
  }
  return encontrados;
}

function texto(caminho) {
  return readFileSync(caminho, "utf8");
}

function relativo(caminho) {
  return path.relative(raiz, caminho).replaceAll("\\", "/");
}

function falhar(caminho, motivo) {
  falhas.push(`${relativo(caminho)}: ${motivo}`);
}

const apiSrc = path.join(raiz, "api", "src");
const arquivosApi = listarArquivos(apiSrc, (arquivo) => arquivo.endsWith(".ts"));

for (const arquivo of arquivosApi) {
  const conteudo = texto(arquivo);
  if (/consultar(?:Um)?\(/u.test(conteudo)) falhar(arquivo, "uso proibido de consultar/consultarUm");
  if (/pool\.query/u.test(conteudo)) falhar(arquivo, "uso proibido de pool.query");
  if (/sql`/u.test(conteudo)) falhar(arquivo, "uso proibido de sql tagged template em api/src");
  if (/from\s+["'][./]+db\.js["']/u.test(conteudo)) falhar(arquivo, "import proibido de api/src/db.js");
  if (arquivo.endsWith(".schema.ts")) falhar(arquivo, "schemas de contrato devem ficar em shared");
  if (arquivo.endsWith(".controller.ts") && /\.repository\.js/u.test(conteudo)) {
    falhar(arquivo, "controller nao pode importar repository");
  }
  if (arquivo.endsWith(".controller.ts") && /\/banco\/|from\s+["'][./]+banco\/conexao\.js/u.test(conteudo)) {
    falhar(arquivo, "controller nao pode importar banco");
  }
  if (arquivo.endsWith(".repository.ts") && /\.service\.js|\.controller\.js/u.test(conteudo)) {
    falhar(arquivo, "repository nao pode importar service/controller");
  }
}

const seed = path.join(raiz, "db", "seed.ts");
if (existsSync(seed)) {
  const conteudo = texto(seed);
  if (/from\s+["']\.\.\/api/u.test(conteudo)) falhar(seed, "db/seed nao pode importar api");
  if (/pool\.query/u.test(conteudo)) falhar(seed, "seed deve usar Drizzle, nao pool.query");
}

if (existsSync(path.join(apiSrc, "db.ts"))) {
  falhas.push("api/src/db.ts: helper SQL raw deve permanecer removido");
}

if (falhas.length) {
  console.error("[arquitetura] ERRO: violacoes encontradas");
  for (const falha of falhas) console.error(`[arquitetura] - ${falha}`);
  process.exit(1);
}

console.info("[arquitetura] OK camadas controller/service/repository e Drizzle sem raw SQL na API");
