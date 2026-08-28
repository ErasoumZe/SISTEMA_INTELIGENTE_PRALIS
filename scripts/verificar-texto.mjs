import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const alvos = [
  "api/src",
  "db/src",
  "shared/src",
  "tests",
  "web-vue",
  "scripts",
  "README.md",
  "DOCUMENTACAO_FLUXOS_E_REGRAS.md"
].filter(existsSync);
const extensoes = new Set([".ts", ".vue", ".js", ".mjs", ".json", ".md", ".sql", ".css", ".yml", ".yaml"]);

const padroesProblematicos = [
  "\u00c3\u0192",
  "\u00c3\u201a",
  "\u00c3\u00a9",
  "\u00c3\u00a1",
  "\u00c3\u00a3",
  "\u00c3\u00a7",
  "\u00c3\u00ad",
  "\u00c3\u00b3",
  "\u00c3\u00ba",
  "\u00c3 ",
  "\u00c3\u00aa",
  "\u00c3\u00b5",
  "\u00c3\u00b4",
  "\u00c3\u00a2",
  "\u00c3\u2021",
  "\u00c3\u2030",
  "\u00c3\u201c",
  "\u00c3\u0161",
  "\ufffd",
  "\u00c3\u00af\u00c2\u00bf\u00c2\u00bd",
  "N?o",
  "n?o",
  "descri??o",
  "Descri??o",
  "cria??o",
  "Cria??o",
  "In?cio",
  "in?cio",
  "t?rmino",
  "T?rmino",
  "per?odo",
  "Per?odo",
  "hist?rico",
  "Hist?rico",
  "fun??o",
  "Fun??o",
  "permiss?o",
  "Permiss?o",
  "movimenta??o",
  "Movimenta??o",
  "lan?amento",
  "Lan?amento"
];

