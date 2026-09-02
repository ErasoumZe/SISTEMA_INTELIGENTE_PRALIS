/**
 * ADM-003 V3 — o token do convite, que chega no FRAGMENTO do link.
 *
 * `https://.../admissao#t=<token>`. O fragmento e a unica parte da URL que o navegador **nao**
 * manda ao servidor: ele nao entra no log de acesso, nao vai no `Referer` e nao aparece em
 * `req.url`. Query (`?t=`) e caminho (`/admissao/<token>`) fazem as tres coisas — e este projeto ja
 * pagou por isso no link de recuperacao de senha, que carrega o token no caminho.
 *
 * Extraido do componente para ser testavel sem runtime Nuxt, pelo mesmo motivo de
 * `utils/rotas-publicas.ts`.
 */

/** Le o token de um fragmento. Aceita com ou sem o `#`, e ignora o que nao souber ler. */
export function tokenDoFragmento(fragmento: string): string {
  const cru = fragmento.startsWith("#") ? fragmento.slice(1) : fragmento;
  if (!cru) return "";
  const valor = new URLSearchParams(cru).get("t");
  return valor?.trim() ?? "";
}

/**
 * O nome do cabecalho. Uma constante, e nao a string solta em cada chamada: o CORS da API declara
 * `allowedHeaders` fixo, entao o nome tem de casar exatamente nos dois lados.
 */
export const CABECALHO_DO_CONVITE = "x-admissao-convite";
