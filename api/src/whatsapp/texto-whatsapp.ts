// Texto da mensagem do WhatsApp. Puro e testavel.

/** Limite do resumo de itens do "pode entregar": a mensagem continua curta de ler no celular. */
export const LIMITE_RESUMO_ITENS = 600;

/** "5 Coca 2 L; 3 Coca 1,5 L; ... e mais N item(ns)": nunca passa do limite, nunca corta um item no meio. */
export function resumoDosItens(itens: string[], limite = LIMITE_RESUMO_ITENS): string {
  const partes: string[] = [];
  for (const [indice, item] of itens.entries()) {
    const restantes = itens.length - indice - 1;
    const candidato = [...partes, item].join("; ");
    const sufixo = restantes > 0 ? `; e mais ${restantes} item(ns)` : "";
    if ((candidato + sufixo).length > limite && partes.length) {
      return `${partes.join("; ")}; e mais ${itens.length - indice} item(ns)`;
    }
    partes.push(item);
  }
  return partes.join("; ");
}

/**
 * Texto variado (16/11/2026): o WhatsApp baniu o número da padaria, e mensagens idênticas em série são um dos sinais
 * de envio automático. Cada mensagem sorteia saudação, frase e fechamento entre versões com o MESMO conteúdo
 * (fornecedor, empresa, itens, prazo e link). `sorteio` devolve um número em [0, 1); nos testes ele é fixo.
 */
export type Sorteio = () => number;

function escolher<T>(opcoes: readonly T[], sorteio: Sorteio): T {
  const indice = Math.min(opcoes.length - 1, Math.floor(sorteio() * opcoes.length));
  return opcoes[Math.max(0, indice)]!;
}

const SAUDACOES = [
  (nome: string) => `Olá, ${nome}!`,
  (nome: string) => `Oi, ${nome}, tudo bem?`,
  (nome: string) => `Olá, ${nome}, tudo bem?`,
  (nome: string) => `${nome}, tudo certo?`
] as const;

const FRASES_DA_COTACAO = [
  (empresa: string, itens: number) => `A ${empresa} tem uma cotação de ${itens} item(ns) para você.`,
  (empresa: string, itens: number) => `A ${empresa} abriu uma cotação com ${itens} item(ns) e quer o seu preço.`,
  (empresa: string, itens: number) => `Tem cotação nova da ${empresa} para você: ${itens} item(ns).`,
  (empresa: string, itens: number) => `A ${empresa} gostaria do seu preço em ${itens} item(ns).`
] as const;

const FECHAMENTOS_DA_COTACAO = [
  (prazo: string, link: string) => `Responda até ${prazo}: ${link}`,
  (prazo: string, link: string) => `O prazo para responder é ${prazo}. É só abrir: ${link}`,
  (prazo: string, link: string) => `Mande seus preços até ${prazo} por este link: ${link}`,
  (prazo: string, link: string) => `Pode responder até ${prazo}, por aqui: ${link}`
] as const;

const FRASES_DO_PEDIDO = [
  (empresa: string) => `A ${empresa} comprou estes produtos de você. Pode separar e entregar.`,
  (empresa: string) => `Pedido confirmado pela ${empresa}! Pode separar e entregar estes produtos.`,
  (empresa: string) => `A ${empresa} fechou a compra destes produtos com você. Pode separar e entregar.`,
  (empresa: string) => `Boa notícia: a ${empresa} comprou de você. Pode separar e entregar.`
] as const;

export function textoDoConvite(
  dados: { fornecedorNome: string; empresaNome: string; totalItens: number; prazo: string; link: string },
  sorteio: Sorteio = Math.random
): string {
  return [
    escolher(SAUDACOES, sorteio)(dados.fornecedorNome),
    escolher(FRASES_DA_COTACAO, sorteio)(dados.empresaNome, dados.totalItens),
    escolher(FECHAMENTOS_DA_COTACAO, sorteio)(dados.prazo, dados.link)
  ].join("\n\n");
}

export function textoDoPedidoConfirmado(
  dados: { fornecedorNome: string; empresaNome: string; resumo: string },
  sorteio: Sorteio = Math.random
): string {
  return [
    escolher(SAUDACOES, sorteio)(dados.fornecedorNome),
    escolher(FRASES_DO_PEDIDO, sorteio)(dados.empresaNome),
    dados.resumo
  ].join("\n\n");
}
