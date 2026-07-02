import type { DadosExternos } from "@padaria/shared/api";
import { pdvPayloadSchema } from "@padaria/shared/pdvs";
import { filtrarPorEmpresas } from "../auth/empresa.js";
import { executarEmTransacao } from "../banco/conexao.js";
import { falharValidacao } from "../utils.js";
import { buscarContaEmpresaRepository } from "../contas/contas.repository.js";
import { listarPdvsRepository, salvarPdvRepository } from "./pdvs.repository.js";

export async function listarPdvs(escopoDados: string[]) {
  return filtrarPorEmpresas(await listarPdvsRepository(), escopoDados);
}

export async function salvarPdv(id: string | null, body: DadosExternos) {
  const dados = pdvPayloadSchema.parse(body);
  return executarEmTransacao(async (tx) => {
    const conta = await buscarContaEmpresaRepository(dados.contaId, tx);
    if (!conta || conta.empresaId !== dados.empresaId) falharValidacao("Conta nao pertence a empresa");
    return salvarPdvRepository(
      {
        ...(id ? { id } : {}),
        empresaId: dados.empresaId,
        nome: dados.nome.trim(),
        contaId: dados.contaId,
        ativo: dados.ativo
      },
      tx
    );
  });
}
