import { createHash } from "node:crypto";
import { CONFIRMACAO_LIBERAR_REVENDA } from "@padaria/shared/produtos";
import { executarEmTransacao, type ExecutorBanco } from "../banco/conexao.js";
import { travarCadastroDeProdutos } from "./produtos-escrita.repository.js";
import { liberarRevendaRepository, revendaAtivaNaoLiberadaRepository } from "./produtos-liberar-revenda.repository.js";
import { lojaDaEmpresa, VinculoBaseError, type Ator } from "./produtos-vinculo-base.service.js";

/**
 * Liberar para compra toda a revenda ativa da loja (decisão do José, 13/11/2026, igual ao S2). Transformação
 * (feito na casa) fica de fora. Só administrador; prévia sem gravar; gravar exige a frase e o hash da prévia.
 */
const TAMANHO_DA_AMOSTRA = 12;

async function planejar(empresaId: string, tx?: ExecutorBanco) {
  const linhas = await revendaAtivaNaoLiberadaRepository(empresaId, tx);
  const ids = linhas.map((linha) => linha.id).sort();
  return {
    ids,
    total: ids.length,
    amostra: linhas.slice(0, TAMANHO_DA_AMOSTRA).map(({ codigoInterno, descricao }) => ({ codigoInterno, descricao })),
    hashPlano: createHash("sha256").update(ids.join(",")).digest("hex")
  };
}

export async function previaLiberarRevenda(empresaId: string, ator: Ator) {
  const loja = await lojaDaEmpresa(empresaId, ator);
  const plano = await planejar(empresaId);
  return {
    loja,
    total: plano.total,
    amostra: plano.amostra,
    hashPlano: plano.hashPlano,
    confirmacao: CONFIRMACAO_LIBERAR_REVENDA
  };
}

export async function aplicarLiberarRevenda(
  empresaId: string,
  entrada: { confirmacao: string; hashPlano: string },
  ator: Ator
) {
  const loja = await lojaDaEmpresa(empresaId, ator);
  if (entrada.confirmacao.trim().toUpperCase() !== CONFIRMACAO_LIBERAR_REVENDA) {
    throw new VinculoBaseError(`Digite exatamente ${CONFIRMACAO_LIBERAR_REVENDA}.`, 400, "CONFIRMACAO_INVALIDA");
  }
  return executarEmTransacao(async (tx) => {
    await travarCadastroDeProdutos(tx);
    const plano = await planejar(empresaId, tx);
    if (plano.hashPlano !== entrada.hashPlano) {
      throw new VinculoBaseError(
        "Os produtos mudaram desde a prévia. Confira de novo; nada foi gravado.",
        409,
        "PREVIA_DESATUALIZADA"
      );
    }
    const liberados = await liberarRevendaRepository(tx, empresaId, plano.ids);
    return { loja, liberados };
  });
}
