import { spawn } from "node:child_process";
import net from "node:net";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("..", import.meta.url));
const isWindows = process.platform === "win32";
const composeArgs = [
  "compose",
  "-p",
  "padaria-dev",
  "-f",
  "infra/docker-compose.yml",
  "-f",
  "infra/docker-compose.dev.yml"
];
const portas = ["4100", "5174", "5543"];

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

function executar(comando, args) {
  return new Promise((resolve, reject) => {
    const filho = spawn(comando, args, {
      cwd,
      stdio: "inherit",
      shell: isWindows,
      windowsHide: true
    });
    filho.on("error", reject);
    filho.on("exit", (codigo) => {
      if (codigo === 0) resolve();
      else reject(new Error(`${comando} ${args.join(" ")} saiu com codigo ${codigo ?? "desconhecido"}`));
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

async function validarPortasLivres() {
  for (const porta of portas) {
    if (await portaDisponivel(porta)) ok(`porta ${porta} livre`);
    else aviso(`porta ${porta} continua ocupada por um processo externo ao compose`);
  }
}

async function main() {
  titulo("Destruindo ambiente de desenvolvimento Padaria v2");
  info("removendo containers, redes e volumes do projeto padaria-dev...");
  await executar("docker", [...composeArgs, "down", "-v", "--remove-orphans"]);
  ok("containers, redes e volumes removidos");

  info("confirmando portas principais...");
  await validarPortasLivres();

  titulo("Ambiente removido");
  ok("Postgres dev removido");
  ok("API dev removida");
  ok("Web Vue dev removida");
}

main().catch((falha) => {
  erro(falha instanceof Error ? falha.message : String(falha));
  process.exit(1);
});
