import type { ColunaCotacao, OfertaDoProdutoDto } from "@padaria/shared";
import { podeAprovarProposta } from "~/utils/decisao-compras";

// Apresentacao da Cotacao por fornecedor (doc 58 §4). Pura: nao conhece API nem componente.

export const COR_SITUACAO: Record<ColunaCotacao, string> = {
  enviado: "secondary",
  cotado: "info",
  retornado: "primary",
  com_aumento: "warning",
  comprado: "success"
};

// Na cotacao do produto, o que pede decisao vem primeiro.
export const ORDEM_DAS_SITUACOES: ColunaCotacao[] = ["com_aumento", "retornado", "cotado", "enviado", "comprado"];

export const TITULO_DA_SITUACAO: Record<ColunaCotacao, string> = {
  com_aumento: "Com aumento — acima da referência",
  retornado: "Retornado",
  cotado: "Cotado — salvou, ainda não enviou",
  enviado: "Enviado — ainda não respondeu",
  comprado: "Comprado"
};

/** Itens (da cotacao) que ja tem vencedor: as outras ofertas deles nao se aceitam mais. */
export function itensComprados(ofertas: OfertaDoProdutoDto[]): Set<string> {
  return new Set(ofertas.filter((oferta) => oferta.situacao === "comprado").map((oferta) => oferta.rodadaItemId));
}

/** Aceitar: oferta enviada, com preco e custo calculado, num item que ninguem ganhou ainda. */
export function podeAceitarOferta(oferta: OfertaDoProdutoDto, comprados: Set<string>): boolean {
  return (
    oferta.propostaItemId !== null &&
    oferta.situacao !== "comprado" &&
    !comprados.has(oferta.rodadaItemId) &&
    podeAprovarProposta(oferta)
  );
}

/** Contrapropor: so com a cotacao aberta, para quem ja respondeu com preco. */
export function podeContraproporOferta(oferta: OfertaDoProdutoDto, comprados: Set<string>): boolean {
  return (
    oferta.rodadaAberta && oferta.propostaItemId !== null && !oferta.indisponivel && !comprados.has(oferta.rodadaItemId)
  );
}

/** As ofertas por situacao, na ordem de decisao; situacao vazia nao aparece. */
export function ofertasPorSituacao(ofertas: OfertaDoProdutoDto[]) {
  return ORDEM_DAS_SITUACOES.map((situacao) => ({
    situacao,
    ofertas: ofertas.filter((oferta) => oferta.situacao === situacao)
  })).filter((grupo) => grupo.ofertas.length);
}

/** As cotacoes (rodadas) em que o produto esta, uma vez cada. */
export function cotacoesDoProduto(ofertas: OfertaDoProdutoDto[]) {
  const vistas = new Map<string, { rodadaId: string; rodadaNumero: number; rodadaAberta: boolean; expiraEm: string }>();
  for (const oferta of ofertas)
    if (!vistas.has(oferta.rodadaId))
      vistas.set(oferta.rodadaId, {
        rodadaId: oferta.rodadaId,
        rodadaNumero: oferta.rodadaNumero,
        rodadaAberta: oferta.rodadaAberta,
        expiraEm: oferta.expiraEm
      });
  return [...vistas.values()];
}
