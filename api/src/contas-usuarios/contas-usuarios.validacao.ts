import { and, eq } from "drizzle-orm";
import { usuariosEmpresas } from "@padaria/db/schema/cadastro";
import type { TransacaoBanco } from "../banco/conexao.js";
import { buscarContaEmpresaRepository } from "../contas/contas.repository.js";
import { erroValidacao, naoEncontrado } from "../erros.js";

export async function exigirContaDaEmpresa(contaId: string, empresaId: string, tx: TransacaoBanco) {
  const conta = await buscarContaEmpresaRepository(contaId, tx);
  if (!conta) throw naoEncontrado("Conta nao encontrada", "CONTA_NAO_ENCONTRADA");
  if (conta.empresaId !== empresaId) throw erroValidacao("Conta de outra empresa", "CONTA_EMPRESA_DIVERGENTE");
  return conta;
}

export async function exigirContaAlvoDaEmpresa(contaId: string, empresaId: string, tx: TransacaoBanco) {
  const conta = await buscarContaEmpresaRepository(contaId, tx);
  // Alvo fora do escopo se comporta como inexistente. Esta checagem precisa acontecer ANTES de o
  // cadastro tocar `contas_usuarios`: o UPDATE da conta pode afetar zero linhas, mas os vinculos
  // eram alterados em seguida usando apenas `conta_id`.
  if (!conta || conta.empresaId !== empresaId) {
    throw naoEncontrado("Conta nao encontrada", "CONTA_NAO_ENCONTRADA");
  }
  return conta;
}

export async function exigirUsuarioDaEmpresa(usuarioId: string, empresaId: string, tx: TransacaoBanco) {
  const [vinculo] = await tx
    .select({ usuarioId: usuariosEmpresas.usuarioId })
    .from(usuariosEmpresas)
    .where(and(eq(usuariosEmpresas.usuarioId, usuarioId), eq(usuariosEmpresas.empresaId, empresaId)))
    .limit(1)
    .for("key share");

  if (!vinculo) throw erroValidacao("Usuario de outra empresa", "USUARIO_EMPRESA_DIVERGENTE");
}
