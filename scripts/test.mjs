import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("..", import.meta.url));
const isWindows = process.platform === "win32";
const npm = isWindows ? "npm.cmd" : "npm";
// A suíte de integração completa (Testcontainers) levou 27 minutos no fechamento do Corujão v3;
// o limite antigo de 10 minutos matava uma execução saudável antes do resumo do Vitest.
const timeoutMs = Number.parseInt(process.env.TEST_TIMEOUT_MS ?? "1800000", 10);
const nodeOptions = [process.env.NODE_OPTIONS, "--conditions=development"].filter(Boolean).join(" ");

const cor = {
  reset: "\x1b[0m",
  verde: "\x1b[32m",
  vermelho: "\x1b[31m",
  ciano: "\x1b[36m",
  cinza: "\x1b[90m",
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

function falha(texto) {
  linha(`${cor.vermelho}ERRO${cor.reset} ${texto}`);
}

function encerrarProcesso(filho) {
  if (!filho.pid) return;
  if (isWindows) {
    spawn("taskkill", ["/pid", String(filho.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true
    });
    return;
  }
  filho.kill("SIGTERM");
}

function executar(nome, args) {
  return new Promise((resolve, reject) => {
    info(nome);
    let finalizado = false;
    const filho = spawn(npm, args, {
      cwd,
      stdio: "inherit",
      shell: isWindows,
      windowsHide: true,
      env: { ...process.env, FORCE_COLOR: "1", NODE_OPTIONS: nodeOptions }
    });
    const timeout = setTimeout(() => {
      if (finalizado) return;
      finalizado = true;
      encerrarProcesso(filho);
      reject(new Error(`${nome} excedeu ${timeoutMs}ms e foi encerrado para nao travar a execucao`));
    }, timeoutMs);

    filho.on("error", (error) => {
      if (finalizado) return;
      finalizado = true;
      clearTimeout(timeout);
      reject(error);
    });
    filho.on("exit", (codigo) => {
      if (finalizado) return;
      finalizado = true;
      clearTimeout(timeout);
      if (codigo === 0) {
        ok(nome);
        resolve();
        return;
      }
      reject(new Error(`${nome} falhou com codigo ${codigo ?? "desconhecido"}`));
    });
  });
}

try {
  titulo("Rodando testes Padaria v2");
  await executar("vitest unit", ["run", "test:unit", "--workspace", "@padaria/tests"]);
  await executar("vitest integration", ["run", "test:integration", "--workspace", "@padaria/tests"]);
  titulo("Testes concluidos");
  ok("suite Vitest aprovada");
} catch (error) {
  falha(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
