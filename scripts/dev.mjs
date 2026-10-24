import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { setTimeout as esperar } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { composeAppDev, composeDbDev, docker } from "./compose-paths.mjs";

const cwd = fileURLToPath(new URL("..", import.meta.url));
const isWindows = process.platform === "win32";
const npm = "npm";

// Segredos de desenvolvimento ficam apenas no `.env.local` ignorado. Carrega antes de invocar o
// Docker Compose para que variaveis opcionais, como Gemini, cheguem ao container sem aparecer no
// frontend ou no Git. A ausencia do arquivo continua sendo um ambiente dev valido.
const arquivoEnvLocal = path.join(cwd, ".env.local");
if (existsSync(arquivoEnvLocal)) process.loadEnvFile(arquivoEnvLocal);

const executarUmaVez = process.argv.includes("--once");
const executarLocal = process.argv.includes("--local");
const forcarBuild = process.argv.includes("--build");
const forcarInstall = process.argv.includes("--install");
const forcarPrepare = process.argv.includes("--prepare");
const pularPrepare = process.argv.includes("--skip-prepare");

const apiPort = process.env.API_PORT ?? process.env.PORT ?? "4100";
const webPort = process.env.WEB_PORT ?? "5174";
let dbPort = process.env.POSTGRES_PORT ?? "5543";

const cor = {
  reset: "\x1b[0m",
  cinza: "\x1b[90m",
  verde: "\x1b[32m",
  amarelo: "\x1b[33m",
  vermelho: "\x1b[31m",
  ciano: "\x1b[36m",
  negrito: "\x1b[1m"
};

const processos = new Set();
const logs = new Map();
let encerrando = false;
let pararComposeNoEncerramento = false;

function linha(texto = "") {
  process.stdout.write(`${texto}\n`);
}

function titulo(texto) {
  linha(`${cor.negrito}${cor.ciano}${texto}${cor.reset}`);
}

function ok(texto) {
  linha(`${cor.verde}OK${cor.reset} ${texto}`);
}

function info(texto) {
  linha(`${cor.cinza}..${cor.reset} ${texto}`);
}

function aviso(texto) {
  linha(`${cor.amarelo}AVISO${cor.reset} ${texto}`);
}

function falha(texto) {
  linha(`${cor.vermelho}ERRO${cor.reset} ${texto}`);
}

function adicionarAoHash(hash, caminhoRelativo) {
  const absoluto = path.join(cwd, caminhoRelativo);
  if (!existsSync(absoluto)) return;
  const estado = statSync(absoluto);
  if (estado.isDirectory()) {
    for (const nome of readdirSync(absoluto).sort()) adicionarAoHash(hash, path.join(caminhoRelativo, nome));
    return;
  }
  hash.update(caminhoRelativo);
  hash.update(readFileSync(absoluto));
}

function hashDeArquivos(caminhos) {
  const hash = createHash("sha256");
  for (const caminho of caminhos) adicionarAoHash(hash, caminho);
  return hash.digest("hex").slice(0, 16);
}

const hashDependencias = hashDeArquivos([
  "package.json",
  "package-lock.json",
  "api/package.json",
  "db/package.json",
  "integracoes-scripts/package.json",
  "shared/package.json",
  "tests/package.json",
  "web-vue/package.json"
]);

const hashPreparoDev = hashDeArquivos([
  "package-lock.json",
  "db/drizzle.config.ts",
  "db/setup-dev.mjs",
  "db/seed.ts",
  "db/migrations"
]);
const cacheDirDev = path.join(cwd, "node_modules", ".cache", "padaria-dev");
const marcadorDependencias = path.join(cacheDirDev, `deps-${hashDependencias}`);
const marcadorPreparo = path.join(cacheDirDev, `prepare-${hashPreparoDev}`);

function guardarLog(nome, chunk) {
  const linhas = chunk
    .toString()
    .split(/\r?\n/)
    .map((item) => item.trimEnd())
    .filter(Boolean);
  const atual = logs.get(nome) ?? [];
  atual.push(...linhas);
  logs.set(nome, atual.slice(-120));
}

