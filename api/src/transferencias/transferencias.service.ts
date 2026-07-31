import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import type {
  TransferenciaCriada,
  TransferenciaDetalheDto,
  TransferenciaDto,
  TransferenciaPayload,
  TransferenciasQuery
} from "@padaria/shared/transferencias";
import { executarEmTransacao } from "../banco/conexao.js";
import { buscarCaixaAbertoUsuarioRepository } from "../caixa/caixa.repository.js";
import { exigirPermissaoLancamento, obterCaixaParaLancamento } from "../lancamentos/lancamentos.dominio.js";
import {
  resolverComputarLancamento,
  validarEdicaoNoCaixaAberto,
  validarReferenciasTransferencia
} from "../lancamentos/lancamentos.dominio.js";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import {
  atualizarTransferenciaRepository,
  buscarTransferenciaDetalheRepository,
  criarTransferenciaRepository,
  listarTransferenciasRepository
} from "./transferencias.repository.js";

export function validarTransferencia(dados: TransferenciaPayload): void {
  if (dados.contaOrigemId === dados.contaDestinoId) throw new Error("Conta de destino deve ser diferente da origem");
}

function normalizarCargo(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .trim()
    .toLowerCase();
}

export function podeTransferirSemCaixa(perfil: PerfilUsuario) {
  if (perfil.role === "usuario_admin" || perfil.role === "admin") return true;
  const prefixosLiberados = ["tesouraria", "gerencia", "gerente", "financeiro", "diretor geral"];
  return perfil.cargos.some((cargo) =>
    prefixosLiberados.some((prefixo) => normalizarCargo(cargo.nome).startsWith(prefixo))
  );
}

export async function listarTransferencias(
  query: TransferenciasQuery,
  empresasPermitidasIds: string[] | null
): Promise<TransferenciaDto[]> {
  if (empresasPermitidasIds?.length === 0) return [];
  return listarTransferenciasRepository(query, empresasPermitidasIds);
}

export async function criarTransferencia(
  dados: TransferenciaPayload,
  perfil: PerfilUsuario
): Promise<TransferenciaCriada> {
  exigirPermissaoLancamento(perfil.permissoes, "transferencias_criar");
  validarTransferencia(dados);
  const computar = resolverComputarLancamento(dados.computar, perfil.permissoes);
  return executarEmTransacao(async (tx) => {
    const referenciaInvalida = await validarReferenciasTransferencia(dados, tx);
    if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);

    const transferenciaLivre = podeTransferirSemCaixa(perfil);
    const caixa = transferenciaLivre
      ? await buscarCaixaAbertoUsuarioRepository(dados.empresaId, perfil.usuarioId, tx)
      : await obterCaixaParaLancamento(dados.empresaId, perfil.usuarioId, tx);
    const envolveContaPdv =
      caixa && (dados.contaOrigemId === caixa.pdvContaId || dados.contaDestinoId === caixa.pdvContaId);
    if (!transferenciaLivre && !envolveContaPdv) {
      throw new Error("Transferencia do operador Caixa precisa envolver a conta do PDV aberto");
    }

    const transferencia = await criarTransferenciaRepository(
      dados,
      computar,
      perfil.usuarioId,
      envolveContaPdv ? caixa.id : null,
      tx
    );
    return { id: transferencia.id, computar };
  });
}

export async function obterTransferencia(
  transferenciaId: string,
  perfil: PerfilUsuario
): Promise<TransferenciaDetalheDto> {
  const transferencia = await buscarTransferenciaDetalheRepository(transferenciaId);
  if (!transferencia || !podeAcessarEmpresa(perfil, transferencia.empresaId)) {
    throw new Error("Registro nao encontrado");
  }
  return transferencia;
}

export async function atualizarTransferencia(
  transferenciaId: string,
  dados: TransferenciaPayload,
  perfil: PerfilUsuario
): Promise<TransferenciaCriada> {
  exigirPermissaoLancamento(perfil.permissoes, "transferencias_editar");
  validarTransferencia(dados);
  const computar = resolverComputarLancamento(dados.computar, perfil.permissoes);
  return executarEmTransacao(async (tx) => {
    const existente = await buscarTransferenciaDetalheRepository(transferenciaId, tx);
    const caixa = await validarEdicaoNoCaixaAberto(existente, dados, perfil, tx);
    if ((dados.maloteId ?? null) !== existente!.maloteId) {
      throw new Error("Nao e possivel alterar o malote na edicao");
    }
    const referenciaInvalida = await validarReferenciasTransferencia(dados, tx);
    if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);
    if (dados.contaOrigemId !== caixa.pdvContaId && dados.contaDestinoId !== caixa.pdvContaId) {
      throw new Error("Transferencia precisa envolver a conta do PDV aberto");
    }
    await atualizarTransferenciaRepository(transferenciaId, dados, computar, tx);
    return { id: transferenciaId, computar };
  });
}
