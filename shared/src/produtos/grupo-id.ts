/**
 * ID do grupo no PDV, resolvido pelo NOME do grupo — copiado literalmente do paralelo
 * (`stack/api/src/modules/product/grupo-id-planilha.ts`, R-222, F7 do doc 56).
 *
 * O ID do grupo nao e coisa que uma pessoa digita: vem da aba oficial (AC/AD da aba de IDs de grupo).
 * Sem ele o TXT do CREARE recusa o produto com "Codigo do grupo: nao existe de-para".
 */

/** A planilha contem U+2060 invisivel em varios nomes de grupo. */
export const chaveDeGrupo = (nome: string | null | undefined): string =>
  String(nome ?? "")
    .replace(/\p{Cf}/gu, "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

/** Zero e marcador de campo vazio no layout, nao um ID de grupo utilizavel. */
export const grupoIdPreenchido = (id: string | null | undefined): boolean =>
  Boolean(id?.trim() && !/^0+$/.test(id.trim()));

/**
 * Le a faixa AC5:AD da aba oficial: cabecalho "NOME GRUPO" / "ID GRUPO" e um par por linha.
 * Recusa IDs nao numericos e nomes que apontam para dois IDs diferentes (ficam `null` = ambiguo).
 * Devolve `null` quando a faixa nao tem o cabecalho esperado ou nenhum par valido (fonte invalida).
 */
export function lerGrupoIds(linhas: string[][]): Map<string, string | null> | null {
  if (chaveDeGrupo(linhas[0]?.[0]) !== "NOME GRUPO" || chaveDeGrupo(linhas[0]?.[1]) !== "ID GRUPO") {
    return null;
  }
  const ids = new Map<string, string | null>();
  for (const [nome = "", codigo = ""] of linhas.slice(1)) {
    const chave = chaveDeGrupo(nome);
    const id = String(codigo).trim();
    if (!chave || !/^\d{1,4}$/.test(id) || Number(id) === 0) continue;
    const anterior = ids.get(chave);
    if (anterior !== undefined && anterior !== id) ids.set(chave, null);
    else if (anterior === undefined) ids.set(chave, id);
  }
  return ids.size ? ids : null;
}

/**
 * O ID do grupo que a gravacao de uma PESSOA deixa no produto (paralelo `product.service.ts`):
 * - criacao: o ID oficial do nome do grupo (pode ficar vazio; o TXT tenta de novo pelo nome);
 * - grupo trocado, ou ID ainda vazio/"000": o oficial do novo nome; sem oficial, mantem o atual;
 * - nos demais casos, mantem o atual.
 * O ID digitado nao entra: "nao e coisa que uma pessoa digita" (o formulario do paralelo nao tem o campo).
 */
export function grupoIdDaEntrada(entrada: {
  atual: string | null | undefined;
  criacao: boolean;
  grupoMudou: boolean;
  oficial: string | null;
}): string | null {
  const atual = entrada.atual?.trim() || null;
  if (entrada.criacao) return entrada.oficial;
  if (entrada.grupoMudou || !grupoIdPreenchido(atual)) return entrada.oficial ?? atual;
  return atual;
}

/** O nome como a pessoa le: sem os separadores invisiveis da planilha e sem espaco duplo, com acento. */
export const nomeLimpoDeGrupo = (nome: string | null | undefined): string =>
  String(nome ?? "")
    .replace(/\p{Cf}/gu, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Os grupos oficiais da mesma faixa AC5:AD, para CRIAR os grupos da loja (fase B1, 29/10/2026): nome limpo e
 * ID, na ordem da planilha. Linha sem ID valido fica de fora; o mesmo grupo repetido entra uma vez.
 * Devolve `null` sem o cabecalho oficial (fonte invalida).
 */
export function gruposOficiaisDaFaixa(linhas: string[][]): Array<{ nome: string; id: string }> | null {
  if (chaveDeGrupo(linhas[0]?.[0]) !== "NOME GRUPO" || chaveDeGrupo(linhas[0]?.[1]) !== "ID GRUPO") {
    return null;
  }
  const vistos = new Set<string>();
  const grupos: Array<{ nome: string; id: string }> = [];
  for (const [nome = "", codigo = ""] of linhas.slice(1)) {
    const chave = chaveDeGrupo(nome);
    const id = String(codigo).trim();
    if (!chave || !/^\d{1,4}$/.test(id) || Number(id) === 0 || vistos.has(chave)) continue;
    vistos.add(chave);
    grupos.push({ nome: nomeLimpoDeGrupo(nome), id });
  }
  return grupos;
}

/** ID oficial do grupo, ou `null` quando ausente, ambiguo ou sem fonte. */
export function grupoIdDoNome(ids: Map<string, string | null> | null, nome: string | null | undefined): string | null {
  const chave = chaveDeGrupo(nome);
  if (!ids || !chave) return null;
  return ids.get(chave) ?? null;
}
