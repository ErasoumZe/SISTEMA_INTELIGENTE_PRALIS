import type { AjusteSaldoPayload, AjusteSaldoResponse, ResumoCaixa, ResumoCaixaQuery } from "@padaria/shared/caixa";
import { saldoCaixa } from "../regras.js";
import { buscarGrupoQuebraCaixa, criarAjusteSaldoCaixa, obterTotaisCaixa } from "./caixa.repository.js";

export async function obterResumoCaixa(query: ResumoCaixaQuery): Promise<ResumoCaixa> {
  const totais = await obterTotaisCaixa(query);
  const totalEntradas = Number(totais.totalEntradas);
  const totalTransferencias = Number(totais.totalTransferencias);
  const totalDespesas = Number(totais.totalDespesas);
  const totalRetiradas = Number(totais.totalRetiradas);

  return {
    totalEntradas,
    totalTransferencias,
    totalDespesas,
    totalRetiradas,
    saldo: saldoCaixa({ totalEntradas, totalTransferencias, totalDespesas, totalRetiradas })
  };
}

export async function acertarSaldoCaixa(dados: AjusteSaldoPayload, usuarioId: string): Promise<AjusteSaldoResponse> {
  if (dados.valorDiferenca === 0) throw new Error("Nao ha diferenca para acertar");

  const grupo = await buscarGrupoQuebraCaixa(dados.empresaId);
  const movimentacao = await criarAjusteSaldoCaixa(dados, grupo?.id ?? null, usuarioId);

  return { movimentacaoId: movimentacao.id };
}
