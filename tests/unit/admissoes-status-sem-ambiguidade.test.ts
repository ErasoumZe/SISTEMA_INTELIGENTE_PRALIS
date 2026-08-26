import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { admissoesTestes } from "@padaria/db/schema/admissoes";
import {
  criarTestePayloadSchema,
  editarTestePayloadSchema,
  situacaoDoTeste,
  statusDaSituacao,
  statusTeste
} from "@padaria/shared/admissoes";

/**
 * ADM-001 — a tela nao pode reintroduzir ambiguidade de status.
 *
 * Tres coisas que a interface ja tentou sugerir e que este arquivo existe para impedir:
 *
 *   1. que "Excluir" volte como rotulo de acao. A acao nunca apagou nada, e o nome dizia que sim.
 *   2. que apareca DELETE fisico. O historico referencia a raiz com `on delete cascade`; apagar a
 *      linha apagaria a propria auditoria junto.
 *   3. que Ativo/Inativo vire campo. Eles sao DERIVADOS de `status` por `situacaoDoTeste`, e um
 *      campo manual seria a segunda fonte de verdade que a D-2 do PROJECT_BRAIN/31 proibe.
 *
 * Roda sem banco: le o contrato Zod, a definicao Drizzle e o proprio codigo-fonte.
 */

const RAIZ = resolve(import.meta.dirname, "..", "..");
const TELA = join(RAIZ, "web-vue", "components", "admissoes");
const CONTROLLER = join(RAIZ, "api", "src", "admissoes", "admissoes.controller.ts");
const REPOSITORY = join(RAIZ, "api", "src", "admissoes", "admissoes.repository.ts");

/**
 * Remove comentario de linha, de bloco e de HTML.
 *
 * Sem isto o teste seria inutil: o codigo corrigido CITA "Excluir" de proposito, para registrar que
 * o nome antigo era mentira. Proibir a palavra apagaria justamente a explicacao.
 */
function semComentarios(fonte: string): string {
  return fonte
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function arquivosDaTela(): string[] {
  return readdirSync(TELA)
    .filter((n) => n.endsWith(".vue"))
    .map((n) => join(TELA, n));
}

describe("a acao de cancelar nao se disfarca de exclusao", () => {
  const arquivos = arquivosDaTela();

  it("varre arquivos de verdade", () => {
    expect(arquivos.length).toBeGreaterThan(2);
  });

  it('nenhuma tela de Admissoes usa "Excluir" como texto de acao', () => {
    // Escrito em pedacos: inteiro, este arquivo seria o unico culpado da propria varredura.
    const proibido = "Exclu" + "ir";
    const culpados = arquivos.filter((caminho) => semComentarios(readFileSync(caminho, "utf8")).includes(proibido));
    expect(culpados.map((c) => c.slice(RAIZ.length + 1))).toEqual([]);
  });

  it("o botao e o dialogo dizem o que a acao faz", () => {
    const painel = readFileSync(join(TELA, "TesteDetalhePainel.vue"), "utf8");
    expect(painel).toContain("Cancelar e arquivar");
    // O dialogo precisa dizer as quatro coisas, senao o rotulo novo vira so outra palavra.
    expect(painel).toMatch(/não apaga o cadastro/iu);
    expect(painel).toMatch(/histórico inteiro é preservado/iu);
    expect(painel).toMatch(/obrigatório informar um motivo/iu);
    expect(painel).toMatch(/fica <strong>Inativo<\/strong>/iu);
  });

  it('o botao de encerrar diz "Encerrar teste"', () => {
    expect(readFileSync(join(TELA, "TesteDetalhePainel.vue"), "utf8")).toContain("Encerrar teste");
  });
});

describe("nao existe exclusao fisica", () => {
  it("o controller nao expoe nenhuma rota DELETE", () => {
    const codigo = semComentarios(readFileSync(CONTROLLER, "utf8"));
    expect(codigo).not.toMatch(/\bapp\s*\.\s*delete\s*\(/u);
  });

  it("cancelar e POST, e nao DELETE", () => {
    const codigo = semComentarios(readFileSync(CONTROLLER, "utf8"));
    expect(codigo).toMatch(/app\s*\.\s*post\s*\(\s*\n?\s*"\/api\/admissoes\/testes\/:id\/cancelar"/u);
  });

  it("o repositorio nunca apaga linha de teste nem de historico", () => {
    const codigo = semComentarios(readFileSync(REPOSITORY, "utf8"));
    // `db.delete(...)` do drizzle. Apagar a raiz levaria o historico junto, por cascade.
    expect(codigo).not.toMatch(/\.\s*delete\s*\(/u);
  });
});

describe("Ativo/Inativo e derivado, nunca gravado", () => {
  const colunas = getTableConfig(admissoesTestes).columns.map((c) => c.name);

  it("a tabela nao tem coluna de situacao nem de ativo", () => {
    expect(colunas).not.toContain("situacao");
    expect(colunas).not.toContain("ativo");
    expect(colunas).toContain("status");
  });

  const base = {
    nomeCompleto: "Pessoa de Teste",
    cpf: "12345678909",
    funcaoId: "11111111-1111-4111-8111-111111111111",
    jornadaHorario: "seg a sex, 08:00 as 17:00",
    inicioEm: "2026-09-01T12:00:00.000Z",
    fimCombinadoEm: "2026-09-30T12:00:00.000Z"
  };

  it("o payload de criacao descarta situacao e ativo", () => {
    const dados = criarTestePayloadSchema.parse({ ...base, situacao: "inativo", ativo: false });
    expect(dados).not.toHaveProperty("situacao");
    expect(dados).not.toHaveProperty("ativo");
  });

  it("o payload de edicao descarta situacao e ativo", () => {
    const dados = editarTestePayloadSchema.parse({ ...base, versao: 1, situacao: "inativo", ativo: false });
    expect(dados).not.toHaveProperty("situacao");
    expect(dados).not.toHaveProperty("ativo");
  });

  it("a derivacao cobre os tres estados e so eles", () => {
    expect(statusTeste.map(situacaoDoTeste)).toEqual(["ativo", "inativo", "inativo"]);
    expect(statusDaSituacao("ativo")).toEqual(["em_teste"]);
    expect(statusDaSituacao("inativo")).toEqual(["encerrado", "cancelado"]);
  });

  it("nenhuma tela escreve situacao no payload", () => {
    // Ler `teste.situacao` para EXIBIR e correto. Manda-la de volta seria transformar a derivacao
    // em campo, que e o passo que cria a segunda fonte de verdade.
    for (const caminho of arquivosDaTela()) {
      const codigo = semComentarios(readFileSync(caminho, "utf8"));
      expect(codigo, caminho).not.toMatch(/situacao\s*:\s*(form|payload)\./u);
      expect(codigo, caminho).not.toMatch(/payload\[\s*"situacao"\s*\]/u);
    }
  });
});

describe("nao existe reabertura", () => {
  it("nenhuma rota devolve o teste para em_teste", () => {
    const codigo = semComentarios(readFileSync(CONTROLLER, "utf8"));
    expect(codigo).not.toMatch(/reabrir|reativar|restaurar/iu);
  });

  it("nenhuma tela oferece reabrir", () => {
    for (const caminho of arquivosDaTela()) {
      expect(semComentarios(readFileSync(caminho, "utf8")), caminho).not.toMatch(/reabrir|reativar/iu);
    }
  });
});
