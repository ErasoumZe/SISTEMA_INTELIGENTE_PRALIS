import { and, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  colaboradores,
  colaboradoresDadosBancarios,
  colaboradoresDadosPessoais,
  colaboradoresEnderecos,
  colaboradoresEventos,
  colaboradoresOnboarding,
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

export async function obterDadosCadastraisDoColaboradorRepository(colaboradorId: string, empresaId: string) {
  const [dadosPessoais, enderecoContato, dadosBancarios] = await Promise.all([
    banco
      .select()
      .from(colaboradoresDadosPessoais)
      .where(
        and(
          eq(colaboradoresDadosPessoais.colaboradorId, colaboradorId),
          eq(colaboradoresDadosPessoais.empresaId, empresaId)
        )
      )
      .limit(1),
    banco
      .select()
      .from(colaboradoresEnderecos)
      .where(
        and(eq(colaboradoresEnderecos.colaboradorId, colaboradorId), eq(colaboradoresEnderecos.empresaId, empresaId))
      )
      .limit(1),
    banco
      .select()
      .from(colaboradoresDadosBancarios)
      .where(
        and(
          eq(colaboradoresDadosBancarios.colaboradorId, colaboradorId),
          eq(colaboradoresDadosBancarios.empresaId, empresaId)
        )
      )
      .limit(1)
  ]);
  return {
    dadosPessoais: dadosPessoais[0] ?? null,
    enderecoContato: enderecoContato[0] ?? null,
    dadosBancarios: dadosBancarios[0] ?? null
  };
}

export async function obterOnboardingDoVinculoRepository(vinculoId: string, empresaId: string) {
  const [linha] = await banco
    .select({
      etapa: colaboradoresOnboarding.etapa,
      versao: colaboradoresOnboarding.versao,
      atualizadoEm: colaboradoresOnboarding.atualizadoEm
    })
    .from(colaboradoresOnboarding)
    .where(and(eq(colaboradoresOnboarding.vinculoId, vinculoId), eq(colaboradoresOnboarding.empresaId, empresaId)))
    .limit(1);
  return linha ?? null;
}

export async function bloquearColaboradorPerfilRepository(id: string, empresaId: string, tx: TransacaoBanco) {
  const [linha] = await tx
    .select({ id: colaboradores.id, nome: colaboradores.nome })
    .from(colaboradores)
    .where(and(eq(colaboradores.id, id), eq(colaboradores.empresaId, empresaId)))
    .limit(1)
    .for("no key update");
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

export async function salvarDadosPessoaisRepository(
  input: { empresaId: string; colaboradorId: string; dados: Record<string, string | null | undefined> },
  tx: TransacaoBanco
) {
  await tx
    .insert(colaboradoresDadosPessoais)
    .values({ empresaId: input.empresaId, colaboradorId: input.colaboradorId, ...input.dados })
    .onConflictDoUpdate({
      target: colaboradoresDadosPessoais.colaboradorId,
      set: { ...input.dados, atualizadoEm: new Date() }
    });
}

export async function salvarEnderecoContatoRepository(
  input: { empresaId: string; colaboradorId: string; dados: Record<string, string | null | undefined> },
  tx: TransacaoBanco
) {
  await tx
    .insert(colaboradoresEnderecos)
    .values({ empresaId: input.empresaId, colaboradorId: input.colaboradorId, ...input.dados })
    .onConflictDoUpdate({
      target: colaboradoresEnderecos.colaboradorId,
      set: { ...input.dados, atualizadoEm: new Date() }
    });
}

export async function salvarDadosBancariosRepository(
  input: { empresaId: string; colaboradorId: string; dados: Record<string, string | null | undefined> },
  tx: TransacaoBanco
) {
  await tx
    .insert(colaboradoresDadosBancarios)
    .values({ empresaId: input.empresaId, colaboradorId: input.colaboradorId, ...input.dados })
    .onConflictDoUpdate({
      target: colaboradoresDadosBancarios.colaboradorId,
      set: { ...input.dados, atualizadoEm: new Date() }
    });
}

export async function criarOnboardingDoVinculoRepository(
  input: { empresaId: string; vinculoId: string },
  tx: TransacaoBanco
) {
  await tx
    .insert(colaboradoresOnboarding)
    .values(input)
    .onConflictDoNothing({ target: colaboradoresOnboarding.vinculoId });
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
