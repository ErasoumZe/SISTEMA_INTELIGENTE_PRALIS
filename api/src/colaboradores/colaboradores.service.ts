import type {
  CargoPayload,
  ColaboradorCargoPayload,
  ColaboradorCargoStatusPayload,
  FaltaJustificadaPayload,
  JornadaPayload
} from "@padaria/shared/colaboradores";
import { diasSemana } from "@padaria/shared/colaboradores";
import { filtrarPorEmpresas } from "../autorizacao/empresa.js";
import {
  atualizarCargoRepository,
  atualizarStatusCargoColaboradorRepository,
  colaboradorTemUsuarioRepository,
  contarCargosAtivosColaboradorRepository,
  criarCargoColaboradorRepository,
  criarCargoRepository,
  criarFaltaJustificadaRepository,
  criarJornadasColaboradorRepository,
  existeCargoAtivoColaboradorRepository,
  existeCargoNaEmpresaRepository,
  existeColaboradorNaEmpresaRepository,
  existeSetorNaEmpresaRepository,
  listarCargosColaboradorRepository,
  listarCargosRepository,
  listarFaltasJustificadasRepository,
  listarJornadasColaboradorRepository
} from "./colaboradores.repository.js";

type FaixaJornada = {
  diaDaSemana: string;
  horaEntrada: string;
  cargaHorariaDiariaEmMinutos: number;
  intervaloMinutos: number;
  colaboradorCargoId: string | null;
};

function horaParaMinutos(valor: string) {
  const [horasRaw, minutosRaw] = valor.split(":");
  const horas = Number.parseInt(horasRaw ?? "", 10);
  const minutos = Number.parseInt(minutosRaw ?? "", 10);
  if (!Number.isFinite(horas) || !Number.isFinite(minutos) || horas < 0 || horas > 23 || minutos < 0 || minutos > 59) {
    throw new Error("Hora invalida");
  }
  return horas * 60 + minutos;
}

function validarSobreposicaoJornada(faixas: FaixaJornada[]) {
  for (const dia of diasSemana) {
    const intervalos = faixas
      .filter((faixa) => faixa.diaDaSemana === dia && faixa.cargaHorariaDiariaEmMinutos > 0)
      .map((faixa) => {
        const inicio = horaParaMinutos(faixa.horaEntrada);
        const fim = inicio + faixa.cargaHorariaDiariaEmMinutos + faixa.intervaloMinutos;
        if (fim > 24 * 60) throw new Error("Faixa de horario ultrapassa o dia");
        return { inicio, fim };
      })
      .sort((a, b) => a.inicio - b.inicio);
    for (let index = 1; index < intervalos.length; index += 1) {
      const atual = intervalos[index];
      const anterior = intervalos[index - 1];
      if (atual && anterior && atual.inicio < anterior.fim) throw new Error("Faixas de horario sobrepostas");
    }
  }
}

export async function listarCargos(escopoDados: string[] | null) {
  return filtrarPorEmpresas(await listarCargosRepository(), escopoDados);
}

export async function criarCargo(payload: CargoPayload) {
  return criarCargoRepository({ empresaId: payload.empresaId, nome: payload.nome.trim() });
}

export async function atualizarCargo(id: string, payload: CargoPayload) {
  return atualizarCargoRepository({ id, empresaId: payload.empresaId, nome: payload.nome.trim() });
}

export async function listarCargosColaborador(colaboradorId: string, empresasPermitidasIds: string[] | null) {
  return filtrarPorEmpresas(await listarCargosColaboradorRepository(colaboradorId), empresasPermitidasIds);
}

