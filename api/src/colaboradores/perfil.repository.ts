import { and, asc, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  colaboradores,
  colaboradoresEventos,
  colaboradoresVinculos,
  perfisUsuarios
} from "@padaria/db/schema/cadastro";
import type { TransacaoBanco } from "../banco/conexao.js";
import { banco } from "../banco/conexao.js";

const perfilAtor = alias(perfisUsuarios, "perfil_ator_evento_colaborador");

export async function obterPerfilColaboradorRepository(id: string, empresaId: string) {
  const [linha] = await banco
    .select({
      id: colaboradores.id,
      nome: colaboradores.nome,
      cpf: colaboradores.cpf,
      criadoEm: colaboradores.criadoEm
    })
    .from(colaboradores)
    .where(and(eq(colaboradores.id, id), eq(colaboradores.empresaId, empresaId)))
    .limit(1);
  return linha ?? null;
}

export async function listarVinculosDoColaboradorRepository(colaboradorId: string, empresaId: string) {
  return banco
    .select({
      id: colaboradoresVinculos.id,
      matricula: colaboradoresVinculos.matricula,
      status: colaboradoresVinculos.status,
      admitidoEm: colaboradoresVinculos.admitidoEm,
      desligadoEm: colaboradoresVinculos.desligadoEm,
      motivoDesligamento: colaboradoresVinculos.motivoDesligamento,
      funcaoNome: colaboradoresVinculos.funcaoNome,
      funcaoCbo: colaboradoresVinculos.funcaoCbo,
      turnoRotulo: colaboradoresVinculos.turnoRotulo,
      turnoEtiqueta: colaboradoresVinculos.turnoEtiqueta,
      turnoHoraInicio: colaboradoresVinculos.turnoHoraInicio,
      turnoHoraFim: colaboradoresVinculos.turnoHoraFim,
      jornadaHorario: colaboradoresVinculos.jornadaHorario,
      criadoEm: colaboradoresVinculos.criadoEm
    })
    .from(colaboradoresVinculos)
    .where(and(eq(colaboradoresVinculos.colaboradorId, colaboradorId), eq(colaboradoresVinculos.empresaId, empresaId)))
    .orderBy(desc(colaboradoresVinculos.admitidoEm), desc(colaboradoresVinculos.criadoEm));
}

export async function listarEventosDoColaboradorRepository(colaboradorId: string, empresaId: string) {
  return banco
    .select({
      id: colaboradoresEventos.id,
      tipo: colaboradoresEventos.tipo,
      camposAlterados: colaboradoresEventos.camposAlterados,
      atorNome: perfilAtor.nome,
      ocorridoEm: colaboradoresEventos.ocorridoEm
    })
    .from(colaboradoresEventos)
    .leftJoin(perfilAtor, eq(perfilAtor.usuarioId, colaboradoresEventos.atorUsuarioId))
    .where(and(eq(colaboradoresEventos.colaboradorId, colaboradorId), eq(colaboradoresEventos.empresaId, empresaId)))
    .orderBy(desc(colaboradoresEventos.ocorridoEm), desc(colaboradoresEventos.id));
}

export async function bloquearColaboradorPerfilRepository(id: string, empresaId: string, tx: TransacaoBanco) {
  const [linha] = await tx
    .select({
      id: colaboradores.id,
      empresaId: colaboradores.empresaId,
      nome: colaboradores.nome,
      cpf: colaboradores.cpf
    })
    .from(colaboradores)
    .where(and(eq(colaboradores.id, id), eq(colaboradores.empresaId, empresaId)))
    .limit(1)
    .for("update");
  return linha ?? null;
}

export async function atualizarNomePerfilRepository(id: string, empresaId: string, nome: string, tx: TransacaoBanco) {
  const [linha] = await tx
    .update(colaboradores)
    .set({ nome })
    .where(and(eq(colaboradores.id, id), eq(colaboradores.empresaId, empresaId)))
    .returning({ id: colaboradores.id });
  return linha ?? null;
}

export async function registrarEdicaoPerfilRepository(
  input: { empresaId: string; colaboradorId: string; atorUsuarioId: string; camposAlterados: string[] },
  tx: TransacaoBanco
) {
  await tx.insert(colaboradoresEventos).values({
    empresaId: input.empresaId,
    colaboradorId: input.colaboradorId,
    tipo: "dados_cadastrais_atualizados",
    camposAlterados: input.camposAlterados,
    atorUsuarioId: input.atorUsuarioId
  });
}
