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

import { ROTA_ADMISSAO } from "~/utils/rotas-publicas";

/** Le o token de um fragmento. Aceita com ou sem o `#`, e ignora o que nao souber ler. */
export function tokenDoFragmento(fragmento: string): string {
  const cru = fragmento.startsWith("#") ? fragmento.slice(1) : fragmento;
  if (!cru) return "";
  const valor = new URLSearchParams(cru).get("t");
  return valor?.trim() ?? "";
}

/**
 * Monta o link que o DP entrega ao candidato. E o ESCRITOR do formato que `tokenDoFragmento` le, e
 * por isso mora no mesmo arquivo: se o `#t=` mudar, leitor e escritor mudam na mesma edicao.
 *
 * A `origem` vem de quem chama — na pratica `window.location.origin`, a origem do proprio
 * navegador do DP. Nao ha configuracao para isso, e nao deve haver: em producao o app e servido na
 * RAIZ do dominio por tras do proxy, e o build nao sabe qual e o dominio publico. Quem sabe e o
 * navegador que esta com a tela aberta. O `WEB_ORIGIN` do servidor e outra coisa: e a origem que a
 * API aceita no CORS, nao necessariamente a que o DP usa.
 *
 * Barra final da origem e tolerada porque `new URL` normaliza — e porque quem passa a origem um dia
 * pode passar `https://host/` sem perceber.
 */
export function linkDoConvite(origem: string, token: string): string {
  const limpo = token.trim();
  if (!origem.trim() || !limpo) return "";
  return new URL(`${ROTA_ADMISSAO}#t=${encodeURIComponent(limpo)}`, origem).toString();
}

/**
 * O nome do cabecalho. Uma constante, e nao a string solta em cada chamada: o CORS da API declara
 * `allowedHeaders` fixo, entao o nome tem de casar exatamente nos dois lados.
 */
export const CABECALHO_DO_CONVITE = "x-admissao-convite";
