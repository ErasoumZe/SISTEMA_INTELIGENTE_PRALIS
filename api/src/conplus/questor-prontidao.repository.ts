import { and, asc, eq } from "drizzle-orm";
import { empresas } from "@padaria/db/schema";
import {
  admissoesProcessos,
  admissoesProcessosDependentes,
  admissoesProcessosFicha,
  admissoesProcessosInternos
} from "@padaria/db/schema/admissoes";
import type { SnapshotAdmissaoPralis } from "@padaria/shared/conplus";
import { banco } from "../banco/conexao.js";

/**
 * Leitura dos dados de UM processo para a prévia de prontidão Questor. Só SELECT, sempre com
 * `empresa_id` do ator: processo de outra empresa responde como inexistente.
 *
 * As colunas são escolhidas uma a uma — exatamente as do snapshot da E1 — para que nenhuma coluna
 * nova da ficha passe a viajar por aqui sem alguém decidir.
 */
export async function lerSnapshotQuestorRepository(
  processoId: string,
  empresaId: string
): Promise<SnapshotAdmissaoPralis | null> {
  const [processo] = await banco
    .select({ nomeCompleto: admissoesProcessos.nomeCompleto, cpf: admissoesProcessos.cpf, cnpj: empresas.cnpj })
    .from(admissoesProcessos)
    .innerJoin(empresas, eq(empresas.id, admissoesProcessos.empresaId))
    .where(and(eq(admissoesProcessos.id, processoId), eq(admissoesProcessos.empresaId, empresaId)))
    .limit(1);
  if (!processo) return null;

  const [internos] = await banco
    .select({
      dataAdmissao: admissoesProcessosInternos.dataAdmissao,
      ctpsNumero: admissoesProcessosInternos.ctpsNumero,
      ctpsSerie: admissoesProcessosInternos.ctpsSerie,
      ctpsUf: admissoesProcessosInternos.ctpsUf,
      pisPasepNit: admissoesProcessosInternos.pisPasepNit
    })
    .from(admissoesProcessosInternos)
    .where(
      and(eq(admissoesProcessosInternos.processoId, processoId), eq(admissoesProcessosInternos.empresaId, empresaId))
    )
    .limit(1);

  const [ficha] = await banco
    .select({
      nomeSocial: admissoesProcessosFicha.nomeSocial,
      nascimento: admissoesProcessosFicha.nascimento,
      sexo: admissoesProcessosFicha.sexo,
      estadoCivil: admissoesProcessosFicha.estadoCivil,
      racaCor: admissoesProcessosFicha.racaCor,
      grauInstrucao: admissoesProcessosFicha.grauInstrucao,
      nacionalidade: admissoesProcessosFicha.nacionalidade,
      nomeMae: admissoesProcessosFicha.nomeMae,
      nomePai: admissoesProcessosFicha.nomePai,
      cep: admissoesProcessosFicha.cep,
      logradouro: admissoesProcessosFicha.logradouro,
      numero: admissoesProcessosFicha.numero,
      complemento: admissoesProcessosFicha.complemento,
      bairro: admissoesProcessosFicha.bairro,
      uf: admissoesProcessosFicha.uf,
      email: admissoesProcessosFicha.email,
      rgNumero: admissoesProcessosFicha.rgNumero,
      rgUf: admissoesProcessosFicha.rgUf,
      rgEmissao: admissoesProcessosFicha.rgEmissao,
      tituloEleitor: admissoesProcessosFicha.tituloEleitor,
      tituloZona: admissoesProcessosFicha.tituloZona,
      tituloSecao: admissoesProcessosFicha.tituloSecao,
      // E5 — campos comuns do candidato.
      naturalidadeUf: admissoesProcessosFicha.naturalidadeUf,
      municipioIbge: admissoesProcessosFicha.municipioIbge,
      nacionalidadeEspecifica: admissoesProcessosFicha.nacionalidadeEspecifica,
      primeiroEmprego: admissoesProcessosFicha.primeiroEmprego,
      recebeSeguroDesemprego: admissoesProcessosFicha.recebeSeguroDesemprego
    })
    .from(admissoesProcessosFicha)
    .where(and(eq(admissoesProcessosFicha.processoId, processoId), eq(admissoesProcessosFicha.empresaId, empresaId)))
    .limit(1);

  const dependentes = await banco
    .select({
      nomeCompleto: admissoesProcessosDependentes.nomeCompleto,
      nascimento: admissoesProcessosDependentes.nascimento,
      parentesco: admissoesProcessosDependentes.parentesco,
      cpf: admissoesProcessosDependentes.cpf,
      sexo: admissoesProcessosDependentes.sexo,
      estadoCivil: admissoesProcessosDependentes.estadoCivil,
      grauInstrucao: admissoesProcessosDependentes.grauInstrucao,
      nacionalidade: admissoesProcessosDependentes.nacionalidade
    })
    .from(admissoesProcessosDependentes)
    .where(
      and(
        eq(admissoesProcessosDependentes.processoId, processoId),
        eq(admissoesProcessosDependentes.empresaId, empresaId)
      )
    )
    // Ordem estável: a posição do dependente aparece na prévia ("dependente 1, 2…").
    .orderBy(asc(admissoesProcessosDependentes.criadoEm), asc(admissoesProcessosDependentes.id));

  return {
    empresa: { cnpj: processo.cnpj },
    processo: { nomeCompleto: processo.nomeCompleto, cpf: processo.cpf },
    internos: internos ?? null,
    ficha: ficha ?? null,
    dependentes,
    // E5 — só os campos comuns; os de saúde não são coletados (Q11).
    e5: {
      titular: ficha
        ? {
            naturalidadeUf: ficha.naturalidadeUf,
            municipioIbge: ficha.municipioIbge,
            nacionalidadeEspecifica: ficha.nacionalidadeEspecifica,
            primeiroEmprego: ficha.primeiroEmprego,
            recebeSeguroDesemprego: ficha.recebeSeguroDesemprego
          }
        : null,
      dependentes: dependentes.map((dependente) => ({
        sexo: dependente.sexo,
        estadoCivil: dependente.estadoCivil,
        grauInstrucao: dependente.grauInstrucao,
        nacionalidade: dependente.nacionalidade
      }))
    }
  };
}
