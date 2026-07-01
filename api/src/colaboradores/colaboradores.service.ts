import type {
  CargoPayload,
  ColaboradorCargoPayload,
  ColaboradorCargoStatusPayload,
  FaltaJustificadaPayload,
  JornadaPayload
} from "@padaria/shared/colaboradores";
import {
  colaboradorPayloadSchema,
  type ColaboradorPayload as ColaboradorDadosPayload,
  type ExportarCargoPayload,
  type ExportarColaboradorPayload,
  type ImportarCargosPayload,
  type ImportarColaboradoresPayload
} from "@padaria/shared/colaboradores";
import { diasSemana } from "@padaria/shared/colaboradores";
import { empresasPermitidas, filtrarPorEmpresas, type PerfilComEmpresa } from "../auth/empresa.js";
import {
  apenasDigitos,
  falharValidacao,
  validarExportacaoParaEmpresa,
  validarImportacaoEntreEmpresas
} from "../utils.js";
import { copiarAreasSetoresRepository } from "../areas/areas.repository.js";
import {
  atualizarCargoRepository,
  atualizarStatusCargoColaboradorRepository,
  colaboradorTemUsuarioRepository,
  contarCargosAtivosColaboradorRepository,
  copiarCargosRepository,
  copiarColaboradoresRepository,
  criarCargoColaboradorRepository,
  criarCargoRepository,
  criarFaltaJustificadaRepository,
  criarJornadasColaboradorRepository,
  existeCargoAtivoColaboradorRepository,
  existeCargoNaEmpresaRepository,
  existeColaboradorNaEmpresaRepository,
  existeSetorNaEmpresaRepository,
  listarColaboradoresRepository,
  listarCargosColaboradorRepository,
  listarCargosRepository,
  listarFaltasJustificadasRepository,
  listarJornadasColaboradorRepository,
  salvarCargoColaboradorRepository,
  salvarColaboradorRepository
} from "./colaboradores.repository.js";
import { executarEmTransacao } from "../banco/conexao.js";

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

export async function listarCargos(escopoDados: string[]) {
  return filtrarPorEmpresas(await listarCargosRepository(), escopoDados);
}

export async function listarColaboradores(escopoDados: string[]) {
  return filtrarPorEmpresas(await listarColaboradoresRepository(), escopoDados);
}

export async function salvarColaborador(id: string | null, body: unknown) {
  const dados: ColaboradorDadosPayload = colaboradorPayloadSchema.parse(body);
  return executarEmTransacao(async (tx) => {
    const cargo = await existeCargoNaEmpresaRepository(dados.cargoId, dados.empresaId, tx);
    if (!cargo) falharValidacao("Cargo nao pertence a empresa");
    const colaborador = await salvarColaboradorRepository(
      {
        ...(id ? { id } : {}),
        empresaId: dados.empresaId,
        nome: dados.nome.trim(),
        cpf: apenasDigitos(dados.cpf),
        setorId: dados.setorId ?? null
      },
      tx
    );
    if (!colaborador?.id) falharValidacao("Nao foi possivel cadastrar o colaborador");
    if (!id || !(await contarCargosAtivosColaboradorRepository(colaborador.id, tx))) {
      await salvarCargoColaboradorRepository(
        {
          empresaId: dados.empresaId,
          colaboradorId: colaborador.id,
          setorId: dados.setorId ?? null,
          cargoId: dados.cargoId,
          remuneracaoMinuto: 1,
          dataInicio: new Date().toISOString().slice(0, 10),
          ativo: true
        },
        tx
      );
    }
    return colaborador;
  });
}

export async function importarColaboradores(body: ImportarColaboradoresPayload, perfil?: PerfilComEmpresa) {
  validarImportacaoEntreEmpresas(body.empresaOrigemId, body.empresaDestinoId, perfil);
  const permitidas = perfil ? empresasPermitidas(perfil) : [];
  return executarEmTransacao(async (tx) => {
    let inseridos = 0;
    if (body.modo === "completo") {
      inseridos += (
        await copiarAreasSetoresRepository(
          { empresaOrigemId: body.empresaOrigemId },
          body.empresaDestinoId,
          permitidas,
          body.modo,
          tx
        )
      ).inseridos;
    }
    inseridos += (
      await copiarColaboradoresRepository(
        { empresaOrigemId: body.empresaOrigemId },
        body.empresaDestinoId,
        permitidas,
        body.modo,
        tx
      )
    ).inseridos;
    return { tipo: "colaboradores", modo: body.modo, inseridos };
  });
}

export async function exportarColaborador(id: string, body: ExportarColaboradorPayload, perfil?: PerfilComEmpresa) {
  validarExportacaoParaEmpresa(body.empresaDestinoId, perfil);
  return copiarColaboradoresRepository(
    { id },
    body.empresaDestinoId,
    perfil ? empresasPermitidas(perfil) : [],
    body.modo
  );
}

export async function importarCargos(body: ImportarCargosPayload, perfil?: PerfilComEmpresa) {
  validarImportacaoEntreEmpresas(body.empresaOrigemId, body.empresaDestinoId, perfil);
  return copiarCargosRepository(
    { empresaOrigemId: body.empresaOrigemId },
    body.empresaDestinoId,
    perfil ? empresasPermitidas(perfil) : [],
    body.modo
  );
}

