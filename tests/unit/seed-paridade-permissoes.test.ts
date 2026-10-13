import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { permissoesPorCargo } from "@padaria/db/referencia-permissoes";

/**
 * O seed de desenvolvimento tem de USAR a referencia, nunca copia-la.
 *
 * Ate 28/08/2026 `db/seed.ts` mantinha uma segunda implementacao do mesmo motor de permissoes mais
 * uma segunda copia da matriz dos 10 cargos, "em paridade manual" — e a paridade quebrou em
 * silencio: o seed ficou inteiro na ADM-001 e nenhum cargo recebia as permissoes de
 * `admissoes_processos`. DP e Gerencia nao viam a tela de Processos em desenvolvimento, e nada
 * acusou, porque nenhum teste le esse arquivo.
 *
 * Este teste guarda a correcao estrutural. Nao compara listas: comparar exigiria uma terceira copia
 * aqui, e a terceira copia divergiria igual. Ele prova que a copia NAO VOLTOU — enquanto o seed
 * importar a referencia e nao redeclarar o motor, divergir e impossivel, nao apenas improvavel.
 */

const RAIZ = join(import.meta.dirname, "..", "..");
const seed = readFileSync(join(RAIZ, "db", "seed.ts"), "utf8");

/** Mesma limpeza dos outros testes de varredura: explicar em comentario e permitido. */
function semComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");
}

const codigo = semComentarios(seed);

describe("db/seed.ts usa a referencia de permissoes, e nao uma copia", () => {
  it("Deve_ImportarDaReferencia_Quando_MontarAMatrizDeCargos", () => {
    expect(codigo).toMatch(/from\s+"\.\/src\/referencia-permissoes\.js"/u);
    for (const simbolo of ["permissoesDoCargo", "permissoesPorCargo", "regrasPermissoes"]) {
      expect(codigo, simbolo).toContain(simbolo);
    }
  });

  it("Deve_NaoRedeclararOMotor_Quando_AlguemForTentadoACopiarDeNovo", () => {
    // Os nomes exatos que existiam na copia antiga. Se voltarem, a divergencia volta junto.
    for (const copiado of [
      "permissoesDoCargoSeed",
      "permissoesPorCargoSeed",
      "permissaoAcessoPorTelaSeed",
      "regrasPermissoesSeed",
      "menuMostrarSeed",
      "telasSomenteCaixaAbertoSeed"
    ]) {
      expect(codigo, copiado).not.toContain(copiado);
    }
    // E a forma generica: nenhuma segunda declaracao do motor, com qualquer nome.
    expect(codigo).not.toMatch(/function\s+permissoesDoCargo\w*\s*\(/u);
    expect(codigo).not.toMatch(/const\s+permissaoAcessoPorTela\w*\s*=/u);
  });

  it("Deve_ManterOsCargosDaReferencia_Quando_LimparEGravarPermissoes", () => {
    // O seed apaga e regrava os cargos pelo nome. Se a lista deixasse de sair da referencia, um
    // cargo novo nasceria sem permissao e ninguem perceberia.
    expect(codigo).toMatch(/Object\.keys\(permissoesPorCargo\)/u);
    expect(Object.keys(permissoesPorCargo).length).toBeGreaterThan(0);
  });

  it("Deve_DarAoDpEGerenciaOAcessoAProcessos_Quando_LidoDaReferencia", () => {
    // A regra que a divergencia quebrava, agora lida da fonte que o seed passou a usar.
    for (const cargo of ["DP", "Gerencia"]) {
      const lista = permissoesPorCargo[cargo];
      expect(lista, cargo).toBeDefined();
      expect(lista, `${cargo} visualiza`).toContain("admissoes_processos_visualizar");
      expect(lista, `${cargo} ve no menu`).toContain("menu_admissoes_processos_mostrar");
      expect(lista, `${cargo} cria direta`).toContain("admissoes_processos_criar_direta");
      expect(lista, `${cargo} cancela`).toContain("admissoes_processos_cancelar");
    }
    // O bloco interno e do DP. A Gerencia carrega o processo, mas nao o ASO.
    expect(permissoesPorCargo["DP"]).toContain("admissoes_processos_editar_internos");
    expect(permissoesPorCargo["Gerencia"]).not.toContain("admissoes_processos_editar_internos");
    // Diretor Geral nao participa de admissoes, mas acompanha e decide a conferencia final do
    // caixa junto da Tesouraria. A excecao precisa continuar limitada a essas duas chaves.
    expect(permissoesPorCargo["Diretor Geral"]).toEqual([
      "relatorio_fechamento_visualizar",
      "fechamentos_caixa_conferir"
    ]);
  });
});
