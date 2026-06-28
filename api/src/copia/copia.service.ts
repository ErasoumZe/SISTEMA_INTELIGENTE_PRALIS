import { empresasPermitidas, podeAcessarEmpresa, type PerfilComEmpresa } from "../autorizacao/empresa.js";
import { copiarDadosEmpresaRepository } from "./copia.repository.js";
import type { ExportarCadastroPayload, ImportarCadastroPayload } from "@padaria/shared/copia";

function tiposDependentesCompletos(tipo: string): string[] {
  if (tipo === "produtos") return ["grupos", "unidades", "produtos"];
  if (tipo === "colaboradores") return ["areas_setores", tipo];
  return [tipo];
}

export async function importarCadastroEmpresa(tipo: string, body: ImportarCadastroPayload, perfil?: PerfilComEmpresa) {
  if (body.empresaOrigemId === body.empresaDestinoId) throw new Error("Escolha empresas diferentes");
  if (
    perfil &&
    (!podeAcessarEmpresa(perfil, body.empresaOrigemId) || !podeAcessarEmpresa(perfil, body.empresaDestinoId))
  ) {
    throw new Error("Empresa nao permitida");
  }

  const permitidas = perfil ? empresasPermitidas(perfil) : [];
  let inseridos = 0;
  for (const tipoCopia of body.modo === "completo" ? tiposDependentesCompletos(tipo) : [tipo]) {
    const resultado = await copiarDadosEmpresaRepository(
      tipoCopia,
      { empresaOrigemId: body.empresaOrigemId },
      body.empresaDestinoId,
      permitidas,
      body.modo
    );
    inseridos += resultado.inseridos;
  }
  return { tipo, modo: body.modo, inseridos };
}

export async function exportarCadastroEmpresa(
  tipo: string,
  id: string,
  body: ExportarCadastroPayload,
  perfil?: PerfilComEmpresa
) {
  if (perfil && !podeAcessarEmpresa(perfil, body.empresaDestinoId)) {
    throw new Error("Empresa nao permitida");
  }

  return copiarDadosEmpresaRepository(
    tipo,
    { id },
    body.empresaDestinoId,
    perfil ? empresasPermitidas(perfil) : [],
    body.modo
  );
}
