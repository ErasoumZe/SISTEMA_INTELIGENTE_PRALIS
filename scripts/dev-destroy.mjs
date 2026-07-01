import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { composeAppDev, composeCoolify, composeDbDev, composeDbProd, docker } from "./compose-paths.mjs";

const cwd = fileURLToPath(new URL("..", import.meta.url));
const isWindows = process.platform === "win32";
const portas = ["4100", "5174", process.env.POSTGRES_PORT ?? "5543"];
const cacheDirDev = path.join(cwd, "node_modules", ".cache", "padaria-dev");

const cor = {
  reset: "\x1b[0m",
  cinza: "\x1b[90m",
  verde: "\x1b[32m",
  amarelo: "\x1b[33m",
  vermelho: "\x1b[31m",
  ciano: "\x1b[36m",
  negrito: "\x1b[1m"
};

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

function executar(comando, args, { ignorarFalha = false, env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const filho = spawn(comando, args, {
      cwd,
      stdio: "inherit",
      shell: isWindows,
      windowsHide: true,
      env: { ...process.env, ...env }
    });
    filho.on("error", reject);
    filho.on("exit", (codigo) => {
      if (codigo === 0 || ignorarFalha) resolve();
      else reject(new Error(`${comando} ${args.join(" ")} saiu com codigo ${codigo ?? "desconhecido"}`));
    });
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

function portaDisponivel(porta) {
  return new Promise((resolve) => {
    const servidor = net.createServer();
    servidor.once("error", () => resolve(false));
    servidor.once("listening", () => servidor.close(() => resolve(true)));
    servidor.listen(Number(porta), "0.0.0.0");
  });
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

async function nomeDoProcesso(pid) {
  if (!isWindows) return "";
  try {
    const saida = await executarCapturando("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"]);
    const linhaProcesso = saida
      .split(/\r?\n/)
      .map((item) => item.trim())
      .find((item) => item && !item.includes("INFO:"));
    return linhaProcesso?.match(/^"([^"]+)"/)?.[1] ?? "";
  } catch {
    return "";
  }
}

async function encerrarPid(pid) {
  if (!pid || pid === String(process.pid)) return;
  const nome = await nomeDoProcesso(pid);
  if (/docker/i.test(nome)) {
    aviso(`processo ${pid} (${nome}) parece ser do Docker; nao vou encerrar diretamente`);
    return;
  }
  try {
    await executarCapturando(isWindows ? "taskkill" : "kill", isWindows ? ["/PID", pid, "/T", "/F"] : ["-TERM", pid]);
    ok(`processo ${pid} encerrado`);
  } catch {
    aviso(`processo ${pid} ja nao estava mais ativo`);
  }
}

async function encerrarPortasLocais() {
  for (const porta of ["4100", "5174"]) {
    const pids = await pidsNaPorta(porta);
    if (!pids.length) {
      ok(`porta ${porta} sem processo local`);
      continue;
    }
    aviso(`porta ${porta} ocupada por ${pids.join(", ")}; encerrando...`);
    for (const pid of pids) await encerrarPid(pid);
  }
}

async function validarPortas() {
  for (const porta of portas) {
    if (await portaDisponivel(porta)) ok(`porta ${porta} livre`);
    else aviso(`porta ${porta} continua ocupada por processo externo ou container preservado`);
  }
}

async function composeDown(nome, composeArgs, incluirVolumes, env = {}) {
  const args = [...composeArgs, "down", "--remove-orphans"];
  if (incluirVolumes) args.push("-v");
  info(`${incluirVolumes ? "removendo" : "parando"} ${nome}...`);
  await executar(docker, args, { ignorarFalha: true, env });
}

function removerCacheDev() {
  if (!existsSync(cacheDirDev)) return;
  rmSync(cacheDirDev, { recursive: true, force: true });
  ok("marcadores locais do dev removidos");
}

async function main() {
  titulo("Destruindo ambiente Padaria v2 completo");

  await composeDown("API/Web dev", composeAppDev, true);
  await composeDown("Postgres dev", composeDbDev, true);
  await composeDown("Postgres prod local", composeDbProd, true, { POSTGRES_PASSWORD: "dummy-prod-password" });
  await composeDown("stack Coolify local", composeCoolify, true, {
    DATABASE_URL: "postgresql://user:pass@db.example:5432/padaria",
    BETTER_AUTH_SECRET: "dummy-secret-with-at-least-32-chars",
    AUTH_BASE_URL: "https://api.example.test",
    WEB_ORIGIN: "https://app.example.test",
    NUXT_PUBLIC_API_URL: "https://api.example.test"
  });
  removerCacheDev();

  info("encerrando processos locais remanescentes nas portas 4100 e 5174...");
  await encerrarPortasLocais();

  info("confirmando portas principais...");
  await validarPortas();

  titulo("Ambiente removido com volumes");
  ok("containers, redes e volumes locais removidos");
}

main().catch((falha) => {
  erro(falha instanceof Error ? falha.message : String(falha));
  process.exit(1);
});
