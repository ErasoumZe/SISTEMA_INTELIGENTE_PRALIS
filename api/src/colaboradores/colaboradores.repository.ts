import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  cargos,
  colaboradores,
  colaboradoresCargos,
  colaboradoresFaltasJustificadas,
  colaboradoresJornadas,
  setores
} from "@padaria/db/schema/cadastro";
import { banco, executarEmTransacao, type ExecutorBanco } from "../banco/conexao.js";
import { filtrarOrigemEntidade, jaImportado, type FiltroOrigemEntidade, type ModoImportacaoEntidade, type ResultadoImportacaoEntidade } from "../utils.js";

export async function listarColaboradoresRepository() {
  return banco
    .select({
      id: colaboradores.id,
      empresaId: colaboradores.empresaId,
      nome: colaboradores.nome,
      cpf: colaboradores.cpf,
      setorId: colaboradores.setorId,
      usuarioId: colaboradores.usuarioId
    })
    .from(colaboradores)
    .orderBy(asc(colaboradores.nome));
}

export async function salvarColaboradorRepository(
  input: { id?: string; empresaId: string; nome: string; cpf: string | null; setorId?: string | null },
  db: ExecutorBanco = banco
) {
  if (input.id) {
    await db
      .update(colaboradores)
      .set({ nome: input.nome, cpf: input.cpf, setorId: input.setorId ?? null })
      .where(and(eq(colaboradores.id, input.id), eq(colaboradores.empresaId, input.empresaId)));
    return { id: input.id, empresaId: input.empresaId, nome: input.nome, cpf: input.cpf, setorId: input.setorId ?? null };
  }
  const [criado] = await db
    .insert(colaboradores)
    .values({ empresaId: input.empresaId, nome: input.nome, cpf: input.cpf, setorId: input.setorId ?? null })
    .returning({ id: colaboradores.id });
  return criado;
}

export async function salvarCargoColaboradorRepository(
  input: {
    empresaId: string;
    colaboradorId: string;
    setorId: string | null;
    cargoId: string;
    remuneracaoMinuto: number;
    dataInicio: string;
    ativo: boolean;
  },
  db: ExecutorBanco = banco
) {
  const [criado] = await db
    .insert(colaboradoresCargos)
    .values({
      empresaId: input.empresaId,
      colaboradorId: input.colaboradorId,
      setorId: input.setorId,
      cargoId: input.cargoId,
      remuneracaoMinuto: String(input.remuneracaoMinuto),
      dataInicio: input.dataInicio,
      ativo: input.ativo
    })
    .returning({ id: colaboradoresCargos.id });
  return criado;
}

export async function listarCargosRepository() {
  return banco
    .select({ id: cargos.id, empresaId: cargos.empresaId, nome: cargos.nome })
    .from(cargos)
    .orderBy(asc(cargos.nome));
}

export async function criarCargoRepository(input: { empresaId: string; nome: string }) {
  const [cargo] = await banco
    .insert(cargos)
    .values({ empresaId: input.empresaId, nome: input.nome })
    .onConflictDoUpdate({
      target: [cargos.empresaId, cargos.nome],
      set: { nome: input.nome, atualizadoEm: new Date() }
    })
    .returning({ id: cargos.id });
  return cargo;
}

export async function atualizarCargoRepository(input: { id: string; empresaId: string; nome: string }) {
  await banco
    .update(cargos)
    .set({ nome: input.nome, atualizadoEm: new Date() })
    .where(and(eq(cargos.id, input.id), eq(cargos.empresaId, input.empresaId)));
  return { id: input.id, empresaId: input.empresaId, nome: input.nome };
}

