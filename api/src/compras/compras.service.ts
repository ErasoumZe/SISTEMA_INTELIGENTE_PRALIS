import type {
  ConferenciaEstoquePayload,
  ConferenciasEstoqueQuery,
  EstoqueProdutosQuery
} from "@padaria/shared/compras";
import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { proibido } from "../erros.js";
import {
  criarConferenciaEstoqueRepository,
  listarConferenciasEstoqueRepository,
  listarEstoqueProdutosRepository
} from "./compras.repository.js";

function validarEmpresa(perfil: PerfilUsuario, empresaId: string): void {
  if (!podeAcessarEmpresa(perfil, empresaId)) throw proibido("Empresa nao permitida", "FORBIDDEN_COMPANY");
}

export async function listarEstoqueProdutos(filtros: EstoqueProdutosQuery, perfil: PerfilUsuario) {
  validarEmpresa(perfil, filtros.empresaId);
  return listarEstoqueProdutosRepository(filtros);
}

export async function listarConferenciasEstoque(filtros: ConferenciasEstoqueQuery, perfil: PerfilUsuario) {
  validarEmpresa(perfil, filtros.empresaId);
  return listarConferenciasEstoqueRepository(filtros.empresaId);
}

export async function agendarConferenciaEstoque(payload: ConferenciaEstoquePayload, perfil: PerfilUsuario) {
  validarEmpresa(perfil, payload.empresaId);
  return criarConferenciaEstoqueRepository({ ...payload, criadoPor: perfil.usuarioId });
}
