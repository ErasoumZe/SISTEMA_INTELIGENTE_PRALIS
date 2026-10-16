/**
 * R-216 — o link da cotacao que o Comprador manda ao fornecedor.
 *
 * Mesmo formato da ficha de admissao: `https://.../cotacao#t=<token>`. O token fica no FRAGMENTO,
 * a unica parte da URL que o navegador nao manda ao servidor — nao vai para log de acesso, para o
 * `Referer` nem para `req.url`. O leitor e o mesmo `tokenDoFragmento` da admissao.
 */
import { ROTA_COTACAO } from "~/utils/rotas-publicas";

/** Precisa casar com `CABECALHO_DA_COTACAO` da API e com o `allowedHeaders` do CORS. */
export const CABECALHO_DA_COTACAO = "x-cotacao-token";

/** A `origem` e a do navegador do Comprador, pelo mesmo motivo de `linkDoConvite`. */
export function linkDaCotacao(origem: string, token: string): string {
  const limpo = token.trim();
  if (!origem.trim() || !limpo) return "";
  return new URL(`${ROTA_COTACAO}#t=${encodeURIComponent(limpo)}`, origem).toString();
}

/**
 * Mensagem que vai no WhatsApp. Curta de proposito: o conteudo do pedido mora no formulario, e um
 * texto longo com itens viraria a "resposta" que o fornecedor responde por texto livre — o caminho
 * que a R-216 substitui.
 */
export function mensagemDaCotacao(entrada: {
  fornecedorNome: string;
  empresaNome: string;
  totalItens: number;
  link: string;
  prazo: string;
}): string {
  return [
    `Olá, ${entrada.fornecedorNome}!`,
    `A ${entrada.empresaNome} precisa de uma cotação de ${entrada.totalItens} item(ns).`,
    `Preencha os valores por este link: ${entrada.link}`,
    `Você pode salvar e continuar depois. O link vale até ${entrada.prazo}.`
  ].join("\n\n");
}
