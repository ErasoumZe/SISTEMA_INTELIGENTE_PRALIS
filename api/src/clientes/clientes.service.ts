import type { DadosExternos } from "@padaria/shared/api";
import { clientePayloadSchema, type clientesQuerySchema } from "@padaria/shared/clientes";
import type { z } from "zod";
import { apenasDigitos } from "../utils.js";
import { listarClientesRepository, salvarClienteRepository } from "./clientes.repository.js";

export async function listarClientes(query: z.infer<typeof clientesQuerySchema>, escopoDados: string[]) {
  return listarClientesRepository(query, escopoDados);
}

export async function salvarCliente(id: string | null, body: DadosExternos) {
  const dados = clientePayloadSchema.parse(body);
  return salvarClienteRepository({
    ...(id ? { id } : {}),
    empresaId: dados.empresaId,
    nome: dados.nome.trim(),
    documento: apenasDigitos(dados.documento),
    dataNascimento: dados.dataNascimento || null,
    whatsapp: apenasDigitos(dados.whatsapp),
    email: dados.email?.trim() || null,
    cep: apenasDigitos(dados.cep),
    rua: dados.rua?.trim() || null,
    numero: dados.numero?.trim() || null,
    complemento: dados.complemento?.trim() || null,
    bairro: dados.bairro?.trim() || null,
    cidade: dados.cidade?.trim() || null,
    estado: dados.estado?.trim().toUpperCase() || null
  });
}
