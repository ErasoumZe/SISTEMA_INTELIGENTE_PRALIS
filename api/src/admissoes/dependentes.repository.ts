import { and, asc, eq } from "drizzle-orm";
import { admissoesProcessosDependentes } from "@padaria/db/schema";
import type { TransacaoBanco } from "../banco/conexao.js";
import { banco } from "../banco/conexao.js";

/**
 * ADM-003 V4 — acesso aos dependentes do processo.
 *
 * TODA consulta filtra por `processo_id` E `empresa_id`, inclusive quando ja recebe o `id` da linha.
 * O `id` sozinho seria suficiente para achar a linha e insuficiente para provar que ela e desta
 * empresa: quem descobrisse um uuid de outra empresa conseguiria apagar dependente alheio. A chave
 * estrangeira composta `(processo_id, empresa_id)` ja torna a mistura impossivel de gravar; este
 * filtro torna impossivel de LER e de APAGAR.
 */

const selecao = {
  id: admissoesProcessosDependentes.id,
  nomeCompleto: admissoesProcessosDependentes.nomeCompleto,
  nascimento: admissoesProcessosDependentes.nascimento,
  parentesco: admissoesProcessosDependentes.parentesco,
  cpf: admissoesProcessosDependentes.cpf,
  finalidades: admissoesProcessosDependentes.finalidades
};

function doProcesso(processoId: string, empresaId: string) {
  return and(
    eq(admissoesProcessosDependentes.processoId, processoId),
    eq(admissoesProcessosDependentes.empresaId, empresaId)
  );
}

export async function listarDependentesRepository(
  processoId: string,
  empresaId: string,
  db: TransacaoBanco | typeof banco = banco
) {
  return db
    .select(selecao)
    .from(admissoesProcessosDependentes)
    // Ordem estavel: sem ela a lista embaralha a cada gravacao e o candidato perde o lugar. `id`
    // desempata o mesmo instante, que acontece quando duas abas gravam junto.
    .orderBy(asc(admissoesProcessosDependentes.criadoEm), asc(admissoesProcessosDependentes.id))
    .where(doProcesso(processoId, empresaId));
}

/**
 * Quantos existem. Seleciona so o `id` de proposito: a contagem nao precisa de nome, nascimento nem
 * CPF, e trazer PII de terceiro para a memoria por causa de um numero e coleta sem finalidade.
 */
export async function contarDependentesRepository(
  processoId: string,
  empresaId: string,
  db: TransacaoBanco | typeof banco = banco
): Promise<number> {
  const linhas = await db
    .select({ id: admissoesProcessosDependentes.id })
    .from(admissoesProcessosDependentes)
    .where(doProcesso(processoId, empresaId));
  return linhas.length;
}

export async function criarDependenteRepository(
  input: {
    processoId: string;
    empresaId: string;
    nomeCompleto: string;
    nascimento: string;
    parentesco: string;
    cpf: string | null;
    finalidades: string[];
  },
  db: TransacaoBanco
) {
  const [linha] = await db
    .insert(admissoesProcessosDependentes)
    .values(input)
    .returning({ id: admissoesProcessosDependentes.id });
  return linha ?? null;
}

/** Retorno nulo significa "nao existe NESTA empresa" — que e a unica coisa que o chamador pode saber. */
export async function atualizarDependenteRepository(
  input: {
    id: string;
    processoId: string;
    empresaId: string;
    nomeCompleto: string;
    nascimento: string;
    parentesco: string;
    cpf: string | null;
    finalidades: string[];
  },
  db: TransacaoBanco
) {
  const [linha] = await db
    .update(admissoesProcessosDependentes)
    .set({
      nomeCompleto: input.nomeCompleto,
      nascimento: input.nascimento,
      parentesco: input.parentesco,
      cpf: input.cpf,
      finalidades: input.finalidades
    })
    .where(and(eq(admissoesProcessosDependentes.id, input.id), doProcesso(input.processoId, input.empresaId)))
    .returning({ id: admissoesProcessosDependentes.id });
  return linha ?? null;
}

export async function excluirDependenteRepository(
  input: { id: string; processoId: string; empresaId: string },
  db: TransacaoBanco
) {
  const [linha] = await db
    .delete(admissoesProcessosDependentes)
    .where(and(eq(admissoesProcessosDependentes.id, input.id), doProcesso(input.processoId, input.empresaId)))
    .returning({ id: admissoesProcessosDependentes.id });
  return linha ?? null;
}
