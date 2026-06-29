import { spawn } from "node:child_process";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { setTimeout as esperar } from "node:timers/promises";

const cwd = fileURLToPath(new URL("..", import.meta.url));
const isWindows = process.platform === "win32";
const docker = "docker";

const apiPort = process.env.API_PORT ?? process.env.PORT ?? "4100";
const webPort = process.env.WEB_PORT ?? "5174";
const dbPort = process.env.POSTGRES_PORT ?? "5543";
const apiUrl = `http://localhost:${apiPort}`;
const webUrl = `http://localhost:${webPort}`;
const composeArgs = [
  "compose",
  "-p",
  "padaria-dev",
  "-f",
  "infra/docker-compose.yml",
  "-f",
  "infra/docker-compose.dev.yml"
];

const cor = {
  reset: "\x1b[0m",
  cinza: "\x1b[90m",
  verde: "\x1b[32m",
  amarelo: "\x1b[33m",
  vermelho: "\x1b[31m",
  ciano: "\x1b[36m",
  negrito: "\x1b[1m"
};

const processosDev = [];
let encerrando = false;

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

function erro(texto) {
  linha(`${cor.vermelho}ERRO${cor.reset} ${texto}`);
}

function portaDisponivel(porta) {
  return new Promise((resolve) => {
    const servidor = net.createServer();
    servidor.once("error", () => resolve(false));
    servidor.once("listening", () => servidor.close(() => resolve(true)));
    servidor.listen(Number(porta), "0.0.0.0");
  });
}

function executarCapturando(comando, args) {
  return new Promise((resolve, reject) => {
    const filho = spawn(comando, args, {
      cwd,
      env: { ...process.env, FORCE_COLOR: "0" },
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
      if (codigo === 0) resolve(stdout);
      else reject(new Error((stderr || stdout || `${comando} saiu com codigo ${codigo ?? "desconhecido"}`).trim()));
    });
  });
}

async function descreverUsoDaPorta(porta) {
  try {
    const netstat = await executarCapturando("netstat", ["-ano"]);
    return netstat
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter((item) => item.includes(`:${porta} `) && item.includes("LISTENING"))
      .map((item) => item.replace(/\s+/g, " "))
      .join("; ");
  } catch {
    return "";
  }
}

async function pidsNaPorta(porta) {
  try {
    const netstat = await executarCapturando("netstat", ["-ano"]);
    return [
      ...new Set(
        netstat
          .split(/\r?\n/)
          .map((item) => item.trim().replace(/\s+/g, " "))
          .filter((item) => item.includes(`:${porta} `) && item.includes("LISTENING"))
          .map((item) => item.split(" ").at(-1))
          .filter(Boolean)
      )
    ];
  } catch {
    return [];
  }
}

async function encerrarPid(pid) {
  if (!pid || pid === String(process.pid)) return;
  try {
    await executarCapturando(isWindows ? "taskkill" : "kill", isWindows ? ["/PID", pid, "/T", "/F"] : ["-TERM", pid]);
  } catch {
    // O processo pode ter encerrado entre o netstat e o kill.
  }
}

async function liberarPortaDev(nome, porta) {
  const pids = await pidsNaPorta(porta);
  if (!pids.length) return;
  aviso(`${nome} ja tinha processo em localhost:${porta}; encerrando processo local antigo (${pids.join(", ")}).`);
  for (const pid of pids) await encerrarPid(pid);
  await esperar(1_000);
}

async function exigirPortaLivre(nome, porta) {
  if (await portaDisponivel(porta)) {
    ok(`${nome} livre em localhost:${porta}`);
    return;
  }
  const uso = await descreverUsoDaPorta(porta);
  throw new Error(
    `${nome} precisa da porta ${porta}, mas ela ja esta em uso${uso ? ` (${uso})` : ""}. Encerre o processo e rode npm run dev novamente.`
  );
}

async function aguardarHttp(
  nome,
  url,
  { timeoutMs = 180_000, aceitarStatus = (status) => status >= 200 && status < 500 } = {}
) {
  const inicio = Date.now();
  while (Date.now() - inicio < timeoutMs) {
    try {
      const resposta = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (aceitarStatus(resposta.status)) return resposta;
    } catch {
      // O container ainda pode estar instalando dependencias ou iniciando o servidor.
    }
    await esperar(1_000);
  }
  throw new Error(`${nome} nao respondeu em ${url}`);
}

function spawnCompose(args, stdio = "inherit") {
  return spawn(docker, [...composeArgs, ...args], {
    cwd,
    stdio,
    shell: isWindows,
    windowsHide: true,
    env: {
      ...process.env,
      API_PORT: apiPort,
      WEB_PORT: webPort,
      POSTGRES_PORT: dbPort,
      FORCE_COLOR: "1"
    }
  });
}

function executarCompose(args) {
  return new Promise((resolve, reject) => {
    const filho = spawnCompose(args);
    filho.on("error", reject);
    filho.on("exit", (codigo) => {
      if (codigo === 0) resolve();
      else reject(new Error(`docker compose ${args.join(" ")} saiu com codigo ${codigo ?? "desconhecido"}`));
    });
  });
}

