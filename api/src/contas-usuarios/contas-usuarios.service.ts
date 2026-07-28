import type { ContaUsuarioPayload } from "@padaria/shared/contas-usuarios";
import { erroValidacao, naoEncontrado, proibido } from "../erros.js";
import { buscarContaEmpresaRepository } from "../contas/contas.repository.js";
import {
  buscarContaUsuarioRepository,
  criarContaUsuarioRepository,
  excluirContaUsuarioRepository,
  existeVinculoRepository,
  listarContasUsuariosRepository
} from "./contas-usuarios.repository.js";

export async function listarContasUsuarios(filtro: {
  empresasPermitidas: string[];
  contaId?: string;
  usuarioId?: string;
}) {
  return listarContasUsuariosRepository(filtro);
}

export async function criarContaUsuario(payload: ContaUsuarioPayload) {
  // A conta tem de existir e pertencer a MESMA empresa do vinculo — evita ligar usuario a conta de
  // outra empresa (o FK garante existencia, nao a empresa).
  const conta = await buscarContaEmpresaRepository(payload.contaId);
  if (!conta) throw naoEncontrado("Conta nao encontrada", "CONTA_NAO_ENCONTRADA");
  if (conta.empresaId !== payload.empresaId) throw erroValidacao("Conta de outra empresa", "CONTA_EMPRESA_DIVERGENTE");

  const existente = await existeVinculoRepository(payload.contaId, payload.usuarioId);
  if (existente) throw erroValidacao("Usuario ja vinculado a esta conta", "VINCULO_DUPLICADO");

  const criado = await criarContaUsuarioRepository(payload);
  return { id: criado?.id ?? "contas-usuarios", ...payload };
}

// Retorna a empresa do vinculo para o controller validar o escopo antes de excluir; null se nao existe.
export async function excluirContaUsuario(id: string, empresasPermitidas: string[]) {
  const vinculo = await buscarContaUsuarioRepository(id);
  if (!vinculo) throw naoEncontrado("Vinculo nao encontrado", "VINCULO_NAO_ENCONTRADO");
  if (!empresasPermitidas.includes(vinculo.empresaId)) throw proibido("Empresa nao permitida", "FORBIDDEN_COMPANY");
  await excluirContaUsuarioRepository(id);
}
