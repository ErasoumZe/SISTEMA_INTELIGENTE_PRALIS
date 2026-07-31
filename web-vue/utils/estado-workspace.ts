import type { DadosExternos } from "@padaria/shared/api";

// Estado do workspace (`useState("padaria.workspace.*")`) sobrevive a navegacao client-side: ele
// vive no payload do Nuxt, nao no componente. Sem limpeza explicita, o `sessao` do usuario ANTERIOR
// continua carregado depois do logout — e o `onMounted` do AppWorkspace, vendo `workspaceCarregado`
// verdadeiro, RETORNA sem recarregar. O sistema passa a avaliar permissao do usuario errado.
//
// Por isso a limpeza e por PREFIXO, e nao uma lista de chaves: chave nova de workspace nasce
// coberta. Enquanto isso nao existir, nenhum teste de permissao vale.
export const PREFIXO_ESTADO_WORKSPACE = "padaria.workspace.";

// No Nuxt, `useState(chave)` e um `toRef` sobre `payload.state["$s" + chave]`. Apagar a propriedade
// zera a ref existente e faz o proximo `useState` rodar o inicializador de novo.
const PREFIXO_PAYLOAD = `$s${PREFIXO_ESTADO_WORKSPACE}`;

export function chavesEstadoWorkspace(estado: Record<string, DadosExternos>): string[] {
  return Object.keys(estado).filter((chave) => chave.startsWith(PREFIXO_PAYLOAD));
}

// Devolve quantas chaves foram removidas — o teste usa isso para provar que limpou de fato, em vez
// de confiar que "nao quebrou".
export function limparEstadoWorkspace(estado: Record<string, DadosExternos>): number {
  const chaves = chavesEstadoWorkspace(estado);
  for (const chave of chaves) delete estado[chave];
  return chaves.length;
}
