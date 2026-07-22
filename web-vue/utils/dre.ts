// Logica PURA da visao DRE do periodo. Reaproveita os totais JA PERSISTIDOS em fechamentos_caixa que a
// API devolve por caixa em /api/caixa/historico (mais o meta.totais do periodo). Nao recalcula a partir
// de lancamentos: apenas SOMA as colunas persistidas, agrupando por PDV / turno / dia.
import type { LinhaHistoricoCaixa, TotaisHistoricoCaixa } from "@padaria/shared";

export type DimensaoDre = "pdv" | "turno" | "dia";

export interface LinhaDre {
  chave: string;
  rotulo: string;
  entradas: number;
  transferencias: number;
  despesas: number;
  mercadorias: number;
  retiradas: number;
  saldo: number;
  caixas: number;
}

function linhaZerada(chave: string, rotulo: string): LinhaDre {
  return {
    chave,
    rotulo,
    entradas: 0,
    transferencias: 0,
    despesas: 0,
    mercadorias: 0,
    retiradas: 0,
    saldo: 0,
    caixas: 0
  };
}

function chaveEComRotulo(linha: LinhaHistoricoCaixa, dimensao: DimensaoDre): { chave: string; rotulo: string } {
  if (dimensao === "pdv") return { chave: linha.pdvId ?? "sem-pdv", rotulo: linha.pdvNome || "Sem PDV" };
  if (dimensao === "turno") return { chave: linha.turnoId ?? "sem-turno", rotulo: linha.turnoNome || "Sem turno" };
  return { chave: linha.dataMovimento, rotulo: linha.dataMovimento };
}

// Agrupa as linhas do historico pela dimensao escolhida, somando as colunas persistidas. So caixa
// FECHADO tem total persistido; caixa ainda aberto contribui 0 ate o fechamento gravar (mesma regra
// que a API documenta) — por isso o DRE olha o resultado do periodo, nao o caixa em andamento.
export function agruparDre(linhas: readonly LinhaHistoricoCaixa[], dimensao: DimensaoDre): LinhaDre[] {
  const grupos = new Map<string, LinhaDre>();
  for (const linha of linhas) {
    const { chave, rotulo } = chaveEComRotulo(linha, dimensao);
    const grupo = grupos.get(chave) ?? linhaZerada(chave, rotulo);
    grupo.entradas += linha.totalEntradas;
    grupo.transferencias += linha.totalTransferencias;
    grupo.despesas += linha.totalDespesas;
    grupo.mercadorias += linha.totalMercadorias;
    grupo.retiradas += linha.totalRetiradas;
    grupo.saldo += linha.saldo;
    grupo.caixas += 1;
    grupos.set(chave, grupo);
  }
  return [...grupos.values()].sort((a, b) => b.saldo - a.saldo);
}

// O "Resultado do periodo" (linha total): vem do meta.totais do historico, JA somado no servidor sobre
// todo o filtro (nao depende de paginacao). Fonte unica da verdade do total do periodo.
export function resultadoDoPeriodo(totais: TotaisHistoricoCaixa | null): LinhaDre {
  const linha = linhaZerada("periodo", "Resultado do periodo");
  if (!totais) return linha;
  linha.entradas = totais.totalEntradas;
  linha.transferencias = totais.totalTransferenciasEntrada - totais.totalTransferenciasSaida;
  linha.despesas = totais.totalDespesas;
  linha.mercadorias = totais.totalMercadorias;
  linha.retiradas = totais.totalRetiradas;
  linha.saldo = totais.saldo;
  linha.caixas = totais.caixas;
  return linha;
}