function imprimirUltimosLogs(nome) {
  const ultimos = logs.get(nome) ?? [];
  if (!ultimos.length) return;
  linha(`${cor.amarelo}ultimos logs de ${nome}:${cor.reset}`);
  for (const log of ultimos.slice(-30)) linha(`${cor.cinza}[${nome}]${cor.reset} ${log}`);
}

function criarProcesso(nome, comando, args, opcoes = {}) {
  const filho = spawn(comando, args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    shell: isWindows,
    windowsHide: true,
    ...opcoes,
    env: { ...process.env, FORCE_COLOR: "1", ...(opcoes.env ?? {}) }
  });
  processos.add(filho);
  filho.stdout.on("data", (chunk) => guardarLog(nome, chunk));
  filho.stderr.on("data", (chunk) => guardarLog(nome, chunk));
  filho.on("exit", () => processos.delete(filho));
  return filho;
}

function executar(nome, comando, args, opcoes = {}) {
  return new Promise((resolve, reject) => {
    const filho = criarProcesso(nome, comando, args, opcoes);
    filho.on("error", reject);
    filho.on("exit", (codigo) => {
      if (codigo === 0) {
        resolve();
        return;
      }
      reject(new Error(`${nome} saiu com codigo ${codigo ?? "desconhecido"}`));
    });
  });
}

