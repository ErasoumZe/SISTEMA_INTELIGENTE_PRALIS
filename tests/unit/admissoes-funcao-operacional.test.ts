import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { admissoesTestes } from "@padaria/db/schema/admissoes";
// As duas saem do MESMO barrel de propósito: é lado a lado que a diferença entre catálogo de acesso
// e catálogo operacional precisa ficar visível para quem lê.
import { cargos, funcoesOperacionais } from "@padaria/db/schema/cadastro";
import {
  criarTestePayloadSchema,
  funcaoOpcaoDtoSchema,
  testeListaDtoSchema,
  testesQuerySchema
} from "@padaria/shared/admissoes";

/**
 * ADM-001 — funcao operacional NAO e cargo de acesso.
 *
 * `cargos` neste sistema e catalogo de ACESSO: e a chave primaria de `permissoes_cargos`, e os dez
 * valores reais sao Caixa, Tesouraria, Gerencia, Compras, DP, RH, Fiscal, Diretor de Operacoes,
 * Diretor Geral e Financeiro. O periodo de teste chegou a apontar para la, e a consequencia pratica
 * era que registrar um PADEIRO exigiria criar um cargo de ACESSO chamado PADEIRO — visivel a toda
 * regra de permissao por cargo.
 *
 * Sao duas perguntas diferentes: cargo de acesso responde "o que pode ver"; funcao operacional
 * responde "o que faz". Este arquivo existe para a resposta nao voltar a ser a mesma lista.
 *
 * Roda sem banco: le o contrato Zod, a definicao Drizzle e o proprio codigo-fonte.
 */

const RAIZ = resolve(import.meta.dirname, "..", "..");

/** Onde a ADM-001 mora. O teste varre exatamente estes caminhos, e nada alem. */
const CAMINHOS_DA_ADM001 = [
  "shared/src/admissoes",
  "api/src/admissoes",
  "web-vue/components/admissoes"
];

function arquivosDe(diretorio: string, encontrados: string[] = []): string[] {
  for (const item of readdirSync(diretorio, { withFileTypes: true })) {
    const caminho = join(diretorio, item.name);
    if (item.isDirectory()) {
      arquivosDe(caminho, encontrados);
      continue;
    }
    if (/\.(ts|vue)$/.test(item.name)) encontrados.push(caminho);
  }
  return encontrados;
}

/**
 * Remove comentario de linha e de bloco.
 *
 * Sem isto o teste seria inutil na pratica: o codigo corrigido CITA `cargos` de proposito, para
 * explicar por que nao usa. Um teste que proibisse a palavra obrigaria a apagar justamente a
 * explicacao que impede o erro de voltar.
 */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * Escrito em pedacos porque este arquivo seria, senao, o unico "culpado" da propria varredura.
 * Mesmo idioma de `produtos-fonte-unica.test.ts`.
 */
const PROIBIDOS = ["cargo" + "Id", "cargo" + "Nome", "Cargo" + "OpcaoDto", "admissoes/" + "cargos"];

describe("a ADM-001 nao referencia cargo de acesso", () => {
  const arquivos = CAMINHOS_DA_ADM001.flatMap((relativo) => arquivosDe(join(RAIZ, relativo)));

  it("varre arquivos de verdade", () => {
    // Guarda do proprio teste: se alguem mover a pasta, os `expect` abaixo passariam por vacuidade.
    expect(arquivos.length).toBeGreaterThan(5);
  });

  it("nenhum arquivo da ADM-001 usa cargo como identificador", () => {
    const culpados = arquivos.filter((caminho) => {
      const codigo = semComentarios(readFileSync(caminho, "utf8"));
      return PROIBIDOS.some((agulha) => codigo.includes(agulha));
    });
    expect(culpados.map((c) => c.slice(RAIZ.length + 1))).toEqual([]);
  });

  it("o repositorio da ADM-001 nao importa a tabela cargos", () => {
    const codigo = semComentarios(readFileSync(join(RAIZ, "api/src/admissoes/admissoes.repository.ts"), "utf8"));
    // O import ausente e a barreira mais barata: sem o simbolo em escopo, a mistura nao compila.
    expect(codigo).not.toMatch(/import\s*\{[^}]*\bcargos\b[^}]*\}/);
  });
});

