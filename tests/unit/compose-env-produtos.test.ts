import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// O compose do Coolify so injeta no container o que esta listado no bloco `environment` da api.
// As variaveis do Cadastro de Produtos (R-222) eram lidas pelo env.ts desde a PR #207, mas nunca
// foram listadas: em producao o fiscal ficou "fonte_indisponivel" e a margem do grupo 0 (28/10/2026).
// Mesmo furo do RESEND (A-08). Este teste trava as duas pontas: toda variavel do cadastro que o
// env.ts le precisa estar no compose, e aba com `min(1)` nao pode ir vazia (derruba a API).
const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const envTs = readFileSync(join(raiz, "api", "src", "env.ts"), "utf8");
const compose = readFileSync(join(raiz, "infra", "docker-compose.coolify.yml"), "utf8");

const DO_CADASTRO = /^\s{2}((?:GOOGLE_PRODUTOS|GOOGLE_SERVICE_ACCOUNT|CREARE)_[A-Z_]+):/gm;
const lidasPeloEnv = [...envTs.matchAll(DO_CADASTRO)].map((m) => m[1]!);

/** Linhas do bloco `environment` do servico api (ate o proximo servico). */
function ambienteDaApi(): Map<string, string> {
  const inicio = compose.indexOf("\n  api:");
  expect(inicio, "servico api no compose").toBeGreaterThan(-1);
  const proximo = compose.slice(inicio + 1).search(/\n {2}[a-z][\w-]*:\n/);
  const bloco = proximo === -1 ? compose.slice(inicio) : compose.slice(inicio, inicio + 1 + proximo);
  const linhas = new Map<string, string>();
  for (const m of bloco.matchAll(/^\s{6}([A-Z][A-Z0-9_]+):\s*(.*)$/gm)) linhas.set(m[1]!, m[2]!);
  return linhas;
}

describe("compose do Coolify entrega ao container as variaveis do Cadastro de Produtos", () => {
  const ambiente = ambienteDaApi();

  it("o env.ts le variaveis do cadastro (a regex ainda acha alguma)", () => {
    expect(lidasPeloEnv).toContain("GOOGLE_PRODUTOS_SPREADSHEET_ID");
    expect(lidasPeloEnv).toContain("CREARE_EXPORT_ENABLED");
  });

  it.each(lidasPeloEnv)("%s esta no environment da api", (nome) => {
    expect(ambiente.has(nome), `${nome} lida pelo env.ts e ausente do compose`).toBe(true);
  });

  it("aba com padrao no env.ts tem o MESMO padrao no compose (vazio derruba a API)", () => {
    const comPadrao = [...envTs.matchAll(/^\s{2}((?:GOOGLE_PRODUTOS)_[A-Z_]+_TAB):[^\n]*\.default\("([^"]+)"\)/gm)];
    expect(comPadrao.length).toBeGreaterThan(0);
    for (const [, nome, padrao] of comPadrao) {
      expect(ambiente.get(nome!), nome).toContain(`:-${padrao}}`);
    }
  });

  it("as flags de escrita nascem desligadas", () => {
    for (const nome of ["GOOGLE_PRODUTOS_ESPELHO_ENABLED", "CREARE_EXPORT_ENABLED", "CREARE_DRIVE_ENABLED"]) {
      expect(ambiente.get(nome), nome).toContain(":-false}");
    }
  });
});
