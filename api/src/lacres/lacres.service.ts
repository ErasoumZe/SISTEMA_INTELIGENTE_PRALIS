import type { LacrePayload, OrigemLacre } from "@padaria/shared/lacres";
import { erroValidacao } from "../erros.js";
import { criarLacreRepository, existeNumeroLacreRepository, listarLacresRepository } from "./lacres.repository.js";

function normalizarNumero(numero: string): string {
  return numero.trim();
}

export async function listarLacres(filtro: {
  empresasPermitidas: string[];
  transferenciaId?: string;
  origem?: OrigemLacre;
}) {
  return listarLacresRepository(filtro);
}

export async function criarLacre(payload: LacrePayload) {
  const numero = normalizarNumero(payload.numero);
  if (!numero) throw erroValidacao("Numero do lacre obrigatorio");

  const existente = await existeNumeroLacreRepository(payload.empresaId, numero);
  if (existente) throw erroValidacao(`Lacre ja cadastrado: ${existente.numero}`, "LACRE_DUPLICADO");

  const criado = await criarLacreRepository({ empresaId: payload.empresaId, numero, origem: payload.origem });
  return { id: criado?.id ?? "lacres", empresaId: payload.empresaId, numero, origem: payload.origem };
}
