import { promocaoVazia, type PromocaoForm } from "~/composables/produto-formulario-mapa";

/**
 * Promocao UNICA, como no paralelo: "Sem promocao / Valor fixo / Desconto %". O ERP guarda uma lista;
 * a tela edita a PRIMEIRA. Promocoes a mais (ou com validade, que o paralelo nao tem) vindas de antes
 * NAO sao apagadas: continuam na lista e vao no payload como vieram.
 */
export type TipoDePromocaoNaTela = "nenhum" | "valor" | "desconto";

export function tipoDaPromocao(promocoes: readonly PromocaoForm[]): TipoDePromocaoNaTela {
  return promocoes[0]?.tipo ?? "nenhum";
}

/** Troca o tipo na tela. "Sem promoção" tira so a primeira; as legadas ficam. */
export function aplicarTipoDePromocao(promocoes: PromocaoForm[], tipo: TipoDePromocaoNaTela): void {
  const primeira = promocoes[0];
  if (tipo === "nenhum") {
    if (primeira) promocoes.splice(0, 1);
    return;
  }
  if (primeira) primeira.tipo = tipo;
  else promocoes.push({ ...promocaoVazia(), tipo });
}

/** Ha promocao que a tela unica nao mostra inteira (mais de uma, ou com validade)? */
export function temPromocaoLegada(promocoes: readonly PromocaoForm[]): boolean {
  return promocoes.length > 1 || promocoes.some((promo) => Boolean(promo.validaAte));
}