const nomesDominioInglesBloqueados = [
  {
    regex: /pgTable\(\s*['"`]users['"`]/,
    motivo: "tabela fisica deve manter o contrato do auth ou usar usuarios_* no dominio"
  },
  { regex: /pgTable\(\s*['"`]companies['"`]/, motivo: "tabela fisica deve ser empresas" },
  { regex: /pgTable\(\s*['"`]accounts['"`]/, motivo: "tabela fisica deve ser contas" },
  { regex: /pgTable\(\s*['"`]suppliers['"`]/, motivo: "tabela fisica deve ser fornecedores" },
  { regex: /pgTable\(\s*['"`]employees['"`]/, motivo: "tabela fisica deve ser colaboradores" },
  { regex: /pgTable\(\s*['"`]products['"`]/, motivo: "tabela fisica deve ser produtos" },
  { regex: /pgTable\(\s*['"`]movements['"`]/, motivo: "tabela fisica deve ser movimentacoes_financeiras" },
  { regex: /\/api\/customers\b/, motivo: "rota de dominio em ingles bloqueada; use dominio em portugues" },
  { regex: /\/api\/products\b/, motivo: "rota de dominio em ingles bloqueada; use /api/produtos" },
  { regex: /\/api\/employees\b/, motivo: "rota de dominio em ingles bloqueada; use /api/colaboradores" }
];

// Durabilidade desligada e privilegio de banco DESCARTAVEL, e de mais nenhum.
//
// `fsync=off`, `synchronous_commit=off` e `full_page_writes=off` deixam o Postgres rapido porque
// param de garantir que o dado sobreviva a uma queda. Num container que nasce e morre com a rodada
// isso nao custa nada; num banco de desenvolvimento, de producao ou do Coolify, custa os dados.
//
// A fronteira hoje e estrutural — nenhum compose tem chave `command:`, e o Testcontainers fala
// direto com a API do Docker —, mas estrutura se perde num copiar e colar apressado. Esta guarda
// transforma "nao vaza" em "nao TEM como vazar sem ficar vermelho".
// Regex, e nao `includes`, porque o Postgres aceita `fsync = off` com espacos — e uma guarda de
// texto que so pega a grafia colada da a impressao de proteger sem proteger.
const parametrosSemDurabilidade = [
  /\bfsync\s*=\s*off\b/,
  /\bsynchronous_commit\s*=\s*off\b/,
  /\bfull_page_writes\s*=\s*off\b/
];

// Ancorado no SEGMENTO, e nao em substring: `includes("tests/")` sozinho liberaria
// `api/src/contests/` e `scripts/mytests/`, que nao sao pasta de teste nenhuma.
function podeDesligarDurabilidade(caminho) {
  const normalizado = caminho.replaceAll("\\", "/");
  return normalizado.startsWith("tests/") || normalizado.includes("/tests/");
}

// Os arquivos de orquestracao NAO estao em `alvos` (a varredura so olha codigo), e sao justamente
// onde o vazamento seria grave.
//
// DESCOBERTOS, nao listados a mao: uma lista fixa esquece o `docker-compose.yml` da raiz — foi o que
// aconteceu na primeira versao desta guarda — e nasce desatualizada no dia em que alguem cria um
// `docker-compose.staging.yml`. Quem varre por padrao nao tem esse esquecimento.
const arquivosDeOrquestracao = [".", "db", "infra"].filter(existsSync).flatMap((pasta) =>
  readdirSync(pasta, { withFileTypes: true })
    .filter((entrada) => entrada.isFile() && /^docker-compose.*\.ya?ml$/.test(entrada.name))
    .map((entrada) => (pasta === "." ? entrada.name : join(pasta, entrada.name)))
);

function caminhoIgnoradoParaDominio(caminho) {
  const normalizado = caminho.replaceAll("\\", "/");
  return (
    normalizado.includes("/migrations/") ||
    normalizado.includes("/tests/") ||
    normalizado.endsWith(".test.ts") ||
    normalizado.endsWith(".spec.ts")
  );
}

function listarArquivos(caminho) {
  if (!existsSync(caminho)) return [];
  if (statSync(caminho).isFile()) return extensoes.has(extname(caminho)) ? [caminho] : [];

  const arquivos = [];
  const visitar = (atual) => {
    const entradas = readdirSync(atual, { withFileTypes: true });
    for (const entrada of entradas) {
      const proximo = join(atual, entrada.name);
      if (
        entrada.name === "node_modules" ||
        entrada.name === "dist" ||
        entrada.name === ".nuxt" ||
        entrada.name === ".output"
      )
        continue;
      if (entrada.isDirectory()) visitar(proximo);
      else if (extensoes.has(extname(entrada.name))) arquivos.push(proximo);
    }
  };

  visitar(caminho);
  return arquivos;
}

const falhas = [];

for (const alvo of alvos.flatMap(listarArquivos)) {
  if (alvo.replaceAll("\\", "/").endsWith("scripts/verificar-texto.mjs")) continue;
  const linhas = readFileSync(alvo, "utf8").split(/\r?\n/);
  for (const [indice, linha] of linhas.entries()) {
    const problema = padroesProblematicos.find((padrao) => linha.includes(padrao));
    if (problema) falhas.push(`${alvo}:${indice + 1}: texto possivelmente corrompido: ${problema}`);
    if (!podeDesligarDurabilidade(alvo)) {
      const durabilidade = parametrosSemDurabilidade.find((padrao) => padrao.test(linha));
      if (durabilidade)
        falhas.push(`${alvo}:${indice + 1}: durabilidade desligada so vale em banco descartavel (tests/)`);
    }
    if (!caminhoIgnoradoParaDominio(alvo)) {
      const dominioIngles = nomesDominioInglesBloqueados.find((padrao) => padrao.regex.test(linha));
      if (dominioIngles)
        falhas.push(`${alvo}:${indice + 1}: nome de dominio em ingles bloqueado: ${dominioIngles.motivo}`);
    }
  }
}

for (const arquivo of arquivosDeOrquestracao) {
  for (const [indice, linha] of readFileSync(arquivo, "utf8").split(/\r?\n/).entries()) {
    const durabilidade = parametrosSemDurabilidade.find((padrao) => padrao.test(linha));
    if (durabilidade)
      falhas.push(`${arquivo}:${indice + 1}: durabilidade desligada em orquestracao — nunca fora de teste`);
  }
}

if (falhas.length > 0) {
  console.error(falhas.join("\n"));
  process.exit(1);
}
