import type { DadosExternos } from "@padaria/shared/api";
import {
  clinicaOcupacionalPayloadSchema,
  clinicasOcupacionaisQuerySchema,
  unidadeClinicaOcupacionalPayloadSchema
} from "@padaria/shared/clinicas";
import { conflito, naoEncontrado } from "../erros.js";
import {
  clinicaExisteNaEmpresa,
  listarClinicasOcupacionaisRepository,
  salvarClinicaOcupacionalRepository,
  salvarUnidadeClinicaRepository
} from "./clinicas.repository.js";

const CONSTRAINTS_DUPLICIDADE = new Set([
  "clinicas_ocupacionais_empresa_nome_unico",
  "clinicas_ocupacionais_unidades_clinica_nome_unico"
]);

function ehDuplicidade(error: unknown): boolean {
  const atual = error as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  const causa = atual?.cause;
  return Boolean(
    (atual?.code === "23505" && CONSTRAINTS_DUPLICIDADE.has(atual.constraint ?? "")) ||
      (causa?.code === "23505" && CONSTRAINTS_DUPLICIDADE.has(causa.constraint ?? ""))
  );
}

export async function listarClinicasOcupacionais(query: DadosExternos) {
  const { empresaId } = clinicasOcupacionaisQuerySchema.parse(query);
  return listarClinicasOcupacionaisRepository(empresaId);
}

export async function salvarClinicaOcupacional(id: string | null, body: DadosExternos) {
  const dados = clinicaOcupacionalPayloadSchema.parse(body);
  try {
    const salva = await salvarClinicaOcupacionalRepository(id, dados);
    if (!salva) throw naoEncontrado("Clínica ocupacional não encontrada");
    return salva;
  } catch (error) {
    if (ehDuplicidade(error)) throw conflito("Já existe uma clínica com este nome nesta empresa.", "CLINICA_DUPLICADA");
    throw error;
  }
}

export async function salvarUnidadeClinica(clinicaId: string, unidadeId: string | null, body: DadosExternos) {
  const dados = unidadeClinicaOcupacionalPayloadSchema.parse(body);
  if (!(await clinicaExisteNaEmpresa(clinicaId, dados.empresaId))) {
    throw naoEncontrado("Clínica ocupacional não encontrada");
  }
  try {
    const salva = await salvarUnidadeClinicaRepository(clinicaId, unidadeId, dados);
    if (!salva) throw naoEncontrado("Unidade da clínica não encontrada");
    return salva;
  } catch (error) {
    if (ehDuplicidade(error)) throw conflito("Já existe uma unidade com este nome nesta clínica.", "UNIDADE_CLINICA_DUPLICADA");
    throw error;
  }
}
