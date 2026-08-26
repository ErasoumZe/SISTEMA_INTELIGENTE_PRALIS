import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * R-165 — somente a planilha do Rodrigo pode CRIAR produto.
 *
 * O app Pralis deixou de ser fonte executavel: o importador dedicado
 * (`api/src/scripts/importar-pralis.ts`) e o script `importar:pralis` foram REMOVIDOS, nao
 * desativados. Este teste falha se qualquer um dos dois voltar — inclusive por copia com
 * outro nome — porque "o caminho antigo ainda existir" e exatamente o defeito que a regra-mae
 * do `16_DEFINITION_OF_DONE` proibe.
 */

const RAIZ = resolve(import.meta.dirname, "..", "..");

/** Diretorios que nao interessam a varredura (dependencias, build e a pasta de referencia do Pralis). */
const IGNORADOS = new Set([
  "node_modules",
  ".git",
  ".nuxt",
  ".output",
  "dist",
  "coverage",
  "CADASTRO DE PRODUTOS",
  "_ARQUIVO_MORTO"
]);

function arquivosDeCodigo(diretorio: string, encontrados: string[] = []): string[] {
  for (const item of readdirSync(diretorio, { withFileTypes: true })) {
    if (IGNORADOS.has(item.name)) continue;
    const caminho = join(diretorio, item.name);
    if (item.isDirectory()) {
      arquivosDeCodigo(caminho, encontrados);
      continue;
    }
    if (/\.(ts|mts|mjs|js|vue)$/.test(item.name)) encontrados.push(caminho);
  }
  return encontrados;
}

/**
 * Montadas em pedacos de proposito: escritas inteiras, este proprio arquivo viraria o unico
 * "culpado" da varredura.
 */
const AGULHAS = ["base" + "-products", "pralis" + "/stack", "importar" + "-pralis"];

describe("R-165 - o Pralis nao e mais fonte executavel de produto", () => {
  // O proprio teste fica de fora: ele cita os termos justamente para proibi-los.
  const arquivos = arquivosDeCodigo(RAIZ).filter((caminho) => caminho !== resolve(import.meta.filename));

  it("nenhum arquivo de codigo le o catalogo do app Pralis", () => {
    const culpados = arquivos.filter((caminho) => {
      const conteudo = readFileSync(caminho, "utf8");
      return AGULHAS.some((agulha) => conteudo.includes(agulha));
    });
    expect(culpados).toEqual([]);
  });

  it("o script de importacao do Pralis nao existe em nenhum package.json", () => {
    const agulha = "importar" + ":pralis";
    const pacotes = [
      "package.json",
      "api/package.json",
      "db/package.json",
      "shared/package.json",
      "web-vue/package.json"
    ];
    for (const pacote of pacotes) {
      const conteudo = readFileSync(join(RAIZ, pacote), "utf8");
      expect(conteudo, `${pacote} ainda cita o script removido`).not.toContain(agulha);
    }
  });

  it("a pasta de referencia continua no disco e continua fora do Git", () => {
    // A R-165 remove o caminho EXECUTAVEL, nao a referencia visual/historica.
    const gitignore = readFileSync(join(RAIZ, ".gitignore"), "utf8");
    expect(gitignore).toContain("CADASTRO DE PRODUTOS");
  });
});