export async function criarCargoColaborador(colaboradorId: string, payload: ColaboradorCargoPayload) {
  const [colaboradorExiste, cargoExiste, setorExiste] = await Promise.all([
    existeColaboradorNaEmpresaRepository(colaboradorId, payload.empresaId),
    existeCargoNaEmpresaRepository(payload.cargoId, payload.empresaId),
    payload.setorId ? existeSetorNaEmpresaRepository(payload.setorId, payload.empresaId) : Promise.resolve(true)
  ]);
  if (!colaboradorExiste) throw new Error("Colaborador inexistente");
  if (!cargoExiste) throw new Error("Cargo inexistente");
  if (!setorExiste) throw new Error("Setor inexistente");

  return criarCargoColaboradorRepository({
    empresaId: payload.empresaId,
    colaboradorId,
    setorId: payload.setorId ?? null,
    cargoId: payload.cargoId,
    remuneracaoMinuto: payload.remuneracaoMinuto,
    dataInicio: payload.dataInicio,
    ativo: payload.ativo
  });
}

export async function atualizarStatusCargoColaborador(
  colaboradorId: string,
  cargoColaboradorId: string,
  payload: ColaboradorCargoStatusPayload
) {
  if (!payload.ativo && (await colaboradorTemUsuarioRepository(colaboradorId))) {
    const cargosAtivos = await contarCargosAtivosColaboradorRepository(colaboradorId);
    if (cargosAtivos <= 1) throw new Error("Colaborador com usuario precisa ter ao menos um cargo ativo");
  }

  return atualizarStatusCargoColaboradorRepository({
    colaboradorId,
    cargoColaboradorId,
    empresaId: payload.empresaId,
    ativo: payload.ativo
  });
}

export async function listarJornadasColaborador(colaboradorId: string, empresasPermitidasIds: string[] | null) {
  return filtrarPorEmpresas(await listarJornadasColaboradorRepository(colaboradorId), empresasPermitidasIds);
}

export async function criarJornadasColaborador(colaboradorId: string, payload: JornadaPayload) {
  const colaboradorExiste = await existeColaboradorNaEmpresaRepository(colaboradorId, payload.empresaId);
  if (!colaboradorExiste) throw new Error("Colaborador inexistente");

  const faixas = payload.dias.flatMap((dia) =>
    dia.faixas.map((faixa) => ({
      diaDaSemana: dia.diaDaSemana,
      horaEntrada: faixa.horaEntrada,
      cargaHorariaDiariaEmMinutos: faixa.cargaHorariaDiariaEmMinutos,
      intervaloMinutos: faixa.intervaloMinutos,
      colaboradorCargoId: faixa.colaboradorCargoId ?? null
    }))
  );

  validarSobreposicaoJornada(faixas);

  for (const faixa of faixas) {
    if (faixa.cargaHorariaDiariaEmMinutos <= 0) continue;
    if (!faixa.horaEntrada) throw new Error("Horario de entrada obrigatorio");
    if (!faixa.colaboradorCargoId) throw new Error("Cargo obrigatorio na jornada");
    const cargoExiste = await existeCargoAtivoColaboradorRepository({
      colaboradorCargoId: faixa.colaboradorCargoId,
      colaboradorId,
      empresaId: payload.empresaId
    });
    if (!cargoExiste) throw new Error("Cargo ativo do colaborador inexistente");
  }

  return criarJornadasColaboradorRepository(colaboradorId, {
    empresaId: payload.empresaId,
    dataInicio: payload.dataInicio,
    faixas
  });
}

export async function listarFaltasJustificadas(colaboradorId: string, empresasPermitidasIds: string[] | null) {
  return filtrarPorEmpresas(await listarFaltasJustificadasRepository(colaboradorId), empresasPermitidasIds);
}

export async function criarFaltaJustificada(colaboradorId: string, payload: FaltaJustificadaPayload) {
  if (new Date(payload.fim).getTime() <= new Date(payload.inicio).getTime()) {
    throw new Error("Fim deve ser posterior ao inicio");
  }
  const colaboradorExiste = await existeColaboradorNaEmpresaRepository(colaboradorId, payload.empresaId);
  if (!colaboradorExiste) throw new Error("Colaborador inexistente");
  return criarFaltaJustificadaRepository({
    empresaId: payload.empresaId,
    colaboradorId,
    inicio: payload.inicio,
    fim: payload.fim,
    motivo: payload.motivo.trim()
  });
}
