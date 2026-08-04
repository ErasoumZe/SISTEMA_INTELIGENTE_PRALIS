import type { MaquininhaPayload } from "@padaria/shared/maquininhas";
import { listarMaquininhasRepository, salvarMaquininhaRepository } from "./maquininhas.repository.js";

export async function listarMaquininhas(empresaIds: string[], somenteAtivas: boolean) {
  const itens = await listarMaquininhasRepository(empresaIds);
  return somenteAtivas ? itens.filter((item) => item.ativo) : itens;
}

export function salvarMaquininha(id: string | null, dados: MaquininhaPayload) {
  return salvarMaquininhaRepository({
    ...(id ? { id } : {}),
    ...dados,
    numeroSerie: dados.numeroSerie.trim(),
    apelido: dados.apelido.trim()
  });
}
