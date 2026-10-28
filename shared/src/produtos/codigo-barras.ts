import { chaveDeBarras } from "./sia-depara.js";

/**
 * Variantes de um codigo de barras para BUSCA por igualdade — porte de `barcodeCandidates` do app
 * oficial (`tax-rule.service.ts`), a mesma regra que o fiscal e as vendas usam la:
 *
 *  - so digitos e sem os zeros a esquerda ("0000789" e "789" sao o mesmo produto);
 *  - EAN de balanca (13 digitos comecando com 2) tambem vira o PLU que ele carrega (posicoes 2 a 6),
 *    sem zeros a esquerda: a etiqueta "2128050024901" acha o produto de PLU "12805".
 *
 * Igualdade, e nao busca parcial: codigo de barras e identidade, e um pedaco de EAN traria outro
 * produto por engano. Texto sem digito devolve lista vazia (a busca por nome continua por conta dela).
 */
export function variantesDeCodigoDeBarras(codigo: string | null | undefined): string[] {
  const digitos = String(codigo ?? "").replace(/\D/gu, "");
  const variantes = new Set<string>();
  if (digitos) variantes.add(chaveDeBarras(digitos));
  if (digitos.length === 13 && digitos.startsWith("2")) variantes.add(chaveDeBarras(digitos.slice(1, 6)));
  return [...variantes];
}
