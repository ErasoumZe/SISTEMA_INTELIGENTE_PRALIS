import type { DadosExternos } from "@padaria/shared/api";
import { formaPagamentoPayloadSchema } from "@padaria/shared/formas-pagamento";
import { filtrarPorEmpresas } from "../auth/empresa.js";
import { listarFormasPagamentoRepository, salvarFormaPagamentoRepository } from "./formas-pagamento.repository.js";

export async function listarFormasPagamento(escopoDados: string[]) {
  return filtrarPorEmpresas(await listarFormasPagamentoRepository(), escopoDados);
}

export async function salvarFormaPagamento(id: string | null, body: DadosExternos) {
  const dados = formaPagamentoPayloadSchema.parse(body);
  return salvarFormaPagamentoRepository({ ...(id ? { id } : {}), empresaId: dados.empresaId, nome: dados.nome.trim() });
}
