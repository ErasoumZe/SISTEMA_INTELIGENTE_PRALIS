import { and, desc, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { admissoesConvites, perfisUsuarios } from "@padaria/db/schema";
import type { TransacaoBanco } from "../banco/conexao.js";
import { banco } from "../banco/conexao.js";

/**
 * ADM-003 V2 — acesso ao convite do candidato.
 *
 * Vive fora de `processos.*` de proposito: o gate de arquitetura veta as palavras deste dominio
 * naqueles arquivos, e a separacao e boa por si — o processo existe sem convite nenhum.
 */

const perfilCriador = alias(perfisUsuarios, "perfil_criador_convite");

function selecao() {
  return {
    id: admissoesConvites.id,
    expiraEm: admissoesConvites.expiraEm,
    criadoEm: admissoesConvites.criadoEm,
    criadoPorNome: perfilCriador.nome,
    avisoPrivacidadeVersao: admissoesConvites.avisoPrivacidadeVersao,
    primeiroAcessoEm: admissoesConvites.primeiroAcessoEm,
    ultimoAcessoEm: admissoesConvites.ultimoAcessoEm,
    revogadoEm: admissoesConvites.revogadoEm
  };
}

/** O convite VIGENTE do processo — o que ainda nao foi revogado. Expirado continua vigente. */
export async function obterConviteVigenteRepository(
  processoId: string,
  empresaId: string,
  db: TransacaoBanco | typeof banco = banco
) {
  const [linha] = await db
    .select(selecao())
    .from(admissoesConvites)
    .leftJoin(perfilCriador, eq(perfilCriador.usuarioId, admissoesConvites.criadoPor))
    .where(
      and(
        eq(admissoesConvites.processoId, processoId),
        eq(admissoesConvites.empresaId, empresaId),
        isNull(admissoesConvites.revogadoEm)
      )
    )
    .orderBy(desc(admissoesConvites.criadoEm))
    .limit(1);
  return linha ?? null;
}

export async function criarConviteRepository(
  input: {
    empresaId: string;
    processoId: string;
    tokenHash: string;
    expiraEm: Date;
    avisoPrivacidadeVersao: string;
    criadoPor: string;
  },
  db: TransacaoBanco
) {
  const [linha] = await db
    .insert(admissoesConvites)
    .values({
      empresaId: input.empresaId,
      processoId: input.processoId,
      tokenHash: input.tokenHash,
      expiraEm: input.expiraEm,
      avisoPrivacidadeVersao: input.avisoPrivacidadeVersao,
      criadoPor: input.criadoPor
    })
    .returning({ id: admissoesConvites.id, criadoEm: admissoesConvites.criadoEm });
  if (!linha) throw new Error("Convite de admissao nao criado");
  return linha;
}

/**
 * Revoga o vigente, se houver. Devolve o id revogado ou `null`.
 *
 * O `where` exige `revogado_em is null`: duas revogacoes simultaneas nao gravam duas vezes, e a
 * segunda simplesmente nao encontra linha.
 */
export async function revogarConviteVigenteRepository(
  input: { processoId: string; empresaId: string; revogadoPor: string },
  db: TransacaoBanco
) {
  const [linha] = await db
    .update(admissoesConvites)
    .set({ revogadoEm: new Date(), revogadoPor: input.revogadoPor })
    .where(
      and(
        eq(admissoesConvites.processoId, input.processoId),
        eq(admissoesConvites.empresaId, input.empresaId),
        isNull(admissoesConvites.revogadoEm)
      )
    )
    .returning({ id: admissoesConvites.id });
  return linha?.id ?? null;
}
