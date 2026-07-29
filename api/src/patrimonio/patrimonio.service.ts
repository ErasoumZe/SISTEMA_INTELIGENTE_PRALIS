import type { DadosExternos } from "@padaria/shared/api";
import { grupoPatrimonioPayloadSchema, patrimonioItemPayloadSchema } from "@padaria/shared/patrimonio";
import { filtrarPorEmpresas } from "../auth/empresa.js";
import { naoEncontrado, proibido, erroValidacao } from "../erros.js";
import {
  excluirGrupoPatrimonioRepository,
  excluirPatrimonioItemRepository,
  listarGruposPatrimonioRepository,
  listarPatrimonioItensRepository,
  salvarGrupoPatrimonioRepository,
  salvarPatrimonioItemRepository
} from "./patrimonio.repository.js";

// Uma chamada so alimenta a tela inteira: grupos (com sigla) + itens ja com grupo e setor resolvidos.
export async function listarPatrimonio(escopoDados: string[]) {
  const [grupos, itens] = await Promise.all([listarGruposPatrimonioRepository(), listarPatrimonioItensRepository()]);
  return {
    gruposPatrimonio: filtrarPorEmpresas(grupos, escopoDados),
    patrimonioItens: filtrarPorEmpresas(itens, escopoDados)
  };
}

export async function salvarGrupoPatrimonio(id: string | null, body: DadosExternos) {
  const dados = grupoPatrimonioPayloadSchema.parse(body);
  return salvarGrupoPatrimonioRepository({ ...(id ? { id } : {}), ...dados });
}

export async function salvarPatrimonioItem(id: string | null, body: DadosExternos) {
  const dados = patrimonioItemPayloadSchema.parse(body);
  return salvarPatrimonioItemRepository({
    ...(id ? { id } : {}),
    empresaId: dados.empresaId,
    grupoPatrimonioId: dados.grupoPatrimonioId,
    setorId: dados.setorId ?? null,
    nome: dados.nome,
    marca: dados.marca ?? null
  });
}

export async function excluirGrupoPatrimonio(id: string, empresasPermitidasIds: string[] | null) {
  const resultado = await excluirGrupoPatrimonioRepository(id, empresasPermitidasIds);
  if (resultado.motivo === "nao_encontrado") throw naoEncontrado("Grupo de patrimonio nao encontrado");
  if (resultado.motivo === "empresa") throw proibido("Empresa nao permitida", "FORBIDDEN_COMPANY");
  if (resultado.motivo === "em_uso")
    throw erroValidacao("Grupo com itens vinculados nao pode ser excluido", "GRUPO_EM_USO");
}

export async function excluirPatrimonioItem(id: string, empresasPermitidasIds: string[] | null) {
  const resultado = await excluirPatrimonioItemRepository(id, empresasPermitidasIds);
  if (resultado.motivo === "nao_encontrado") throw naoEncontrado("Item de patrimonio nao encontrado");
  if (resultado.motivo === "empresa") throw proibido("Empresa nao permitida", "FORBIDDEN_COMPANY");
}
