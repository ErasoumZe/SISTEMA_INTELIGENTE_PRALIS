import { z } from "zod";
import type { PedidoStatus } from "../pedidos/index.js";

// Painel de Pedidos em matriz (doc 57 §4, José 22/10/2026): linhas = fornecedores, colunas = situacoes.
// "A fazer" junta o que espera o comprador: item sem fornecedor numa cotacao aberta, decisao pendente depois
// do prazo e pedido legado a fazer. "Enviado" e o convite que o fornecedor ainda tem para responder.

export const COLUNAS_PAINEL = [
  "a_fazer",
  "enviado",
  "cotado",
  "retornado",
  "confirmado",
  "recebido_parcial",
  "recebido"
] as const;
export type ColunaPainel = (typeof COLUNAS_PAINEL)[number];

export const ROTULO_COLUNA_PAINEL: Record<ColunaPainel, string> = {
  a_fazer: "A fazer",
  enviado: "Enviado",
  cotado: "Cotado",
  retornado: "Retornado",
  confirmado: "Comprado",
  recebido_parcial: "Recebido parcialmente",
  recebido: "Recebido"
};

export const painelComprasQuerySchema = z.object({ empresaId: z.string().uuid() });

/** Item de uma cotacao aberta que nenhum fornecedor recebeu (doc 57 §2). */
export type ItemSemFornecedorDto = {
  rodadaId: string;
  rodadaNumero: number;
  rodadaItemId: string;
  produtoId: string;
  descricaoProduto: string;
  quantidade: string;
  expiraEm: string;
};

/** Cotacao que fechou com item sem vencedor: o comprador decide (excecao, encerrar ou nova solicitacao). */
export type DecisaoPendenteDto = {
  solicitacaoId: string;
  rodadaId: string;
  rodadaNumero: number;
  observacao: string | null;
  fechadaEm: string;
};

/** Convite que ainda espera o fornecedor (ou a cotacao fechar). */
export type ConviteEnviadoDto = {
  conviteId: string;
  rodadaId: string;
  /** A fila de decisao (contraproposta, encerrar agora) abre pela solicitacao. */
  solicitacaoId: string;
  rodadaNumero: number;
  fornecedorId: string;
  fornecedorNome: string;
  totalItens: number;
  respondeu: boolean;
  expiraEm: string;
  whatsapp: "pendente" | "enviado" | "falhou" | null;
};

export type PainelComprasDto = {
  semFornecedor: ItemSemFornecedorDto[];
  decisoes: DecisaoPendenteDto[];
  convites: ConviteEnviadoDto[];
};

export type LinhaPainel = {
  /** Nulo = "Sem fornecedor". */
  fornecedorId: string | null;
  fornecedorNome: string;
  celulas: Record<ColunaPainel, number>;
};

const COLUNA_DO_PEDIDO: Partial<Record<PedidoStatus, ColunaPainel>> = {
  a_fazer: "a_fazer",
  enviado: "enviado",
  cotado: "cotado",
  retornado: "retornado",
  confirmado: "confirmado",
  recebido_parcial: "recebido_parcial",
  recebido: "recebido"
};

function celulasZeradas(): Record<ColunaPainel, number> {
  return Object.fromEntries(COLUNAS_PAINEL.map((coluna) => [coluna, 0])) as Record<ColunaPainel, number>;
}

/**
 * A matriz: cada pedido conta na coluna do seu status (rascunho, aprovado e cancelado ficam fora); cada
 * convite em "Enviado" do fornecedor; item sem fornecedor e decisao pendente em "A fazer" da linha "Sem
 * fornecedor". Linhas ordenadas por nome, "Sem fornecedor" primeiro; linha sem nada nao aparece.
 */
export function montarMatrizCompras(
  painel: PainelComprasDto,
  pedidos: Array<{ status: PedidoStatus; fornecedorId: string | null; fornecedorNome: string | null }>
): LinhaPainel[] {
  const linhas = new Map<string, LinhaPainel>();
  const linha = (fornecedorId: string | null, nome: string | null) => {
    const chave = fornecedorId ?? "";
    let atual = linhas.get(chave);
    if (!atual) {
      atual = {
        fornecedorId,
        fornecedorNome: fornecedorId ? (nome ?? "Fornecedor") : "Sem fornecedor",
        celulas: celulasZeradas()
      };
      linhas.set(chave, atual);
    }
    return atual;
  };
  for (const pedido of pedidos) {
    const coluna = COLUNA_DO_PEDIDO[pedido.status];
    if (coluna) linha(pedido.fornecedorId, pedido.fornecedorNome).celulas[coluna] += 1;
  }
  for (const convite of painel.convites) linha(convite.fornecedorId, convite.fornecedorNome).celulas.enviado += 1;
  if (painel.semFornecedor.length || painel.decisoes.length)
    linha(null, null).celulas.a_fazer += painel.semFornecedor.length + painel.decisoes.length;
  return [...linhas.values()]
    .filter((item) => COLUNAS_PAINEL.some((coluna) => item.celulas[coluna] > 0))
    .sort((a, b) =>
      a.fornecedorId === null ? -1 : b.fornecedorId === null ? 1 : a.fornecedorNome.localeCompare(b.fornecedorNome)
    );
}

/** Total por coluna (rodape da matriz). */
export function totaisDaMatriz(linhas: LinhaPainel[]): Record<ColunaPainel, number> {
  const totais = celulasZeradas();
  for (const item of linhas) for (const coluna of COLUNAS_PAINEL) totais[coluna] += item.celulas[coluna];
  return totais;
}
