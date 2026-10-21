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

// ADM-003 V3: a ficha do candidato. Nao e tela de autenticacao — e a unica tela do sistema aberta
// a quem NAO tem conta. O acesso e provado pelo token do convite, no header, e a pagina nao monta
// AppWorkspace nem le sessao.
//
// Constante nomeada porque agora ha DOIS leitores: esta allowlist e o montador do link que o DP
// entrega ao candidato (`linkDoConvite`). Se o caminho mudar, os dois mudam juntos — com a string
// solta em cada lugar, o link continuaria apontando para a rota velha sem ninguem perceber.
export const ROTA_ADMISSAO = "/admissao";

// R-216: a cotacao do fornecedor. Mesma natureza da ficha de admissao — quem abre nao tem conta, o
// acesso e provado pelo token no cabecalho e a pagina nao monta AppWorkspace. Constante pelo mesmo
// motivo: o montador do link (`linkDaCotacao`) e a allowlist precisam mudar juntos.
export const ROTA_COTACAO = "/cotacao";

// Fase 2 do Compras: a pagina publica do fornecedor na rodada multi-fornecedor. Mesma natureza da
// cotacao (sem conta, token no cabecalho, sem AppWorkspace). O montador do link (`linkDaRodada`) e
// esta allowlist mudam juntos. A pagina em si entra no E4; a constante ja existe porque o link e
// gerado na abertura da rodada (E3).
export const ROTA_RODADA = "/rodada";

export const ROTAS_PUBLICAS: ReadonlySet<string> = new Set([
  "/login",
  "/forgot-password",
  "/reset-password",
  ROTA_ADMISSAO,
  ROTA_COTACAO,
  ROTA_RODADA
]);

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
