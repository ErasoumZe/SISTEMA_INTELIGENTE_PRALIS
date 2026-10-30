import type { ColunaCotacao, OfertaDoProdutoDto } from "@padaria/shared";
import type { TomSituacao } from "~/utils/compras-visual";
import { podeAprovarProposta } from "~/utils/decisao-compras";

// Apresentacao da Cotacao por fornecedor (doc 58 §4). Pura: nao conhece API nem componente.

export const TOM_SITUACAO: Record<ColunaCotacao, TomSituacao> = {
  enviado: "neutro",
  cotado: "info",
  retornado: "marca",
  com_aumento: "atencao",
  comprado: "positivo"
};

/** A cotacao do produto e organizada pelo que o comprador faz com cada oferta, nao pela coluna da matriz. */
export type GrupoDaCotacao = "decidir" | "aguardando" | "sem_oferta" | "comprado";

export const TITULO_DO_GRUPO: Record<GrupoDaCotacao, string> = {
  decidir: "Para você decidir",
  aguardando: "Aguardando o fornecedor",
  sem_oferta: "Sem oferta",
  comprado: "Comprado"
};

export const AJUDA_DO_GRUPO: Record<GrupoDaCotacao, string> = {
  decidir: "Não compraram sozinhas. Aceite, contraproponha ou espere as outras respostas.",
  aguardando: "Ainda não responderam ou salvaram sem enviar.",
  sem_oferta: "Não têm o produto ou o produto já foi comprado de outro.",
  comprado: "Já é pedido: acompanhe em Pedidos a receber."
};

const ORDEM_DOS_GRUPOS: GrupoDaCotacao[] = ["decidir", "aguardando", "sem_oferta", "comprado"];

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

export function grupoDaOferta(oferta: OfertaDoProdutoDto, comprados: Set<string>): GrupoDaCotacao {
  if (oferta.situacao === "comprado") return "comprado";
  if (oferta.situacao === "enviado" || oferta.situacao === "cotado") return "aguardando";
  return podeAceitarOferta(oferta, comprados) ? "decidir" : "sem_oferta";
}

/** As ofertas por grupo, na ordem de decisao; dentro do grupo, a mais barata primeiro. Grupo vazio nao aparece. */
export function ofertasAgrupadas(ofertas: OfertaDoProdutoDto[]) {
  const comprados = itensComprados(ofertas);
  const custo = (oferta: OfertaDoProdutoDto) =>
    oferta.custoFinalUnitario === null ? Number.POSITIVE_INFINITY : Number(oferta.custoFinalUnitario);
  return ORDEM_DOS_GRUPOS.map((grupo) => ({
    grupo,
    ofertas: ofertas
      .filter((oferta) => grupoDaOferta(oferta, comprados) === grupo)
      .sort((a, b) => custo(a) - custo(b) || a.fornecedorNome.localeCompare(b.fornecedorNome))
  })).filter((linha) => linha.ofertas.length);
}

/** As cotacoes (rodadas) em que o produto esta, uma vez cada, da mais nova para a mais antiga. */
export function cotacoesDoProduto(ofertas: OfertaDoProdutoDto[]) {
  const vistas = new Map<string, { rodadaId: string; abertaEm: string; rodadaAberta: boolean; expiraEm: string }>();
  for (const oferta of ofertas)
    if (!vistas.has(oferta.rodadaId))
      vistas.set(oferta.rodadaId, {
        rodadaId: oferta.rodadaId,
        abertaEm: oferta.abertaEm,
        rodadaAberta: oferta.rodadaAberta,
        expiraEm: oferta.expiraEm
      });
  return [...vistas.values()].sort((a, b) => b.abertaEm.localeCompare(a.abertaEm));
}
