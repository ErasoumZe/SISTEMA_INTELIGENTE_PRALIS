// Classificacao de rota PUBLICA x protegida, extraida do `middleware/auth.global.ts` para ser
// testavel sem runtime Nuxt (mesmo padrao dos demais utils desta pasta).
//
// Por que existe: a API redireciona a recuperacao de senha para `/reset-password?token=...`, o
// Nginx normaliza para `/reset-password/?token=...`, e a comparacao exata contra a allowlist nao
// casava com a barra final. O visitante (que por definicao nao tem sessao) caia em `/login` e
// perdia o link do e-mail — em producao, com o token ainda valido na mao.
//
// A correcao normaliza SO o pathname usado na comparacao. Nao se amplia a allowlist por prefixo:
// `/reset-password/qualquer-coisa` continua protegida, porque so a barra FINAL e removida.

export const ROTAS_PUBLICAS: ReadonlySet<string> = new Set(["/login", "/forgot-password", "/reset-password"]);

// Remove barras finais, preservando a raiz. `/reset-password/` e `/reset-password//` viram
// `/reset-password`; `/` continua `/`.
//
// Deliberadamente conservador: nao mexe em maiusculas, nao resolve segmentos e nao toca em query
// nem hash (o `to.path` do Vue Router ja vem sem eles). Qualquer normalizacao alem desta poderia
// tornar publica uma rota que ninguem decidiu abrir.
export function normalizarCaminhoRota(caminho: string): string {
  if (!caminho) return "/";
  const semBarrasFinais = caminho.replace(/\/+$/u, "");
  return semBarrasFinais || "/";
}

export function ehRotaPublica(caminho: string): boolean {
  return ROTAS_PUBLICAS.has(normalizarCaminhoRota(caminho));
}