function spawnNpm(args, extraEnv = {}) {
  const filho = spawn("npm", args, {
    cwd,
    stdio: "inherit",
    shell: isWindows,
    windowsHide: true,
    env: {
      ...process.env,
      ...extraEnv,
      FORCE_COLOR: "1"
    }
  });
  processosDev.push(filho);
  return filho;
}

function executarNpm(args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const filho = spawnNpm(args, extraEnv);
    filho.on("error", reject);
    filho.on("exit", (codigo) => {
      processosDev.splice(processosDev.indexOf(filho), 1);
      if (codigo === 0) resolve();
      else reject(new Error(`npm ${args.join(" ")} saiu com codigo ${codigo ?? "desconhecido"}`));
    });
  });
}

async function imprimirStatusServicos() {
  try {
    await executarCompose(["ps"]);
  } catch (falha) {
    aviso(falha instanceof Error ? falha.message : String(falha));
  }
}

function encerrar(codigo = 0) {
  process.exitCode = codigo;
  if (encerrando) return;
  encerrando = true;
  linha();
  info("encerrando processos de desenvolvimento...");
  for (const processo of processosDev) processo.kill("SIGTERM");
  setTimeout(() => process.exit(codigo), 3_000).unref();
}

process.once("SIGINT", () => encerrar(0));
process.once("SIGTERM", () => encerrar(0));

async function main() {
  const dbUser = process.env.POSTGRES_USER ?? "padaria";
  const dbPassword = process.env.POSTGRES_PASSWORD ?? "padaria";
  const dbName = process.env.POSTGRES_DB ?? "padaria";
  const databaseUrl = process.env.DATABASE_URL ?? `postgresql://${dbUser}:${dbPassword}@localhost:${dbPort}/${dbName}`;
  const apiEnv = {
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-me-dev-secret-change-me",
    AUTH_BASE_URL: process.env.AUTH_BASE_URL ?? apiUrl,
    WEB_ORIGIN: process.env.WEB_ORIGIN ?? webUrl,
    PORT: apiPort,
    HOST: process.env.HOST ?? "0.0.0.0"
  };
  const webEnv = {
    PUBLIC_API_URL: process.env.PUBLIC_API_URL ?? apiUrl,
    NUXT_PUBLIC_API_URL: process.env.NUXT_PUBLIC_API_URL ?? apiUrl
  };

  titulo("Subindo ambiente de desenvolvimento Padaria v2");
  info(`API planejada em ${apiUrl}`);
  info(`Web Vue planejada em ${webUrl}`);
  info(`Postgres planejado em localhost:${dbPort}`);

  await liberarPortaDev("API", apiPort);
  await liberarPortaDev("Web Vue", webPort);
  await exigirPortaLivre("API", apiPort);
  await exigirPortaLivre("Web Vue", webPort);

  info("subindo ou reutilizando Postgres dev...");
  await executarCompose(["up", "-d", "--wait", "db"]);
  ok(`Postgres pronto em localhost:${dbPort}`);

  info("preparando banco e seed localmente...");
  await executarNpm(["run", "api:dev:prepare", "--workspace", "@padaria/api"], apiEnv);
  ok("banco preparado e seed aplicado");

  info("subindo API localmente...");
  const apiProcesso = spawnNpm(["run", "dev", "--workspace", "@padaria/api"], apiEnv);
  apiProcesso.once("exit", (codigo) => {
    if (encerrando) return;
    if (codigo === 0) return;
    erro(`API encerrou com codigo ${codigo ?? "desconhecido"}`);
    encerrar(codigo ?? 1);
  });
  info("aguardando API /health...");
  await aguardarHttp("API", `${apiUrl}/health`, { aceitarStatus: (status) => status === 200 });
  ok(`API pronta em ${apiUrl}`);

  info("subindo Web Vue localmente...");
  const webProcesso = spawnNpm(
    ["run", "dev", "--workspace", "@padaria/web-vue", "--", "--host", "0.0.0.0", "--port", webPort],
    webEnv
  );
  webProcesso.once("exit", (codigo) => {
    if (encerrando) return;
    if (codigo === 0) return;
    erro(`Web Vue encerrou com codigo ${codigo ?? "desconhecido"}`);
    encerrar(codigo ?? 1);
  });
  info("aguardando Nuxt/Vue...");
  await aguardarHttp("Web Vue", webUrl, { aceitarStatus: (status) => status < 500 });
  ok(`Web Vue pronta em ${webUrl}`);

  linha();
  titulo("Ambiente pronto");
  ok(`API        ${apiUrl}`);
  ok(`Health     ${apiUrl}/health`);
  ok(`Web Vue    ${webUrl}`);
  ok(`Postgres   localhost:${dbPort}`);
  ok("Login      diretor@email.com / 123456");
  ok("Login      caixa@email.com / 123456");
  linha(
    `${cor.cinza}Pressione Ctrl+C para parar API/Web. Use npm run dev:destroy para remover containers, redes e volumes.${cor.reset}`
  );
  linha();

  await imprimirStatusServicos();
}

main().catch((falha) => {
  erro(falha instanceof Error ? falha.message : String(falha));
  encerrar(1);
});
