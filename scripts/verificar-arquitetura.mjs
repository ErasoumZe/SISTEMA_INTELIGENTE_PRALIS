import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const raiz = process.cwd();
const falhas = [];

const PASTAS_IGNORADAS = new Set(["node_modules", ".nuxt", ".output", "dist", ".cache"]);

function listarArquivos(diretorio, filtro) {
  if (!existsSync(diretorio)) return [];
  const encontrados = [];
  for (const entrada of readdirSync(diretorio)) {
    if (PASTAS_IGNORADAS.has(entrada)) continue;
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
  // Isolamento comercial da Fase 2 (PROJECT_BRAIN 54): o modulo PUBLICO do fornecedor
  // (rodada-publica) e disjunto do modulo do comprador. Ele nao pode importar o repository/service
  // do comprador nem tocar preco-base ou adjudicacao — se tocar, o build quebra aqui, nao numa
  // revisao que alguem pode esquecer de fazer.
  if (arquivo.endsWith("rodada-publica.repository.ts") || arquivo.endsWith("rodada-publica.service.ts")) {
    if (
      /compras-(rodadas|decisao|fechamento|adjudicacao|solicitacoes|contraproposta)\.(repository|service)\.js|compras-fundacao|produtosPrecosBase|comprasAdjudicacoes|produtos_precos_base|compras_adjudicacoes/u.test(
        conteudo
      )
    ) {
      falhar(arquivo, "modulo publico da rodada nao pode tocar o modulo do comprador, preco-base ou adjudicacao");
    }
  }
}

// web-vue so importa `@padaria/shared` pela RAIZ quando o import gera codigo. O `nuxt.config`
// apelida `@padaria/shared` para o ARQUIVO `shared/src/index.ts` e o alias do Vite casa por
// prefixo: `@padaria/shared/datas` viraria `.../index.ts/datas` e o modulo vem 404 NO NAVEGADOR —
// com typecheck e lint verdes, porque os dois resolvem pelo `exports` do package.json. `import type`
// e ignorado aqui: some na compilacao e nunca chega ao resolvedor.
const arquivosWeb = listarArquivos(
  path.join(raiz, "web-vue"),
  (arquivo) => arquivo.endsWith(".ts") || arquivo.endsWith(".vue")
);
for (const arquivo of arquivosWeb) {
  const semTipos = texto(arquivo).replace(/import\s+type\s[\s\S]*?from\s*["'][^"']+["']/gu, "");
  if (/from\s*["']@padaria\/shared\/[^"']+["']/u.test(semTipos)) {
    falhar(
      arquivo,
      "web-vue importa @padaria/shared pela raiz; subcaminho quebra o alias do nuxt e da 404 no navegador"
    );
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