export async function listarCargosColaboradorRepository(colaboradorId: string) {
  return banco
    .select({
      id: colaboradoresCargos.id,
      empresaId: colaboradoresCargos.empresaId,
      colaboradorId: colaboradoresCargos.colaboradorId,
      setorId: colaboradoresCargos.setorId,
      cargoId: colaboradoresCargos.cargoId,
      cargoNome: cargos.nome,
      remuneracaoMinuto: colaboradoresCargos.remuneracaoMinuto,
      dataInicio: colaboradoresCargos.dataInicio,
      ativo: colaboradoresCargos.ativo
    })
    .from(colaboradoresCargos)
    .innerJoin(cargos, eq(cargos.id, colaboradoresCargos.cargoId))
    .where(eq(colaboradoresCargos.colaboradorId, colaboradorId))
    .orderBy(desc(colaboradoresCargos.ativo), desc(colaboradoresCargos.dataInicio), asc(cargos.nome));
}

export async function existeColaboradorNaEmpresaRepository(
  colaboradorId: string,
  empresaId: string,
  db: ExecutorBanco = banco
) {
  const [colaborador] = await db
    .select({ id: colaboradores.id })
    .from(colaboradores)
    .where(and(eq(colaboradores.id, colaboradorId), eq(colaboradores.empresaId, empresaId)))
    .limit(1);
  return Boolean(colaborador);
}

export async function existeCargoNaEmpresaRepository(cargoId: string, empresaId: string, db: ExecutorBanco = banco) {
  const [cargo] = await db
    .select({ id: cargos.id })
    .from(cargos)
    .where(and(eq(cargos.id, cargoId), eq(cargos.empresaId, empresaId)))
    .limit(1);
  return Boolean(cargo);
}

export async function existeSetorNaEmpresaRepository(setorId: string, empresaId: string, db: ExecutorBanco = banco) {
  const [setor] = await db
    .select({ id: setores.id })
    .from(setores)
    .where(and(eq(setores.id, setorId), eq(setores.empresaId, empresaId)))
    .limit(1);
  return Boolean(setor);
}

export async function existeCargoAtivoColaboradorRepository(
  input: { colaboradorCargoId: string; colaboradorId: string; empresaId: string },
  db: ExecutorBanco = banco
) {
  const [cargo] = await db
    .select({ id: colaboradoresCargos.id })
    .from(colaboradoresCargos)
    .where(
      and(
        eq(colaboradoresCargos.id, input.colaboradorCargoId),
        eq(colaboradoresCargos.colaboradorId, input.colaboradorId),
        eq(colaboradoresCargos.empresaId, input.empresaId),
        eq(colaboradoresCargos.ativo, true)
      )
    )
    .limit(1);
  return Boolean(cargo);
}

export async function criarCargoColaboradorRepository(input: {
  empresaId: string;
  colaboradorId: string;
  setorId: string | null;
  cargoId: string;
  remuneracaoMinuto: number;
  dataInicio: string;
  ativo: boolean;
}) {
  const [criado] = await banco
    .insert(colaboradoresCargos)
    .values({
      empresaId: input.empresaId,
      colaboradorId: input.colaboradorId,
      setorId: input.setorId,
      cargoId: input.cargoId,
      remuneracaoMinuto: String(input.remuneracaoMinuto),
      dataInicio: input.dataInicio,
      ativo: input.ativo
    })
    .returning({ id: colaboradoresCargos.id });
  return criado;
}

export async function colaboradorTemUsuarioRepository(colaboradorId: string) {
  const [colaborador] = await banco
    .select({ usuarioId: colaboradores.usuarioId })
    .from(colaboradores)
    .where(eq(colaboradores.id, colaboradorId))
    .limit(1);
  return Boolean(colaborador?.usuarioId);
}

export async function contarCargosAtivosColaboradorRepository(colaboradorId: string, db: ExecutorBanco = banco) {
  const cargosAtivos = await db
    .select({ id: colaboradoresCargos.id })
    .from(colaboradoresCargos)
    .where(and(eq(colaboradoresCargos.colaboradorId, colaboradorId), eq(colaboradoresCargos.ativo, true)));
  return cargosAtivos.length;
}

