import type { DadosExternos } from "@padaria/shared/api";
import type { PerfilUsuario } from "@padaria/shared";
import { z } from "zod";
import { executarEmTransacao } from "../banco/conexao.js";
import { naoEncontrado } from "../erros.js";
import { atorDoPerfil, empresaDoAtor } from "../admissoes/ator.js";
import {
  atualizarNomePerfilRepository,
  bloquearColaboradorPerfilRepository,
  listarEventosDoColaboradorRepository,
  listarVinculosDoColaboradorRepository,
  obterPerfilColaboradorRepository,
  registrarEdicaoPerfilRepository
} from "./perfil.repository.js";

const editarNomeSchema = z.object({ nome: z.string().trim().min(1).max(180) });

function colaboradorNaoEncontrado(): never {
  throw naoEncontrado("Colaborador nao encontrado", "COLLABORATOR_NOT_FOUND");
}

export async function obterPerfilColaborador(id: string, perfil?: PerfilUsuario) {
  const empresaId = empresaDoAtor(perfil);
  const colaborador = await obterPerfilColaboradorRepository(id, empresaId);
  if (!colaborador) colaboradorNaoEncontrado();
  const [vinculos, eventos] = await Promise.all([
    listarVinculosDoColaboradorRepository(id, empresaId),
    listarEventosDoColaboradorRepository(id, empresaId)
  ]);
  const vinculoAtivo = vinculos.find((vinculo) => vinculo.status === "ativo") ?? null;
  return {
    ...colaborador,
    situacao: vinculoAtivo ? "ativo" : "inativo",
    vinculoAtivoId: vinculoAtivo?.id ?? null,
    vinculos: vinculos.map((vinculo) => ({
      ...vinculo,
      desligadoEm: vinculo.desligadoEm?.toISOString() ?? null,
      criadoEm: vinculo.criadoEm.toISOString()
    })),
    eventos: eventos.map((evento) => ({ ...evento, ocorridoEm: evento.ocorridoEm.toISOString() }))
  };
}

/** A primeira edicao disponivel no perfil: nome civil. CPF continua protegido pela conciliacao. */
export async function editarNomeDoColaborador(id: string, body: DadosExternos, perfil?: PerfilUsuario) {
  const empresaId = empresaDoAtor(perfil);
  const ator = atorDoPerfil(perfil);
  const dados = editarNomeSchema.parse(body);
  return executarEmTransacao(async (tx) => {
    const alvo = await bloquearColaboradorPerfilRepository(id, empresaId, tx);
    if (!alvo) colaboradorNaoEncontrado();
    if (alvo.nome === dados.nome) return;
    const atualizado = await atualizarNomePerfilRepository(id, empresaId, dados.nome, tx);
    if (!atualizado) colaboradorNaoEncontrado();
    await registrarEdicaoPerfilRepository(
      { empresaId, colaboradorId: id, atorUsuarioId: ator, camposAlterados: ["nome"] },
      tx
    );
  });
}
