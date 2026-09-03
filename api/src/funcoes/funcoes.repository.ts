import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { admissoesProcessos, admissoesTestes } from "@padaria/db/schema/admissoes";
import { funcoesOperacionais } from "@padaria/db/schema/cadastro";
import type { FuncaoOperacionalDto } from "@padaria/shared/funcoes";
import { banco, type ExecutorBanco } from "../banco/conexao.js";

/**
 * Catalogo de funcoes operacionais.
 *
 * NAO existe funcao de exclusao neste arquivo, e a ausencia e a regra: funcao sai de circulacao por
 * `ativo = false`, nunca por `delete`. Apagar levaria embora a leitura do historico — o periodo de
 * teste e o processo de admissao que apontam para ela guardam O QUE FOI COMBINADO com uma pessoa.
 *
 * O banco tambem recusa: as duas chaves estrangeiras que apontam para ca sao compostas com a
 * empresa e nao tem `on delete cascade`. Aqui nao ha rota; la nao ha permissao do banco. As duas
 * coisas, e nao uma.
 */

/**
 * Quais funcoes desta empresa ja foram usadas.
 *
 * Duas consultas simples em vez de um `exists` correlacionado: template literal de SQL cru e
 * proibido em `api/src` pelo gate de arquitetura, e duas listas de ids curtas custam menos que a
 * legibilidade perdida.
 *
 * As duas filtram por empresa. Sem isso, uma funcao apareceria "em uso" por causa de um registro de
 * outro tenant — que e justamente o que a chave estrangeira composta impede de existir.
 */
async function idsEmUso(escopoEmpresas: string[], db: ExecutorBanco): Promise<Set<string>> {
  const [deTestes, deProcessos] = await Promise.all([
    db
      .selectDistinct({ funcaoId: admissoesTestes.funcaoId })
      .from(admissoesTestes)
      .where(inArray(admissoesTestes.empresaId, escopoEmpresas)),
    db
      .selectDistinct({ funcaoId: admissoesProcessos.funcaoId })
      .from(admissoesProcessos)
      .where(
        and(
          inArray(admissoesProcessos.empresaId, escopoEmpresas),
          // No processo a funcao e nula quando a origem e teste efetivado — o CHECK de coerencia
          // garante isso. Filtrar aqui evita levar `null` para dentro do conjunto.
          isNotNull(admissoesProcessos.funcaoId)
        )
      )
  ]);
  const usados = new Set<string>();
  for (const linha of [...deTestes, ...deProcessos]) {
    if (linha.funcaoId) usados.add(linha.funcaoId);
  }
  return usados;
}

export async function listarFuncoesOperacionaisRepository(
  escopoEmpresas: string[],
  db: ExecutorBanco = banco
): Promise<FuncaoOperacionalDto[]> {
  const linhas = await db
    .select({
      id: funcoesOperacionais.id,
      empresaId: funcoesOperacionais.empresaId,
      nome: funcoesOperacionais.nome,
      cbo: funcoesOperacionais.cbo,
      ativo: funcoesOperacionais.ativo
    })
    .from(funcoesOperacionais)
    .where(inArray(funcoesOperacionais.empresaId, escopoEmpresas))
    // A mesma ordem do seletor de admissao: ativas primeiro, depois por nome. `desc` porque no
    // Postgres `false < true` — com `asc`, as INATIVAS e que subiriam para o topo, que e o oposto
    // do que a tela precisa. Duas ordens diferentes para a mesma lista fariam o DP procurar no
    // lugar errado.
    .orderBy(desc(funcoesOperacionais.ativo), asc(funcoesOperacionais.nome));

  const usados = await idsEmUso(escopoEmpresas, db);
  return linhas.map((linha) => ({ ...linha, emUso: usados.has(linha.id) }));
}

export type FuncaoOperacionalEscrita = {
  id?: string;
  empresaId: string;
  nome: string;
  ativo: boolean;
  /** AUSENTE nao mexe no gravado; `null` limpa. Mesma disciplina dos campos novos do turno. */
  cbo?: string | null;
};

export async function salvarFuncaoOperacionalRepository(
  input: FuncaoOperacionalEscrita,
  db: ExecutorBanco = banco
): Promise<{ id: string } | null> {
  if (input.id) {
    const [linha] = await db
      .update(funcoesOperacionais)
      .set({
        nome: input.nome,
        ativo: input.ativo,
        // Espalhado condicionalmente: sem a chave no objeto, o Drizzle nao a poe no SET e o valor
        // gravado sobrevive.
        ...(input.cbo === undefined ? {} : { cbo: input.cbo }),
        atualizadoEm: new Date()
      })
      // A empresa entra no WHERE: id de outra empresa nao atualiza nada, e o chamador recebe nulo —
      // que e a unica coisa que ele pode saber.
      .where(and(eq(funcoesOperacionais.id, input.id), eq(funcoesOperacionais.empresaId, input.empresaId)))
      .returning({ id: funcoesOperacionais.id });
    return linha ?? null;
  }

  const [criada] = await db
    .insert(funcoesOperacionais)
    .values({
      empresaId: input.empresaId,
      nome: input.nome,
      cbo: input.cbo ?? null,
      ativo: input.ativo
    })
    .returning({ id: funcoesOperacionais.id });
  return criada ?? null;
}