export async function atualizarStatusCargoColaboradorRepository(input: {
  colaboradorId: string;
  cargoColaboradorId: string;
  empresaId: string;
  ativo: boolean;
}) {
  await banco
    .update(colaboradoresCargos)
    .set({ ativo: input.ativo, atualizadoEm: new Date() })
    .where(
      and(
        eq(colaboradoresCargos.id, input.cargoColaboradorId),
        eq(colaboradoresCargos.colaboradorId, input.colaboradorId),
        eq(colaboradoresCargos.empresaId, input.empresaId)
      )
    );
  return { id: input.cargoColaboradorId, ativo: input.ativo };
}

export async function listarJornadasColaboradorRepository(colaboradorId: string) {
  return banco
    .select({
      id: colaboradoresJornadas.id,
      empresaId: colaboradoresJornadas.empresaId,
      colaboradorId: colaboradoresJornadas.colaboradorId,
      diaDaSemana: colaboradoresJornadas.diaDaSemana,
      cargaHorariaDiariaEmMinutos: colaboradoresJornadas.cargaHorariaDiariaEmMinutos,
      intervaloMinutos: colaboradoresJornadas.intervaloMinutos,
      colaboradorCargoId: colaboradoresJornadas.colaboradorCargoId,
      horaEntrada: colaboradoresJornadas.horaEntrada,
      dataInicio: colaboradoresJornadas.dataInicio,
      ativo: colaboradoresJornadas.ativo,
      cargoNome: cargos.nome
    })
    .from(colaboradoresJornadas)
    .leftJoin(colaboradoresCargos, eq(colaboradoresCargos.id, colaboradoresJornadas.colaboradorCargoId))
    .leftJoin(cargos, eq(cargos.id, colaboradoresCargos.cargoId))
    .where(eq(colaboradoresJornadas.colaboradorId, colaboradorId))
    .orderBy(
      desc(colaboradoresJornadas.dataInicio),
      asc(colaboradoresJornadas.diaDaSemana),
      asc(colaboradoresJornadas.horaEntrada)
    );
}

export async function criarJornadasColaboradorRepository(
  colaboradorId: string,
  input: {
    empresaId: string;
    dataInicio: string;
    faixas: Array<{
      diaDaSemana: string;
      horaEntrada: string;
      cargaHorariaDiariaEmMinutos: number;
      intervaloMinutos: number;
      colaboradorCargoId: string | null;
    }>;
  }
) {
  return executarEmTransacao(async (tx) => {
    const diasAfetados = [...new Set(input.faixas.map((faixa) => faixa.diaDaSemana))];
    if (diasAfetados.length) {
      await tx
        .update(colaboradoresJornadas)
        .set({ ativo: false, atualizadoEm: new Date() })
        .where(
          and(
            eq(colaboradoresJornadas.colaboradorId, colaboradorId),
            inArray(colaboradoresJornadas.diaDaSemana, diasAfetados)
          )
        );
    }

    const criados: string[] = [];
    for (const faixa of input.faixas) {
      const [criada] = await tx
        .insert(colaboradoresJornadas)
        .values({
          empresaId: input.empresaId,
          colaboradorId,
          diaDaSemana: faixa.diaDaSemana,
          cargaHorariaDiariaEmMinutos: faixa.cargaHorariaDiariaEmMinutos,
          intervaloMinutos: faixa.intervaloMinutos,
          colaboradorCargoId: faixa.cargaHorariaDiariaEmMinutos > 0 ? faixa.colaboradorCargoId : null,
          horaEntrada: faixa.cargaHorariaDiariaEmMinutos > 0 ? faixa.horaEntrada : null,
          dataInicio: input.dataInicio,
          ativo: true
        })
        .returning({ id: colaboradoresJornadas.id });
      if (criada?.id) criados.push(criada.id);
    }
    return { ids: criados };
  });
}

export async function listarFaltasJustificadasRepository(colaboradorId: string) {
  const faltas = await banco
    .select({
      id: colaboradoresFaltasJustificadas.id,
      empresaId: colaboradoresFaltasJustificadas.empresaId,
      colaboradorId: colaboradoresFaltasJustificadas.colaboradorId,
      inicio: colaboradoresFaltasJustificadas.inicio,
      fim: colaboradoresFaltasJustificadas.fim,
      motivo: colaboradoresFaltasJustificadas.motivo
    })
    .from(colaboradoresFaltasJustificadas)
    .where(eq(colaboradoresFaltasJustificadas.colaboradorId, colaboradorId))
    .orderBy(desc(colaboradoresFaltasJustificadas.inicio));
  return faltas.map((falta) => ({ ...falta, inicio: falta.inicio.toISOString(), fim: falta.fim.toISOString() }));
}

