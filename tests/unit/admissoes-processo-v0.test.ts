import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { admissoesProcessos, admissoesProcessosHistorico } from "@padaria/db/schema/admissoes";
import { colaboradores } from "@padaria/db/schema/cadastro";
import {
  cancelarProcessoPayloadSchema,
  processoDetalheDtoSchema,
  situacaoDoProcesso,
  statusProcesso
} from "@padaria/shared/admissoes";

/**
 * ADM-002 V0 — o que a vertical NAO pode virar.
 *
 * A V0 e puramente aditiva e tem exatamente dois estados. Estes testes existem para que crescer
 * fora do escopo seja um erro de build, e nao uma descoberta na revisao.
 *
 * Roda sem banco: le o contrato Zod, a definicao Drizzle e o proprio codigo-fonte.
 */

const RAIZ = resolve(import.meta.dirname, "..", "..");
const MODULO = join(RAIZ, "api", "src", "admissoes");

function semComentarios(fonte: string): string {
  return fonte
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function fontesDoProcesso(): { nome: string; codigo: string }[] {
  return readdirSync(MODULO)
    .filter((n) => n.startsWith("processos."))
    .map((n) => ({ nome: n, codigo: semComentarios(readFileSync(join(MODULO, n), "utf8")) }));
}

describe("a V0 nao cresce para fora do escopo", () => {
  const fontes = fontesDoProcesso();

  it("varre arquivos de verdade", () => {
    expect(fontes.map((f) => f.nome).sort()).toEqual([
      "processos.controller.ts",
      "processos.repository.ts",
      "processos.service.ts"
    ]);
  });

  it("nao existe rota de iniciar admissao", () => {
    // Escrito em pedacos para este arquivo nao ser o unico culpado da propria varredura.
    const proibido = "/api/admissoes/" + "processos/:id/iniciar";
    for (const { nome, codigo } of fontes) {
      expect(codigo, nome).not.toContain(proibido);
      expect(codigo, nome).not.toMatch(/app\s*\.\s*post\s*\(\s*"\/api\/admissoes\/processos"/u);
    }
  });

  it("nao existe rota de LISTA de processos", () => {
    // A V0 nao tem listagem, pagina de lista nem menu: o processo e alcancado so pelo teste
    // efetivado. Lista sem filtro, paginacao e dono definido seria superficie criada cedo demais.
    for (const { nome, codigo } of fontes) {
      expect(codigo, nome).not.toMatch(/app\s*\.\s*get\s*\(\s*"\/api\/admissoes\/processos"\s*,/u);
    }
  });

  it("o modulo do processo nao referencia colaborador", () => {
    // O vinculo com o cadastro operacional e escopo inteiro da V7, incluindo a coluna.
    for (const { nome, codigo } of fontes) {
      expect(codigo.toLowerCase(), nome).not.toContain("colaborador");
    }
  });

  it("nenhuma tela de processo aparece no menu", () => {
    const menu = semComentarios(readFileSync(join(RAIZ, "web-vue", "utils", "menu.ts"), "utf8"));
    expect(menu).not.toContain("admissoes_processos");
  });
});

describe("estados: exatamente dois, e nenhum antecipado", () => {
  const config = getTableConfig(admissoesProcessos);

  it("o contrato tem apenas iniciado e cancelado", () => {
    expect([...statusProcesso]).toEqual(["iniciado", "cancelado"]);
  });

  it("nenhum estado de vertical futura foi reservado", () => {
    // Aceitar um estado antes de a regra dele existir grava vocabulario que ninguem confirmou com o
    // DP — e que passa a ser gravavel por qualquer bug.
    const futuros = ["aguardando_candidato", "em_revisao_dp", "pronto_para_efetivar", "efetivado"];
    for (const estado of futuros) {
      expect([...statusProcesso]).not.toContain(estado);
    }
  });

  it("a situacao e derivada, e cobre os dois estados", () => {
    expect(statusProcesso.map(situacaoDoProcesso)).toEqual(["ativo", "inativo"]);
  });

  it("a tabela nao tem coluna de situacao nem de ativo", () => {
    const colunas = config.columns.map((c) => c.name);
    expect(colunas).toContain("status");
    expect(colunas).not.toContain("situacao");
    expect(colunas).not.toContain("ativo");
  });

  it("o payload de cancelar descarta situacao", () => {
    const dados = cancelarProcessoPayloadSchema.parse({
      versao: 1,
      motivoCancelamento: "vaga_cancelada",
      situacao: "inativo"
    });
    expect(dados).not.toHaveProperty("situacao");
  });
});

describe("a V0 e puramente aditiva", () => {
  const config = getTableConfig(admissoesProcessos);

  it("o processo nao tem colaborador_id", () => {
    expect(config.columns.map((c) => c.name)).not.toContain("colaborador_id");
  });

  it("nenhuma FK do processo aponta para colaboradores", () => {
    const destinos = config.foreignKeys.map((fk) => fk.reference().foreignTable);
    expect(destinos).not.toContain(colaboradores);
  });

  it("colaboradores continua sem unique novo", () => {
    // A V0 nao pode ter tocado a tabela. `colaboradores_usuario_id_unico` e indice parcial, nao
    // unique constraint — a lista de uniques da tabela tem de continuar vazia.
    expect(getTableConfig(colaboradores).uniqueConstraints.map((u) => u.name)).toEqual([]);
  });

  it("a migration nova nao altera tabela existente", () => {
    // Enquanto a 0033 nao existir, o teste passa por ausencia — e volta a valer no minuto em que ela
    // aparecer. E de proposito: o guarda precisa estar pronto ANTES da migration.
    const dir = join(RAIZ, "db", "migrations");
    const nova = readdirSync(dir).filter((n) => n.startsWith("0033_") && n.endsWith(".sql"));
    for (const arquivo of nova) {
      const sql = readFileSync(join(dir, arquivo), "utf8");
      const alterados = [...sql.matchAll(/ALTER TABLE "([a-z0-9_]+)"/gi)].map((m) => m[1]);
      const permitidas = new Set(["admissoes_processos", "admissoes_processos_historico"]);
      expect(alterados.filter((t) => !permitidas.has(t ?? "")), arquivo).toEqual([]);
    }
  });
});

describe("a origem e o vinculo com o teste", () => {
  const config = getTableConfig(admissoesProcessos);

  it("a FK do teste e composta com a empresa", () => {
    const paraTeste = config.foreignKeys
      .map((fk) => fk.reference())
      .find((r) => r.columns.some((c) => c.name === "teste_id"));
    expect(paraTeste?.foreignColumns.map((c) => c.name).sort()).toEqual(["empresa_id", "id"]);
  });

  it("um teste so pode ter um processo", () => {
    // A garantia de "uma admissao por teste" mora no BANCO, nao no servico: duas transacoes
    // concorrentes passariam pelas duas pre-checagens.
    const uniques = config.uniqueConstraints.map((u) => u.columns.map((c) => c.name).join(","));
    expect(uniques).toContain("teste_id");
  });

  it("o detalhe exige a origem", () => {
    const base = {
      id: "id",
      status: "iniciado" as const,
      situacao: "ativo" as const,
      versao: 1,
      testeId: "id-teste",
      testeNomeCompleto: "Pessoa de Teste",
      motivoCancelamento: null,
      criadoPorNome: null,
      criadoEm: "2026-09-01T12:00:00.000Z",
      atualizadoPorNome: null,
      atualizadoEm: "2026-09-01T12:00:00.000Z",
      canceladoPorNome: null,
      canceladoEm: null
    };
    expect(processoDetalheDtoSchema.parse(base).testeId).toBe("id-teste");

    const { testeId, ...semOrigem } = base;
    expect(processoDetalheDtoSchema.safeParse(semOrigem).success).toBe(false);
  });
});

describe("a trilha e append-only", () => {
  const config = getTableConfig(admissoesProcessosHistorico);

  it("guarda nomes de campo, nunca valores", () => {
    expect(config.columns.map((c) => c.name)).toContain("campos_alterados");
  });

  it("nao tem atualizado_em: nada aqui e alterado depois de gravado", () => {
    expect(config.columns.map((c) => c.name)).not.toContain("atualizado_em");
  });

  it("so as duas acoes que a V0 alcanca", () => {
    const codigo = readFileSync(join(RAIZ, "db", "src", "schema", "app.schema.ts"), "utf8");
    const bloco = codigo.slice(codigo.indexOf("admissoes_processos_historico_acao_check"));
    expect(bloco.slice(0, 160)).toContain("'criado', 'cancelado'");
  });
});
