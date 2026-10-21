/**
 * Fase 2 do Compras — o link da rodada que o Comprador manda a cada fornecedor convidado.
 *
 * Mesmo formato da cotacao (R-216): `https://.../rodada#t=<token>`. O token fica no FRAGMENTO, a
 * unica parte da URL que o navegador nao manda ao servidor — nao vai para log, `Referer` nem
 * `req.url`. Um token por convite; o fornecedor ve so o que e dele (isolamento comercial, E4).
 */
import { ROTA_RODADA } from "~/utils/rotas-publicas";

/** Precisa casar com o cabecalho que a API publica da rodada vai ler (E4) e com o CORS. */
export const CABECALHO_DA_RODADA = "x-rodada-token";

/** A `origem` e a do navegador do Comprador (mesmo motivo de `linkDaCotacao`). */
export function linkDaRodada(origem: string, token: string): string {
  const limpo = token.trim();
  if (!origem.trim() || !limpo) return "";
  return new URL(`${ROTA_RODADA}#t=${encodeURIComponent(limpo)}`, origem).toString();
}

/** Mensagem curta de WhatsApp — o conteudo da cotacao mora no link, nao no texto. */
export function mensagemDaRodada(entrada: {
  fornecedorNome: string;
  empresaNome: string;
  totalItens: number;
  link: string;
  prazo: string;
}): string {
  return [
    `Olá, ${entrada.fornecedorNome}!`,
    `A ${entrada.empresaNome} abriu uma cotação de ${entrada.totalItens} item(ns).`,
    `Envie seus valores por este link: ${entrada.link}`,
    `O link vale até ${entrada.prazo}.`
  ].join("\n\n");
}