describe("o contrato so aceita funcao operacional", () => {
  /** CPF sintetico, com digitos verificadores calculados. Nao pertence a ninguem. */
  const CPF_FICTICIO = "12345678909";

  const payloadValido = {
    nomeCompleto: "Pessoa de Teste",
    cpf: CPF_FICTICIO,
    funcaoId: "11111111-1111-4111-8111-111111111111",
    jornadaHorario: "seg a sex, 08:00 as 17:00",
    inicioEm: "2026-09-01T12:00:00.000Z",
    fimCombinadoEm: "2026-09-30T12:00:00.000Z"
  };

  it("aceita funcaoId", () => {
    expect(criarTestePayloadSchema.parse(payloadValido).funcaoId).toBe(payloadValido.funcaoId);
  });

  it("recusa um payload que traga apenas cargoId", () => {
    const { funcaoId, ...semFuncao } = payloadValido;
    const resultado = criarTestePayloadSchema.safeParse({ ...semFuncao, cargoId: funcaoId });
    expect(resultado.success).toBe(false);
  });

  it("o filtro da listagem nao carrega cargoId", () => {
    const query = testesQuerySchema.parse({ page: 1, pageSize: 20, cargoId: "qualquer-coisa" });
    // Zod descarta chave desconhecida: o importante e que ela nao vire filtro por acidente.
    expect(query).not.toHaveProperty("cargoId");
  });

  it("o filtro da listagem carrega funcaoId", () => {
    const id = "22222222-2222-4222-8222-222222222222";
    expect(testesQuerySchema.parse({ page: 1, pageSize: 20, funcaoId: id }).funcaoId).toBe(id);
  });

  it("o DTO da lista exige funcaoNome e funcaoCbo, e nao conhece cargoNome", () => {
    const base = {
      id: "id",
      nomeCompleto: "Pessoa de Teste",
      cpfMascarado: "***.***.***-**",
      funcaoId: "id-funcao",
      funcaoNome: "PADEIRO",
      funcaoCbo: "848305",
      jornadaHorario: "seg a sex",
      inicioEm: "2026-09-01T12:00:00.000Z",
      fimCombinadoEm: "2026-09-30T12:00:00.000Z",
      status: "em_teste" as const,
      situacao: "ativo" as const,
      resultado: null,
      prazo: null,
      versao: 1
    };
    expect(testeListaDtoSchema.parse(base).funcaoNome).toBe("PADEIRO");

    const { funcaoNome, ...semNomeDaFuncao } = base;
    expect(testeListaDtoSchema.safeParse({ ...semNomeDaFuncao, cargoNome: funcaoNome }).success).toBe(false);
  });

  it("o CBO e opcional no DTO, porque nem toda funcao tem codigo", () => {
    const opcao = { id: "id", nome: "AJUDANTE", cbo: null, ativo: true };
    expect(funcaoOpcaoDtoSchema.parse(opcao).cbo).toBeNull();
  });

  it("a opcao do seletor declara a situacao da funcao", () => {
    // `ativo` viaja porque a tela precisa mostrar a inativa DESABILITADA, e nao escondida: escondida,
    // o formulario de edicao de um teste antigo apareceria com o seletor em branco.
    expect(funcaoOpcaoDtoSchema.safeParse({ id: "id", nome: "X", cbo: null }).success).toBe(false);
  });
});

describe("o schema separa as duas listas", () => {
  const funcoes = getTableConfig(funcoesOperacionais);
  const testes = getTableConfig(admissoesTestes);
  const colunasDoTeste = testes.columns.map((coluna) => coluna.name);

  it("funcoes_operacionais tem nome, CBO e situacao, por empresa", () => {
    // O nome NAO leva prefixo de modulo: o catalogo nasceu em Admissoes mas nao pertence a ela, e
    // `admissoes_funcoes` convidaria uma segunda lista de funcoes quando o cadastro precisar dela.
    expect(funcoes.name).toBe("funcoes_operacionais");
    const colunas = funcoes.columns.map((coluna) => coluna.name);
    expect(colunas).toEqual(expect.arrayContaining(["empresa_id", "nome", "cbo", "ativo"]));
  });

  it("admissoes_testes aponta para funcao, e nao para cargo", () => {
    expect(colunasDoTeste).toContain("funcao_id");
    expect(colunasDoTeste).not.toContain("cargo_id");
  });

  it("a FK do teste tem funcoes_operacionais como destino, composta com a empresa", () => {
    const referencias = testes.foreignKeys.map((fk) => fk.reference());
    const paraFuncao = referencias.find((r) => r.foreignTable === funcoesOperacionais);
    expect(paraFuncao).toBeDefined();
    // Composta: sem `empresa_id` na FK, apontar para funcao de outro tenant volta a ser representavel.
    expect(paraFuncao?.foreignColumns.map((c) => c.name).sort()).toEqual(["empresa_id", "id"]);
  });

  it("nenhuma FK do teste aponta para cargos", () => {
    const destinos = testes.foreignKeys.map((fk) => fk.reference().foreignTable);
    expect(destinos).not.toContain(cargos);
  });

  it("cargos volta ao estado original: a unique da ADM-001 saiu", () => {
    // Ela existia SO como alvo da FK composta. Com a referencia trocada, a ADM-001 deixa de tocar
    // qualquer tabela existente — e o diff da vertical vira puramente aditivo.
    const nomes = getTableConfig(cargos).uniqueConstraints.map((u) => u.name);
    expect(nomes).not.toContain("cargos_id_empresa_unica");
  });

  it("funcoes_operacionais nao se liga a permissoes", () => {
    const destinos = funcoes.foreignKeys.map((fk) => fk.reference().foreignTable);
    expect(destinos).not.toContain(cargos);
  });
});
