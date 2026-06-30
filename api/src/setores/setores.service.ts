import { setorPayloadSchema } from "@padaria/shared/setores";
import { filtrarPorEmpresas } from "../auth/empresa.js";
import { listarSetoresRepository, salvarSetorRepository } from "./setores.repository.js";

export async function listarSetores(escopoDados: string[]) {
  return filtrarPorEmpresas(await listarSetoresRepository(), escopoDados);
}

export async function salvarSetor(id: string | null, body: unknown) {
  const dados = setorPayloadSchema.parse(body);
  return salvarSetorRepository({
    ...(id ? { id } : {}),
    empresaId: dados.empresaId,
    nome: dados.nome.trim(),
    areaId: dados.areaId ?? null,
    setorPaiId: dados.setorPaiId ?? null
  });
}
