import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// A guarda que impede durabilidade desligada fora de banco descartavel — provada de verdade.
//
// A versao anterior deste trabalho dizia "provado por mutacao" na MENSAGEM DE COMMIT: eu editava um
// compose a mao, via o vermelho e restaurava. Isso prova uma vez, para uma pessoa, e some. A
// auditoria mostrou o preco: a guarda so casava a grafia `off` minuscula, e `fsync=false` passava
// batido — furo que uma mutacao automatizada teria pego antes de existir.
//
// Aqui a guarda roda de verdade, contra uma arvore de mentira montada em pasta temporaria. Nada
// toca o repositorio: o script varre caminhos RELATIVOS, entao basta rodar com outro `cwd`.
const scriptDaGuarda = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "scripts", "verificar-texto.mjs");

describe("verificar-texto - durabilidade desligada fora de teste", () => {
  let raiz = "";

  beforeEach(() => {
    raiz = mkdtempSync(join(tmpdir(), "guarda-durabilidade-"));
  });

  afterEach(() => {
    rmSync(raiz, { recursive: true, force: true });
  });

  function escrever(caminhoRelativo: string, conteudo: string) {
    const destino = join(raiz, caminhoRelativo);
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, conteudo, "utf8");
  }

  function rodarGuarda() {
    const resultado = spawnSync(process.execPath, [scriptDaGuarda], { cwd: raiz, encoding: "utf8" });
    return { codigo: resultado.status, erro: resultado.stderr ?? "" };
  }

  // As quatro grafias que o Postgres aceita para "desligado", e o fato de o nome do parametro nao
  // diferenciar maiusculas. Cada uma destas ja passou batido em alguma versao da guarda.
  const grafias = [
    ["off minusculo", 'command: ["postgres","-c","fsync=off"]'],
    ["com espacos", 'command: ["postgres","-c","fsync = off"]'],
    ["OFF maiusculo", 'command: ["postgres","-c","FSYNC=OFF"]'],
    ["Off capitalizado", 'command: ["postgres","-c","fsync=Off"]'],
    ["zero", 'command: ["postgres","-c","fsync=0"]'],
    ["false", 'command: ["postgres","-c","fsync=false"]'],
    ["no", 'command: ["postgres","-c","fsync=no"]']
  ] as const;

  it.each(grafias)("recusa fsync desligado com grafia %s", (_nome, linha) => {
    escrever("db/docker-compose-db.yml", `services:\n  db:\n    image: postgres:16\n    ${linha}\n`);
    const { codigo, erro } = rodarGuarda();
    expect(codigo, `deveria recusar: ${linha}`).toBe(1);
    expect(erro).toMatch(/durabilidade desligada/u);
  });

  it.each([
    ["synchronous_commit", 'command: ["postgres","-c","synchronous_commit=false"]'],
    ["full_page_writes", 'command: ["postgres","-c","FULL_PAGE_WRITES = No"]']
  ])("recusa %s desligado", (_nome, linha) => {
    escrever("db/docker-compose-db.yml", `services:\n  db:\n    ${linha}\n`);
    expect(rodarGuarda().codigo).toBe(1);
  });

  // Cobertura de ONDE a guarda olha. Cada um destes ja foi ponto cego: o compose da raiz ficou de
  // fora da primeira lista escrita a mao, e subpasta e `compose.yaml` da varredura seguinte.
  const lugares = [
    ["compose da raiz", "docker-compose.yml"],
    ["compose.yaml da raiz, nome preferencial do Compose Spec", "compose.yaml"],
    ["compose.yml da raiz", "compose.yml"],
    ["subpasta de infra", "infra/staging/docker-compose.yml"],
    ["subpasta de db", "db/local/compose.yaml"]
  ] as const;

  it.each(lugares)("encontra o vazamento em %s", (_nome, caminho) => {
    escrever(caminho, 'services:\n  db:\n    command: ["postgres","-c","fsync=off"]\n');
    const { codigo } = rodarGuarda();
    expect(codigo, `deveria varrer ${caminho}`).toBe(1);
  });

  it("recusa tambem em codigo fora de tests/", () => {
    escrever("api/src/app.ts", 'export const comando = "fsync=false";\n');
    expect(rodarGuarda().codigo).toBe(1);
  });

  // O outro lado: dentro de `tests/` e exatamente onde isto PODE existir. Se a guarda recusasse
  // aqui, ela quebraria o proprio harness que motivou a mudanca.
  it("permite dentro de tests/, que e o banco descartavel", () => {
    escrever("tests/setup/postgres-efemero.ts", 'export const c = ["postgres", "-c", "fsync=off"];\n');
    expect(rodarGuarda().codigo).toBe(0);
  });

  it("nao inventa falha numa arvore limpa", () => {
    escrever("db/docker-compose-db.yml", "services:\n  db:\n    image: postgres:16-alpine\n");
    escrever("api/src/app.ts", "export const app = 1;\n");
    expect(rodarGuarda().codigo).toBe(0);
  });
});
