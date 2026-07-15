import { createHash, randomInt } from "node:crypto";
import type {
  AutorizadorCaixa,
  SolicitacaoAutorizacaoCaixa,
  SolicitarAutorizacaoCaixaPayload
} from "@padaria/shared/caixa";
import { temPermissao, type PerfilUsuario } from "@padaria/shared/autenticacao";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { buscarPerfilUsuario } from "../auth/perfil.service.js";
import { erroValidacao, naoEncontrado, proibido } from "../erros.js";
import { buscarCaixaPorIdRepository } from "./caixa.repository.js";
import {
  buscarAutorizacaoPorIdRepository,
  criarAutorizacaoCaixaRepository,
  definirTokenAutorizacaoRepository,
  listarAutorizacoesPendentesRepository,
  listarUsuariosDaEmpresaRepository
} from "./autorizacoes.repository.js";

const VALIDADE_TOKEN_MS = 15 * 60 * 1000; // 15 minutos (uso unico)

// Token curto (6 digitos, informado verbalmente). Guardamos APENAS o SHA-256 — nunca o token em claro.
export function hashTokenAutorizacao(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

function gerarToken(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function iso(data: Date | string | null): string | null {
  return data ? new Date(data).toISOString() : null;
}

async function garantirAutorizador(usuarioId: string, empresaId: string): Promise<PerfilUsuario> {
  const perfil = await buscarPerfilUsuario(usuarioId);
  if (!perfil || !(perfil.empresaIds ?? []).includes(empresaId)) {
    throw erroValidacao("Autorizador invalido para esta empresa", "AUTORIZADOR_INVALIDO");
  }
  if (!temPermissao(perfil.permissoes, "caixa_alterar_horario")) {
    throw erroValidacao("Autorizador nao tem permissao para alterar horario", "AUTORIZADOR_SEM_PERMISSAO");
  }
  return perfil;
}

// Operador (sem a permissao) solicita a alteracao, escolhendo um autorizador com caixa_alterar_horario.
export async function solicitarAutorizacaoCaixa(
  caixaId: string,
  payload: SolicitarAutorizacaoCaixaPayload,
  perfil: PerfilUsuario
): Promise<{ id: string }> {
  const caixa = await buscarCaixaPorIdRepository(caixaId);
  if (!caixa || !podeAcessarEmpresa(perfil, caixa.empresaId)) throw naoEncontrado("Caixa nao encontrado");
  if (caixa.status !== "aberto") throw erroValidacao("Caixa ja fechado");
  await garantirAutorizador(payload.autorizadorId, caixa.empresaId);
  return criarAutorizacaoCaixaRepository({
    caixaId,
    solicitanteId: perfil.usuarioId,
    autorizadorId: payload.autorizadorId,
    observacao: payload.observacao?.trim() || null
  });
}

// Fila do autorizador: solicitacoes pendentes onde ele e o autorizador escolhido.
export async function listarAutorizacoesPendentes(
  empresaId: string,
  perfil: PerfilUsuario
): Promise<SolicitacaoAutorizacaoCaixa[]> {
  if (!podeAcessarEmpresa(perfil, empresaId)) throw proibido("Empresa nao permitida");
  const linhas = await listarAutorizacoesPendentesRepository(perfil.usuarioId, empresaId);
  return linhas.map((linha) => ({
    id: linha.id,
    caixaId: linha.caixaId,
    solicitanteId: linha.solicitanteId,
    solicitanteNome: linha.solicitanteNome ?? "Operador",
    observacao: linha.observacao,
    tokenGerado: linha.tokenHash !== null,
    expiraEm: iso(linha.expiraEm),
    criadoEm: iso(linha.criadoEm) ?? ""
  }));
}

// Autorizador gera o token: retorna o token em claro UMA vez; persiste so o hash + expira em 15 min.
export async function gerarTokenAutorizacao(
  autorizacaoId: string,
  perfil: PerfilUsuario
): Promise<{ token: string; expiraEm: string }> {
  const autorizacao = await buscarAutorizacaoPorIdRepository(autorizacaoId);
  if (!autorizacao || !podeAcessarEmpresa(perfil, autorizacao.empresaId))
    throw naoEncontrado("Solicitacao nao encontrada");
  if (autorizacao.autorizadorId !== perfil.usuarioId) throw proibido("Voce nao e o autorizador desta solicitacao");
  if (autorizacao.status !== "pendente") throw erroValidacao("Solicitacao nao esta pendente");
  const token = gerarToken();
  const expiraEm = new Date(Date.now() + VALIDADE_TOKEN_MS);
  await definirTokenAutorizacaoRepository({ id: autorizacao.id, tokenHash: hashTokenAutorizacao(token), expiraEm });
  return { token, expiraEm: expiraEm.toISOString() };
}

// Usuarios da empresa que tem caixa_alterar_horario — alimenta o seletor de autorizador do operador.
export async function listarAutorizadoresCaixa(empresaId: string, perfil: PerfilUsuario): Promise<AutorizadorCaixa[]> {
  if (!podeAcessarEmpresa(perfil, empresaId)) throw proibido("Empresa nao permitida");
  const usuarios = await listarUsuariosDaEmpresaRepository(empresaId);
  const autorizadores: AutorizadorCaixa[] = [];
  for (const usuario of usuarios) {
    const perfilUsuario = await buscarPerfilUsuario(usuario.usuarioId);
    if (perfilUsuario && temPermissao(perfilUsuario.permissoes, "caixa_alterar_horario")) {
      autorizadores.push({ usuarioId: usuario.usuarioId, nome: usuario.nome });
    }
  }
  return autorizadores;
}
