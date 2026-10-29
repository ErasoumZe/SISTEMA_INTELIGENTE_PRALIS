/**
 * Listas fixas do cadastro de produto — as MESMAS do cadastro paralelo (app da loja, `ProductForm`).
 *
 * Onde o ERP guarda texto (embalagem, medida de compra, setor de estoque, unidade da transformação),
 * a tela oferece a lista fixa. A medida base é FK para `unidades_medida`: aí a lista FILTRA as
 * unidades da empresa pela sigla. Valor já gravado que não está na lista continua aparecendo —
 * esconder o que o produto tem seria apagar o dado na próxima edição.
 */

export const MEDIDAS_BASE = ["UN", "KG", "G", "LT", "ML"] as const;
export const MEDIDAS_COMPRA = ["UN", "KG", "LT"] as const;
export const EMBALAGENS = ["UN", "KG", "LT", "MIL", "FD", "PCT", "CX", "POTE", "EMB", "SACO", "BAND"] as const;
export const UNIDADES_TRANSFORMACAO = ["UN", "G", "ML"] as const;
export const SETORES_ESTOQUE = [
  "LJ - CAIXAS",
  "LJ - VITRINES",
  "LJ - ESTOQUE  LOJA",
  "LJ - TREINAMENTO",
  "PROD. - PANIFICAÇÃO",
  "PROD. - CONFEITARIA",
  "PROD. - ESTOQUE PRODUÇÃO"
] as const;

/** Área de venda da TNP — os valores aceitos pelo contrato (`areaVenda` em `shared/src/produtos`). */
export const AREAS_VENDA_TNP = [
  { value: "caixa", title: "Caixa" },
  { value: "vitrine", title: "Vitrine" },
  { value: "copa", title: "Copa" },
  { value: "chapa", title: "Chapa" },
  { value: "mesas", title: "Mesas" },
  { value: "vasca_paes", title: "Vasca de pães" },
  { value: "vitrine_paes", title: "Vitrine de pães" },
  { value: "paes_empacotados", title: "Pães empacotados" },
  { value: "mesa_paes", title: "Mesa de pães" },
  { value: "frios", title: "Frios" },
  { value: "bebidas", title: "Bebidas" },
  { value: "laticinios", title: "Laticínios" },
  { value: "mercearia", title: "Mercearia" },
  { value: "estoque_bebidas", title: "Estoque de bebidas" },
  { value: "biscoitos", title: "Biscoitos" },
  { value: "dml_limpeza", title: "DML / limpeza" }
] as const;

/**
 * Sinônimos de sigla no cadastro de Unidades do ERP. O seed de produção cria o litro como "L"
 * (`db/seed-referencia-prod.ts`), e o paralelo chama de "LT": sem isto, litro sumiria da lista.
 */
const SINONIMOS_DE_SIGLA: Record<string, string> = { L: "LT" };

export function siglaCanonica(sigla: string | null | undefined): string {
  const limpa = String(sigla ?? "")
    .trim()
    .toUpperCase();
  return SINONIMOS_DE_SIGLA[limpa] ?? limpa;
}

/** Lista fixa + o valor atual quando ele não está nela (legado não some da tela). */
export function opcoesComAtual(lista: readonly string[], atual: string | null | undefined): string[] {
  const opcoes = [...lista];
  if (atual && !opcoes.includes(atual)) opcoes.unshift(atual);
  return opcoes;
}

/**
 * Unidades da empresa cuja sigla está na lista fixa, na ORDEM da lista. A unidade já escolhida
 * entra mesmo fora da lista. Sem diferenciar maiúscula: o cadastro de Unidades grava "kg", "un".
 */
export function unidadesDaLista<T extends { id: string; sigla: string }>(
  unidades: readonly T[],
  lista: readonly string[],
  atualId?: string | null
): T[] {
  const escolhidas: T[] = [];
  for (const sigla of lista) {
    const unidade = unidades.find((item) => siglaCanonica(item.sigla) === sigla);
    if (unidade && !escolhidas.includes(unidade)) escolhidas.push(unidade);
  }
  const atual = atualId ? unidades.find((item) => item.id === atualId) : undefined;
  if (atual && !escolhidas.includes(atual)) escolhidas.unshift(atual);
  return escolhidas;
}
