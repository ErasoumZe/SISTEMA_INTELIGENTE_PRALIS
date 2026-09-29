import { and, asc, eq } from "drizzle-orm";
import { clinicasOcupacionais, clinicasOcupacionaisUnidades } from "@padaria/db/schema";
import type { ClinicaOcupacionalDto, ClinicaOcupacionalPayload, UnidadeClinicaOcupacionalPayload } from "@padaria/shared/clinicas";
import { banco, type ExecutorBanco } from "../banco/conexao.js";

export async function listarClinicasOcupacionaisRepository(
  empresaId: string,
  db: ExecutorBanco = banco
): Promise<ClinicaOcupacionalDto[]> {
  const [clinicas, unidades] = await Promise.all([
    db
      .select({
        id: clinicasOcupacionais.id,
        empresaId: clinicasOcupacionais.empresaId,
        nome: clinicasOcupacionais.nome,
        cnpj: clinicasOcupacionais.cnpj,
        email: clinicasOcupacionais.email,
        whatsapp: clinicasOcupacionais.whatsapp,
        contatoNome: clinicasOcupacionais.contatoNome,
        observacoes: clinicasOcupacionais.observacoes,
        ativo: clinicasOcupacionais.ativo
      })
      .from(clinicasOcupacionais)
      .where(eq(clinicasOcupacionais.empresaId, empresaId))
      .orderBy(asc(clinicasOcupacionais.nome)),
    db
      .select({
        id: clinicasOcupacionaisUnidades.id,
        clinicaId: clinicasOcupacionaisUnidades.clinicaId,
        nome: clinicasOcupacionaisUnidades.nome,
        email: clinicasOcupacionaisUnidades.email,
        whatsapp: clinicasOcupacionaisUnidades.whatsapp,
        cep: clinicasOcupacionaisUnidades.cep,
        logradouro: clinicasOcupacionaisUnidades.logradouro,
        numero: clinicasOcupacionaisUnidades.numero,
        complemento: clinicasOcupacionaisUnidades.complemento,
        bairro: clinicasOcupacionaisUnidades.bairro,
        municipio: clinicasOcupacionaisUnidades.municipio,
        uf: clinicasOcupacionaisUnidades.uf,
        ativo: clinicasOcupacionaisUnidades.ativo
      })
      .from(clinicasOcupacionaisUnidades)
      .where(eq(clinicasOcupacionaisUnidades.empresaId, empresaId))
      .orderBy(asc(clinicasOcupacionaisUnidades.nome))
  ]);
  const unidadesPorClinica = new Map<string, ClinicaOcupacionalDto["unidades"]>();
  for (const unidade of unidades) {
    const lista = unidadesPorClinica.get(unidade.clinicaId) ?? [];
    lista.push({ ...unidade });
    unidadesPorClinica.set(unidade.clinicaId, lista);
  }
  return clinicas.map((clinica) => ({ ...clinica, unidades: unidadesPorClinica.get(clinica.id) ?? [] }));
}

export async function salvarClinicaOcupacionalRepository(
  id: string | null,
  dados: ClinicaOcupacionalPayload,
  db: ExecutorBanco = banco
): Promise<{ id: string } | null> {
  if (id) {
    const [salva] = await db
      .update(clinicasOcupacionais)
      .set({ ...dados, atualizadoEm: new Date() })
      .where(and(eq(clinicasOcupacionais.id, id), eq(clinicasOcupacionais.empresaId, dados.empresaId)))
      .returning({ id: clinicasOcupacionais.id });
    return salva ?? null;
  }
  const [criada] = await db.insert(clinicasOcupacionais).values(dados).returning({ id: clinicasOcupacionais.id });
  return criada ?? null;
}

export async function salvarUnidadeClinicaRepository(
  clinicaId: string,
  unidadeId: string | null,
  dados: UnidadeClinicaOcupacionalPayload,
  db: ExecutorBanco = banco
): Promise<{ id: string } | null> {
  if (unidadeId) {
    const [salva] = await db
      .update(clinicasOcupacionaisUnidades)
      .set({ ...dados, clinicaId, atualizadoEm: new Date() })
      .where(
        and(
          eq(clinicasOcupacionaisUnidades.id, unidadeId),
          eq(clinicasOcupacionaisUnidades.clinicaId, clinicaId),
          eq(clinicasOcupacionaisUnidades.empresaId, dados.empresaId)
        )
      )
      .returning({ id: clinicasOcupacionaisUnidades.id });
    return salva ?? null;
  }
  const [criada] = await db
    .insert(clinicasOcupacionaisUnidades)
    .values({ ...dados, clinicaId })
    .returning({ id: clinicasOcupacionaisUnidades.id });
  return criada ?? null;
}

export async function clinicaExisteNaEmpresa(clinicaId: string, empresaId: string, db: ExecutorBanco = banco) {
  const [clinica] = await db
    .select({ id: clinicasOcupacionais.id })
    .from(clinicasOcupacionais)
    .where(and(eq(clinicasOcupacionais.id, clinicaId), eq(clinicasOcupacionais.empresaId, empresaId)));
  return Boolean(clinica);
}
