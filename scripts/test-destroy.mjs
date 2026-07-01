import { spawnSync } from "node:child_process";

const docker = process.platform === "win32" ? "docker.exe" : "docker";

const cor = {
  reset: "\x1b[0m",
  verde: "\x1b[32m",
  amarelo: "\x1b[33m",
  vermelho: "\x1b[31m",
  cinza: "\x1b[90m"
};

function log(texto = "") {
  process.stdout.write(`${texto}\n`);
}

function run(args, options = {}) {
  const resultado = spawnSync(docker, args, {
    encoding: "utf8",
    windowsHide: true,
    ...options
  });
  if (resultado.error) throw resultado.error;
  return resultado;
}

function dockerDisponivel() {
  const resultado = run(["info"], { stdio: "ignore" });
  return resultado.status === 0;
}

function linhas(args) {
  const resultado = run(args);
  if (resultado.status !== 0) return [];
  return resultado.stdout
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter(Boolean);
}

function inspecionar(tipo, ids) {
  if (!ids.length) return [];
  const resultado = run([tipo, "inspect", ...ids]);
  if (resultado.status !== 0 || !resultado.stdout.trim()) return [];
  return JSON.parse(resultado.stdout);
}

function labelsDo(recurso) {
  return recurso?.Config?.Labels ?? recurso?.Labels ?? {};
}

function temLabelTestcontainers(labels) {
  return Object.entries(labels).some(([chave, valor]) => {
    const texto = `${chave}=${valor ?? ""}`.toLowerCase();
    return texto.includes("testcontainers") || texto.includes("org.testcontainers") || texto.includes("ryuk");
  });
}

function envDoContainer(container) {
  return container?.Config?.Env ?? [];
}

function ehPostgresTestePadaria(container) {
  const imagem = String(container?.Config?.Image ?? container?.ImageName ?? "").toLowerCase();
  const env = envDoContainer(container);
  return (
    imagem.startsWith("postgres:") &&
    env.includes("POSTGRES_DB=padaria_test") &&
    env.includes("POSTGRES_USER=padaria_test")
  );
}

function ehContainerDeTeste(container) {
  const labels = labelsDo(container);
  const imagem = String(container?.Config?.Image ?? "").toLowerCase();
  return temLabelTestcontainers(labels) || imagem.includes("testcontainers/ryuk") || ehPostgresTestePadaria(container);
}

function removerContainers() {
  const ids = linhas(["container", "ls", "-aq"]);
  const containers = inspecionar("container", ids);
  const alvos = containers.filter(ehContainerDeTeste).map((container) => container.Id);
  if (!alvos.length) {
    log(`${cor.cinza}..${cor.reset} nenhum container de teste encontrado`);
    return;
  }

  const resultado = run(["container", "rm", "-f", "-v", ...alvos], { stdio: "inherit" });
  if (resultado.status !== 0) throw new Error("falha ao remover containers de teste");
  log(`${cor.verde}OK${cor.reset} containers removidos: ${alvos.length}`);
}

function removerNetworks() {
  const ids = linhas(["network", "ls", "-q"]);
  const networks = inspecionar("network", ids);
  const alvos = networks
    .filter((network) => !["bridge", "host", "none"].includes(network.Name))
    .filter((network) => temLabelTestcontainers(labelsDo(network)))
    .map((network) => network.Id);

  if (!alvos.length) {
    log(`${cor.cinza}..${cor.reset} nenhuma network de teste encontrada`);
    return;
  }

  const resultado = run(["network", "rm", ...alvos], { stdio: "inherit" });
  if (resultado.status !== 0) throw new Error("falha ao remover networks de teste");
  log(`${cor.verde}OK${cor.reset} networks removidas: ${alvos.length}`);
}

function removerVolumes() {
  const nomes = linhas(["volume", "ls", "-q"]);
  const volumes = inspecionar("volume", nomes);
  const alvos = volumes.filter((volume) => temLabelTestcontainers(labelsDo(volume))).map((volume) => volume.Name);
  if (!alvos.length) {
    log(`${cor.cinza}..${cor.reset} nenhum volume de teste encontrado`);
    return;
  }

  const resultado = run(["volume", "rm", "-f", ...alvos], { stdio: "inherit" });
  if (resultado.status !== 0) throw new Error("falha ao remover volumes de teste");
  log(`${cor.verde}OK${cor.reset} volumes removidos: ${alvos.length}`);
}

try {
  log("Limpando rastros de Testcontainers da suite de testes");
  if (!dockerDisponivel()) {
    log(`${cor.amarelo}AVISO${cor.reset} Docker indisponivel; nada para limpar`);
    process.exit(0);
  }

  removerContainers();
  removerNetworks();
  removerVolumes();
  log(`${cor.verde}OK${cor.reset} limpeza de testes concluida`);
} catch (error) {
  log(`${cor.vermelho}ERRO${cor.reset} ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
