import { and, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  admissoesConvites,
  admissoesProcessosFicha,
  admissoesProcessosHistorico,
  empresas,
  perfisUsuarios
} from "@padaria/db/schema";
import type { AcaoHistoricoProcesso } from "@padaria/shared";
import type { TransacaoBanco } from "../banco/conexao.js";
import { banco } from "../banco/conexao.js";

/**
 * ADM-003 V3 — acesso a ficha do candidato.
 *
 * Arquivo proprio, e nao `processos.*`: o gate de arquitetura veta as palavras deste dominio
 * naqueles arquivos, e a fronteira e boa por si — o processo existe sem ficha nenhuma.
 */

const perfilRevisor = alias(perfisUsuarios, "perfil_revisor_ficha");

const camposDaFicha = {
  nomeSocial: admissoesProcessosFicha.nomeSocial,
  nascimento: admissoesProcessosFicha.nascimento,
  sexo: admissoesProcessosFicha.sexo,
  estadoCivil: admissoesProcessosFicha.estadoCivil,
  racaCor: admissoesProcessosFicha.racaCor,
  nacionalidade: admissoesProcessosFicha.nacionalidade,
  naturalidade: admissoesProcessosFicha.naturalidade,
  nomeMae: admissoesProcessosFicha.nomeMae,
  nomePai: admissoesProcessosFicha.nomePai,
  cep: admissoesProcessosFicha.cep,
  logradouro: admissoesProcessosFicha.logradouro,
  numero: admissoesProcessosFicha.numero,
  complemento: admissoesProcessosFicha.complemento,
  bairro: admissoesProcessosFicha.bairro,
  municipio: admissoesProcessosFicha.municipio,
  uf: admissoesProcessosFicha.uf,
  telefone: admissoesProcessosFicha.telefone,
  email: admissoesProcessosFicha.email,
  // E5 (Questor) — campos comuns do candidato.
  grauInstrucao: admissoesProcessosFicha.grauInstrucao,
  naturalidadeUf: admissoesProcessosFicha.naturalidadeUf,
  municipioIbge: admissoesProcessosFicha.municipioIbge,
  nacionalidadeEspecifica: admissoesProcessosFicha.nacionalidadeEspecifica,
  primeiroEmprego: admissoesProcessosFicha.primeiroEmprego,
  recebeSeguroDesemprego: admissoesProcessosFicha.recebeSeguroDesemprego
};

function selecao() {
  return {
    id: admissoesProcessosFicha.id,
    situacao: admissoesProcessosFicha.situacao,
    versao: admissoesProcessosFicha.versao,
    semDependentes: admissoesProcessosFicha.semDependentes,
    avisoPrivacidadeVersao: admissoesProcessosFicha.avisoPrivacidadeVersao,
    avisoAceitoEm: admissoesProcessosFicha.avisoAceitoEm,
    enviadoEm: admissoesProcessosFicha.enviadoEm,
    revisadoEm: admissoesProcessosFicha.revisadoEm,
    revisadoPorNome: perfilRevisor.nome,
    revisaoPendencias: admissoesProcessosFicha.revisaoPendencias,
    ...camposDaFicha
  };
}

export type FichaLinha = Awaited<ReturnType<typeof obterFichaRepository>>;

export async function obterFichaRepository(
  processoId: string,
  empresaId: string,
  db: TransacaoBanco | typeof banco = banco
) {
  const [linha] = await db
    .select(selecao())
    .from(admissoesProcessosFicha)
    .leftJoin(perfilRevisor, eq(perfilRevisor.usuarioId, admissoesProcessosFicha.revisadoPor))
    .where(and(eq(admissoesProcessosFicha.processoId, processoId), eq(admissoesProcessosFicha.empresaId, empresaId)))
    .limit(1);
  return linha ?? null;
}

/** Trava a ficha para escrita. `no key update` pelo mesmo motivo do processo: a trilha e filha. */
export async function bloquearFichaRepository(processoId: string, empresaId: string, db: TransacaoBanco) {
  const [linha] = await db
    .select({
      id: admissoesProcessosFicha.id,
      situacao: admissoesProcessosFicha.situacao,
      versao: admissoesProcessosFicha.versao,
      // ADM-003 V4: quem trava a ficha para mexer em dependente precisa saber a declaracao
      // atual para decidir se ela muda. Ler de novo fora do lock leria outra coisa.
      semDependentes: admissoesProcessosFicha.semDependentes,
      enviadoEm: admissoesProcessosFicha.enviadoEm
    })
    .from(admissoesProcessosFicha)
    .where(and(eq(admissoesProcessosFicha.processoId, processoId), eq(admissoesProcessosFicha.empresaId, empresaId)))
    .limit(1)
    .for("no key update");
  return linha ?? null;
}

/** A ficha nasce vazia no primeiro acesso do candidato. `do nothing` porque duas abas sao uma so. */
export async function garantirFichaRepository(input: { processoId: string; empresaId: string }, db: TransacaoBanco) {
  await db
    .insert(admissoesProcessosFicha)
    .values({ processoId: input.processoId, empresaId: input.empresaId })
    .onConflictDoNothing();
}

/** Tipos das colunas: desde a E5 há booleanos (primeiro emprego, seguro-desemprego), não só texto. */
type CamposGravaveis = Partial<Pick<typeof admissoesProcessosFicha.$inferInsert, keyof typeof camposDaFicha>>;