function executarCapturando(comando, args, opcoes = {}) {
  return new Promise((resolve, reject) => {
    const filho = spawn(comando, args, {
      cwd,
      env: { ...process.env, FORCE_COLOR: "0", ...(opcoes.env ?? {}) },
      stdio: ["ignore", "pipe", "pipe"],
      shell: isWindows,
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    filho.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    filho.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    filho.on("error", reject);
    filho.on("exit", (codigo) => {
      if (codigo === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error((stderr || stdout || `${comando} saiu com codigo ${codigo ?? "desconhecido"}`).trim()));
    });
  });
}

async function imagemExiste(referencia) {
  try {
    await executarCapturando(docker, ["image", "inspect", referencia]);
    return true;
  } catch {
    return false;
  }
}

async function volumeExiste(nome) {
  try {
    await executarCapturando(docker, ["volume", "inspect", nome]);
    return true;
  } catch {
    return false;
  }
}

function gravarMarcador(caminho) {
  mkdirSync(path.dirname(caminho), { recursive: true });
  writeFileSync(caminho, "");
}

function portaDisponivel(porta) {
  return new Promise((resolve) => {
    const servidor = net.createServer();
    servidor.once("error", () => resolve(false));
    servidor.once("listening", () => servidor.close(() => resolve(true)));
    servidor.listen(Number(porta), "0.0.0.0");
  });
}

async function encontrarPortaLivre(inicio) {
  for (let porta = inicio; porta <= inicio + 50; porta += 1) {
    if (await portaDisponivel(String(porta))) return String(porta);
  }
  throw new Error(`nao encontrei porta livre entre ${inicio} e ${inicio + 50} para publicar o Postgres dev`);
}

async function descreverUsoDaPorta(porta) {
  const partes = [];
  try {
    const dockerPs = await executarCapturando(docker, ["ps", "--filter", `publish=${porta}`, "--format", "{{.Names}}"]);
    const containers = dockerPs
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (containers.length) partes.push(`container Docker: ${containers.join(", ")}`);
  } catch {
    // Melhor esforco.
  }

  if (isWindows) {
    try {
      const netstat = await executarCapturando("netstat", ["-ano"]);
      const linhaPorta = netstat
        .split(/\r?\n/)
        .map((item) => item.trim())
        .find((item) => item.includes(`:${porta} `) && item.includes("LISTENING"));
      if (linhaPorta) partes.push(`netstat: ${linhaPorta.replace(/\s+/g, " ")}`);
    } catch {
      // Melhor esforco.
    }
  }

  return partes.join("; ");
}

async function prepararPortaPostgresDev() {
  if (await portaDisponivel(dbPort)) return;

  const uso = await descreverUsoDaPorta(dbPort);
  if (process.env.POSTGRES_PORT) {
    throw new Error(
      `POSTGRES_PORT=${dbPort} ja esta em uso${uso ? ` (${uso})` : ""}. ` +
        "Libere a porta ou escolha outra com POSTGRES_PORT=5544 npm run dev."
    );
  }

  const portaLivre = await encontrarPortaLivre(5544);
  aviso(`porta 5543 ja esta em uso${uso ? ` (${uso})` : ""}; vou publicar o Postgres dev em localhost:${portaLivre}.`);
  dbPort = portaLivre;
  process.env.POSTGRES_PORT = portaLivre;
}

function databaseUrlHost() {
  const user = process.env.POSTGRES_USER ?? "padaria";
  const password = process.env.POSTGRES_PASSWORD ?? "padaria";
  const db = process.env.POSTGRES_DB ?? "padaria";
  return `postgresql://${user}:${password}@localhost:${dbPort}/${db}`;
}

function ambienteLocal(extra = {}) {
  const apiUrl = `http://localhost:${apiPort}`;
  const webUrl = `http://localhost:${webPort}`;
  return {
    DATABASE_URL: databaseUrlHost(),
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-me-dev-secret-change-me",
    AUTH_BASE_URL: process.env.AUTH_BASE_URL ?? apiUrl,
    WEB_ORIGIN: process.env.WEB_ORIGIN ?? webUrl,
    PUBLIC_API_URL: process.env.PUBLIC_API_URL ?? apiUrl,
    NUXT_PUBLIC_API_URL: process.env.NUXT_PUBLIC_API_URL ?? apiUrl,
    PORT: apiPort,
    HOST: "0.0.0.0",
    ...extra
  };
}

async function aguardarHttp(
  nome,
  url,
  { timeoutMs = 120_000, aceitarStatus = (status) => status >= 200 && status < 500 } = {}
) {
  const inicio = Date.now();
  while (Date.now() - inicio < timeoutMs) {
    try {
      const resposta = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (aceitarStatus(resposta.status)) return resposta;
    } catch {
      // Servico ainda subindo.
    }
    await esperar(750);
  }
  throw new Error(`${nome} nao respondeu em ${url}`);
}

function parseComposeJson(raw) {
  const texto = raw.trim();
  if (!texto) return [];
  if (texto.startsWith("[")) return JSON.parse(texto);
  return texto
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => JSON.parse(item));
}

async function obterServicoCompose(composeArgs, servico, env = {}) {
  const bruto = await executarCapturando(docker, [...composeArgs, "ps", "--format", "json", servico], { env });
  const containers = parseComposeJson(bruto);
  return containers.find((item) => item.Service === servico || item.Name?.includes(servico));
}

async function servicoComposeHealthy(composeArgs, servico, env = {}) {
  try {
    const container = await obterServicoCompose(composeArgs, servico, env);
    return container?.Health === "healthy";
  } catch {
    return false;
  }
}

async function aguardarServicoCompose(composeArgs, servico, { timeoutMs = 120_000, env = {} } = {}) {
  const inicio = Date.now();
  while (Date.now() - inicio < timeoutMs) {
    const container = await obterServicoCompose(composeArgs, servico, env);
    if (container?.Health === "healthy") return;
    if (container?.State === "exited" || container?.State === "dead") {
      throw new Error(`${servico} encerrou antes de ficar healthy: ${container.Status ?? container.State}`);
    }
    await esperar(750);
  }
  throw new Error(`${servico} nao ficou healthy em ${timeoutMs}ms`);
}

function anexarLogs(nome, filho) {
  filho.stdout.on("data", (chunk) => process.stdout.write(`${cor.cinza}[${nome}]${cor.reset} ${chunk}`));
  filho.stderr.on("data", (chunk) => process.stderr.write(`${cor.cinza}[${nome}]${cor.reset} ${chunk}`));
}

function observarProcessos(processosNomeados) {
  for (const [nome, filho] of processosNomeados) {
    filho.once("exit", (codigo) => {
      if (encerrando) return;
      falha(`${nome} encerrou antes do esperado (${codigo ?? "sem codigo"})`);
      imprimirUltimosLogs(nome);
      encerrar(1);
    });
  }
}

function encerrar(codigo = 0) {
  if (encerrando) return;
  process.exitCode = codigo;
  encerrando = true;
  linha();
  info("encerrando servicos de desenvolvimento...");
  for (const filho of processos) filho.kill("SIGTERM");
  if (pararComposeNoEncerramento) {
    spawn(docker, [...composeAppDev, "stop", "api"], {
      cwd,
      stdio: "ignore",
      shell: isWindows,
      windowsHide: true
    }).on("error", () => null);
  }
  setTimeout(() => {
    for (const filho of processos) filho.kill("SIGKILL");
    process.exit(codigo);
  }, 3_000).unref();
}

process.once("SIGINT", () => encerrar(0));
process.once("SIGTERM", () => encerrar(0));

async function subirBancoDev() {
  if (await servicoComposeHealthy(composeDbDev, "db", { POSTGRES_PORT: dbPort })) {
    ok(`Postgres dev reaproveitado em localhost:${dbPort}`);
    return;
  }

  await prepararPortaPostgresDev();

  info("iniciando Postgres dev separado...");
  await executar("db-dev", docker, [...composeDbDev, "up", "-d", "--wait"], { env: { POSTGRES_PORT: dbPort } });
  ok(`Postgres dev pronto em localhost:${dbPort}`);
}

async function mainContainer() {
  titulo("Subindo ambiente de desenvolvimento com API containerizada");

  const bancoDevJaExistia = await volumeExiste("padaria_postgres_dev_data");
  await subirBancoDev();

  if (forcarBuild || !(await imagemExiste("padaria-dev-api:latest"))) {
    info("construindo imagem dev da API...");
    await executar("build", docker, [...composeAppDev, "build", "api"], { env: { POSTGRES_PORT: dbPort } });
    ok("imagem dev da API pronta");
  } else {
    ok("imagem dev da API reaproveitada");
  }

  if (forcarInstall || !(await volumeExiste("padaria_dev_node_modules")) || !existsSync(marcadorDependencias)) {
    info("preparando dependencias Node no volume dev...");
    await executar("deps", docker, [...composeAppDev, "run", "--rm", "--no-deps", "api", "npm", "install"], {
      env: { POSTGRES_PORT: dbPort }
    });
    gravarMarcador(marcadorDependencias);
    ok("dependencias Node prontas no volume dev");
  } else {
    ok("dependencias Node reaproveitadas do volume dev");
  }

  if (pularPrepare) {
    aviso("preparo do banco e seed ignorados (--skip-prepare); usando o banco dev existente");
  } else if (forcarPrepare || !bancoDevJaExistia || !existsSync(marcadorPreparo)) {
    info("preparando banco e seed pelo container da API...");
    await executar(
      "prepare",
      docker,
      [
        ...composeAppDev,
        "run",
        "--rm",
        "--no-deps",
        "api",
        "npm",
        "run",
        "api:dev:prepare",
        "--workspace",
        "@padaria/api"
      ],
      { env: { POSTGRES_PORT: dbPort } }
    );
    gravarMarcador(marcadorPreparo);
    ok("banco preparado e seed aplicado");
  } else {
    ok("banco e seed reaproveitados do ultimo preparo dev");
  }

  pararComposeNoEncerramento = true;
  if (
    !forcarBuild &&
    (await servicoComposeHealthy(composeAppDev, "api", { POSTGRES_PORT: dbPort })) &&
    (await aguardarHttp("api", `http://localhost:${apiPort}/health`, {
      aceitarStatus: (status) => status === 200,
      timeoutMs: 3_000
    }).then(
      () => true,
      () => false
    ))
  ) {
    ok("API reaproveitada do container em execucao");
  } else {
    info("iniciando API em container...");
    await executar("compose-up", docker, [...composeAppDev, "up", "-d", "--remove-orphans", "api"], {
      env: { POSTGRES_PORT: dbPort }
    });
    await aguardarServicoCompose(composeAppDev, "api", { timeoutMs: 240_000, env: { POSTGRES_PORT: dbPort } });
    await aguardarHttp("api", `http://localhost:${apiPort}/health`, {
      aceitarStatus: (status) => status === 200,
      timeoutMs: 240_000
    });
    ok("API pronta");
  }

  info("iniciando Web Vue no host...");
  const web = criarProcesso(
    "web",
    npm,
    ["run", "dev", "--workspace", "@padaria/web-vue", "--", "--host", "0.0.0.0", "--port", webPort],
    {
      env: ambienteLocal({ PORT: webPort })
    }
  );
  observarProcessos([["web", web]]);
  await aguardarHttp("web", `http://localhost:${webPort}`, {
    aceitarStatus: (status) => status < 500,
    timeoutMs: 180_000
  });

  linha();
  titulo("Ambiente pronto");
  ok(`API      http://localhost:${apiPort} (container)`);
  ok(`Health   http://localhost:${apiPort}/health`);
  ok(`Web Vue  http://localhost:${webPort} (host)`);
  ok(`Postgres localhost:${dbPort} (container em /db)`);
  ok("Login    diretor@email.com / 123456");
  ok("Login    caixa@email.com / 123456");
  linha(
    `${cor.cinza}Pressione Ctrl+C para encerrar API e Web. Use npm run dev:destroy para remover volumes.${cor.reset}`
  );

  if (executarUmaVez) {
    encerrar(0);
    return;
  }

  const composeLogs = criarProcesso("compose", docker, [...composeAppDev, "logs", "-f", "api"], {
    env: { POSTGRES_PORT: dbPort }
  });
  observarProcessos([["compose", composeLogs]]);
  anexarLogs("compose", composeLogs);
  anexarLogs("web", web);
}

async function mainLocal() {
  titulo("Subindo ambiente de desenvolvimento local");
  aviso("fluxo local explicito: API e Web rodam no host; Postgres continua em container separado.");

  await subirBancoDev();

  if (pularPrepare) {
    aviso("preparo do banco e seed ignorados (--skip-prepare); usando o banco dev existente");
  } else {
    info("preparando banco e seed localmente...");
    await executar("prepare", npm, ["run", "api:dev:prepare", "--workspace", "@padaria/api"], { env: ambienteLocal() });
    ok("banco preparado e seed aplicado");
  }

  info("iniciando API e Web locais...");
  const api = criarProcesso("api", npm, ["run", "dev", "--workspace", "@padaria/api"], { env: ambienteLocal() });
  const web = criarProcesso(
    "web",
    npm,
    ["run", "dev", "--workspace", "@padaria/web-vue", "--", "--host", "0.0.0.0", "--port", webPort],
    {
      env: ambienteLocal({ PORT: webPort })
    }
  );

  observarProcessos([
    ["api", api],
    ["web", web]
  ]);

  await Promise.all([
    aguardarHttp("api", `http://localhost:${apiPort}/health`, { aceitarStatus: (status) => status === 200 }),
    aguardarHttp("web", `http://localhost:${webPort}`, { aceitarStatus: (status) => status < 500 })
  ]);

  linha();
  titulo("Ambiente local pronto");
  ok(`API      http://localhost:${apiPort} (local)`);
  ok(`Web Vue  http://localhost:${webPort} (local)`);
  ok(`Postgres localhost:${dbPort} (container em /db)`);
  linha(`${cor.cinza}Pressione Ctrl+C para encerrar API e Web.${cor.reset}`);

  if (executarUmaVez) {
    encerrar(0);
    return;
  }

  anexarLogs("api", api);
  anexarLogs("web", web);
}

(executarLocal ? mainLocal() : mainContainer()).catch((error) => {
  falha(error instanceof Error ? error.message : String(error));
  for (const nome of ["db-dev", "build", "deps", "prepare", "marker", "compose-up", "api", "web", "compose"])
    imprimirUltimosLogs(nome);
  encerrar(1);
});