export async function criarFaltaJustificadaRepository(input: {
  empresaId: string;
  colaboradorId: string;
  inicio: string;
  fim: string;
  motivo: string;
}) {
  const [criada] = await banco
    .insert(colaboradoresFaltasJustificadas)
    .values({
      empresaId: input.empresaId,
      colaboradorId: input.colaboradorId,
      inicio: new Date(input.inicio),
      fim: new Date(input.fim),
      motivo: input.motivo
    })
    .returning({ id: colaboradoresFaltasJustificadas.id });
  return criada;
}

async function completarColaboradores(empresaDestinoId: string, db: ExecutorBanco) {
  const colaboradoresDestino = await db.select().from(colaboradores).where(eq(colaboradores.empresaId, empresaDestinoId));
  const setoresDestino = await db.select().from(setores).where(eq(setores.empresaId, empresaDestinoId));
  const colaboradoresOrigem = await db.select().from(colaboradores);
  for (const destino of colaboradoresDestino) {
    if (!destino.importadoDe || !destino.idImportado) continue;
    const origem = colaboradoresOrigem.find((item) => item.id === destino.idImportado);
    if (!origem?.setorId) continue;
    const setorDestino = setoresDestino.find((item) => item.importadoDe === origem.empresaId && item.idImportado === origem.setorId);
    if (setorDestino) await db.update(colaboradores).set({ setorId: setorDestino.id }).where(eq(colaboradores.id, destino.id));
  }
}

export async function copiarColaboradoresRepository(
  filtro: FiltroOrigemEntidade,
  empresaDestinoId: string,
  empresasPermitidasIds: string[] | null,
  modo: ModoImportacaoEntidade = "simples"
): Promise<ResultadoImportacaoEntidade> {
  return executarEmTransacao(async (db) => {
    const origem = filtrarOrigemEntidade(await db.select().from(colaboradores), filtro, empresasPermitidasIds);
    const destinos = await db.select().from(colaboradores).where(eq(colaboradores.empresaId, empresaDestinoId));
    let inseridos = 0;
    for (const colaborador of origem) {
      if (jaImportado(destinos, colaborador.empresaId, colaborador.id)) continue;
      await db.insert(colaboradores).values({
        empresaId: empresaDestinoId,
        nome: colaborador.nome,
        cpf: colaborador.cpf,
        setorId: null,
        usuarioId: null,
        importadoDe: colaborador.empresaId,
        idImportado: colaborador.id
      });
      inseridos += 1;
    }
    if (modo === "completo") await completarColaboradores(empresaDestinoId, db);
    return { tipo: "colaboradores", inseridos };
  });
}

export async function copiarCargosRepository(
  filtro: FiltroOrigemEntidade,
  empresaDestinoId: string,
  empresasPermitidasIds: string[] | null,
  _modo: ModoImportacaoEntidade = "simples"
): Promise<ResultadoImportacaoEntidade> {
  return executarEmTransacao(async (db) => {
    const origem = filtrarOrigemEntidade(await db.select().from(cargos), filtro, empresasPermitidasIds);
    const destinos = await db.select().from(cargos).where(eq(cargos.empresaId, empresaDestinoId));
    let inseridos = 0;
    for (const cargo of origem) {
      if (jaImportado(destinos, cargo.empresaId, cargo.id)) continue;
      await db
        .insert(cargos)
        .values({ empresaId: empresaDestinoId, nome: cargo.nome, importadoDe: cargo.empresaId, idImportado: cargo.id })
        .onConflictDoNothing();
      inseridos += 1;
    }
    return { tipo: "cargos", inseridos };
  });
}