export async function exportarCargo(id: string, body: ExportarCargoPayload, perfil?: PerfilComEmpresa) {
  validarExportacaoParaEmpresa(body.empresaDestinoId, perfil);
  return copiarCargosRepository({ id }, body.empresaDestinoId, perfil ? empresasPermitidas(perfil) : [], body.modo);
}

export async function criarCargo(payload: CargoPayload) {
  return criarCargoRepository({ empresaId: payload.empresaId, nome: payload.nome.trim() });
}

export async function atualizarCargo(id: string, payload: CargoPayload) {
  return atualizarCargoRepository({ id, empresaId: payload.empresaId, nome: payload.nome.trim() });
}

export async function listarCargosColaborador(colaboradorId: string, empresasPermitidasIds: string[]) {
  return filtrarPorEmpresas(await listarCargosColaboradorRepository(colaboradorId), empresasPermitidasIds);
}

export async function criarCargoColaborador(colaboradorId: string, payload: ColaboradorCargoPayload) {
  return executarEmTransacao(async (tx) => {
    const colaboradorExiste = await existeColaboradorNaEmpresaRepository(colaboradorId, payload.empresaId, tx);
    const cargoExiste = await existeCargoNaEmpresaRepository(payload.cargoId, payload.empresaId, tx);
    const setorExiste = payload.setorId ? await existeSetorNaEmpresaRepository(payload.setorId, payload.empresaId, tx) : true;
    if (!colaboradorExiste) throw new Error("Colaborador inexistente");
    if (!cargoExiste) throw new Error("Cargo inexistente");
    if (!setorExiste) throw new Error("Setor inexistente");

    return criarCargoColaboradorRepository(
      {
        empresaId: payload.empresaId,
        colaboradorId,
        setorId: payload.setorId ?? null,
        cargoId: payload.cargoId,
        remuneracaoMinuto: payload.remuneracaoMinuto,
        dataInicio: payload.dataInicio,
        ativo: payload.ativo
      },
      tx
    );
  });
}

export async function atualizarStatusCargoColaborador(
  colaboradorId: string,
  cargoColaboradorId: string,
  payload: ColaboradorCargoStatusPayload
) {
  return executarEmTransacao(async (tx) => {
    if (!payload.ativo && (await colaboradorTemUsuarioRepository(colaboradorId, tx))) {
      const cargosAtivos = await contarCargosAtivosColaboradorRepository(colaboradorId, tx);
      if (cargosAtivos <= 1) throw new Error("Colaborador com usuario precisa ter ao menos um cargo ativo");
    }

    return atualizarStatusCargoColaboradorRepository(
      {
        colaboradorId,
        cargoColaboradorId,
        empresaId: payload.empresaId,
        ativo: payload.ativo
      },
      tx
    );
  });
}

export async function listarJornadasColaborador(colaboradorId: string, empresasPermitidasIds: string[]) {
  return filtrarPorEmpresas(await listarJornadasColaboradorRepository(colaboradorId), empresasPermitidasIds);
}

export async function criarJornadasColaborador(colaboradorId: string, payload: JornadaPayload) {
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

  return executarEmTransacao(async (tx) => {
    const colaboradorExiste = await existeColaboradorNaEmpresaRepository(colaboradorId, payload.empresaId, tx);
    if (!colaboradorExiste) throw new Error("Colaborador inexistente");

    for (const faixa of faixas) {
      if (faixa.cargaHorariaDiariaEmMinutos <= 0) continue;
      if (!faixa.horaEntrada) throw new Error("Horario de entrada obrigatorio");
      if (!faixa.colaboradorCargoId) throw new Error("Cargo obrigatorio na jornada");
      const cargoExiste = await existeCargoAtivoColaboradorRepository(
        {
          colaboradorCargoId: faixa.colaboradorCargoId,
          colaboradorId,
          empresaId: payload.empresaId
        },
        tx
      );
      if (!cargoExiste) throw new Error("Cargo ativo do colaborador inexistente");
    }

    return criarJornadasColaboradorRepository(
      colaboradorId,
      {
        empresaId: payload.empresaId,
        dataInicio: payload.dataInicio,
        faixas
      },
      tx
    );
  });
}

export async function listarFaltasJustificadas(colaboradorId: string, empresasPermitidasIds: string[]) {
  return filtrarPorEmpresas(await listarFaltasJustificadasRepository(colaboradorId), empresasPermitidasIds);
}

export async function criarFaltaJustificada(colaboradorId: string, payload: FaltaJustificadaPayload) {
  if (new Date(payload.fim).getTime() <= new Date(payload.inicio).getTime()) {
    throw new Error("Fim deve ser posterior ao inicio");
  }
  return executarEmTransacao(async (tx) => {
    const colaboradorExiste = await existeColaboradorNaEmpresaRepository(colaboradorId, payload.empresaId, tx);
    if (!colaboradorExiste) throw new Error("Colaborador inexistente");
    return criarFaltaJustificadaRepository(
      {
        empresaId: payload.empresaId,
        colaboradorId,
        inicio: payload.inicio,
        fim: payload.fim,
        motivo: payload.motivo.trim()
      },
      tx
    );
  });
}