/**
 * `versaoAtual` no WHERE: retorno nulo significa que alguem gravou no meio.
 *
 * A versao da FICHA e propria — nao e a do processo. A ficha muda muitas vezes enquanto o processo
 * fica parado, e usar a versao dele faria cada rascunho parecer alteracao do processo.
 */
export async function atualizarFichaRepository(
  input: {
    processoId: string;
    empresaId: string;
    versaoAtual: number;
    campos: CamposGravaveis;
    situacao?: string;
    enviadoEm?: Date | null;
    revisadoEm?: Date | null;
    revisadoPor?: string | null;
    revisaoPendencias?: string | null;
    // `null` e valor de verdade aqui, e nao ausencia: e como a declaracao volta a ser
    // "nao respondeu" quando o candidato apaga o ultimo dependente.
    semDependentes?: boolean | null;
    avisoPrivacidadeVersao?: string;
    avisoAceitoEm?: Date;
  },
  db: TransacaoBanco
) {
  const [linha] = await db
    .update(admissoesProcessosFicha)
    .set({
      ...input.campos,
      ...(input.situacao === undefined ? {} : { situacao: input.situacao }),
      ...(input.enviadoEm === undefined ? {} : { enviadoEm: input.enviadoEm }),
      ...(input.revisadoEm === undefined ? {} : { revisadoEm: input.revisadoEm }),
      ...(input.revisadoPor === undefined ? {} : { revisadoPor: input.revisadoPor }),
      ...(input.revisaoPendencias === undefined ? {} : { revisaoPendencias: input.revisaoPendencias }),
      ...(input.semDependentes === undefined ? {} : { semDependentes: input.semDependentes }),
      ...(input.avisoPrivacidadeVersao === undefined ? {} : { avisoPrivacidadeVersao: input.avisoPrivacidadeVersao }),
      ...(input.avisoAceitoEm === undefined ? {} : { avisoAceitoEm: input.avisoAceitoEm }),
      versao: input.versaoAtual + 1
    })
    .where(
      and(
        eq(admissoesProcessosFicha.processoId, input.processoId),
        eq(admissoesProcessosFicha.empresaId, input.empresaId),
        eq(admissoesProcessosFicha.versao, input.versaoAtual)
      )
    )
    .returning({ versao: admissoesProcessosFicha.versao });
  return linha ?? null;
}

/**
 * Evento com ator EXTERNO: `ator_usuario_id` fica nulo e `convite_id` aponta para o link que
 * autorizou o ato. O CHECK XOR do banco garante que sempre haja exatamente um autor.
 *
 * Vive aqui e nao em `processos.repository.ts` porque aquela funcao exige ator humano — e porque a
 * palavra deste dominio e proibida naqueles arquivos.
 */
export async function registrarEventoExternoRepository(
  input: {
    processoId: string;
    empresaId: string;
    versao: number;
    acao: AcaoHistoricoProcesso;
    conviteId: string;
  },
  db: TransacaoBanco
) {
  await db.insert(admissoesProcessosHistorico).values({
    processoId: input.processoId,
    empresaId: input.empresaId,
    versao: input.versao,
    acao: input.acao,
    conviteId: input.conviteId,
    camposAlterados: []
  });
}

/** O nome da empresa, para o candidato saber para quem esta preenchendo. */
export async function obterNomeDaEmpresaRepository(empresaId: string, db: TransacaoBanco | typeof banco = banco) {
  const [linha] = await db.select({ nome: empresas.nome }).from(empresas).where(eq(empresas.id, empresaId)).limit(1);
  return linha?.nome ?? null;
}

/**
 * Busca o convite pelo hash do token. SEM filtro de empresa e SEM filtro de revogacao, de proposito:
 * a empresa sai DAQUI, e o revogado precisa ser encontrado para virar 410 em vez de 404.
 */
export async function buscarConvitePorTokenHashRepository(
  tokenHash: string,
  db: TransacaoBanco | typeof banco = banco
) {
  const [linha] = await db
    .select({
      id: admissoesConvites.id,
      empresaId: admissoesConvites.empresaId,
      processoId: admissoesConvites.processoId,
      expiraEm: admissoesConvites.expiraEm,
      revogadoEm: admissoesConvites.revogadoEm,
      avisoPrivacidadeVersao: admissoesConvites.avisoPrivacidadeVersao,
      primeiroAcessoEm: admissoesConvites.primeiroAcessoEm
    })
    .from(admissoesConvites)
    .where(eq(admissoesConvites.tokenHash, tokenHash))
    .limit(1);
  return linha ?? null;
}

/**
 * Carimba o acesso do candidato.
 *
 * O primeiro so e gravado quando ainda nao existe — o CHECK do banco exige que ele preceda o
 * ultimo, e "primeiro" so e primeiro uma vez. A decisao vem do valor ja lido na busca por hash,
 * e nao de um `coalesce` em SQL cru: SQL cru e proibido em `api/src` pelo gate de arquitetura, e
 * driblar a regra com a forma tipada seria driblar a regra.
 */
export async function registrarAcessoConviteRepository(
  input: { conviteId: string; jaAcessou: boolean },
  db: TransacaoBanco
) {
  const agora = new Date();
  await db
    .update(admissoesConvites)
    .set({
      ...(input.jaAcessou ? {} : { primeiroAcessoEm: agora }),
      ultimoAcessoEm: agora
    })
    .where(eq(admissoesConvites.id, input.conviteId));
}
