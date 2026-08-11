// Credor permitido por categoria de lancamento — B-04.
//
// Vive fora do `useOperacaoLancamento` porque a regra tem DOIS leitores: os chips do formulario e a
// troca de categoria. Enquanto ela esteve escrita nos dois lugares, os dois discordaram — o mapa
// dizia que a mercadoria so aceita fornecedor e a troca de categoria deixava `credorTipo` e
// `socioGestorId` para tras, que voltavam pelo payload. Uma definicao so.
//
// Fonte: FOTO 2 (PROJECT_BRAIN/14_TELAS_RODRIGO_TRANSCRICAO.md §"Tipo de credor") e R-128.
import type { EntidadeOperacional, OperacaoForm } from "~/types/padaria";

export type TipoCredor = "fornecedor" | "colaborador" | "socio_gestor";

/** Categorias de lancamento que tem credor tipado. Venda e transferencia nao tem. */
export type CategoriaComCredor = "despesa" | "mercadoria" | "retirada";

// R-128: colaborador saiu da RETIRADA nova — segue no historico, e o registro ja gravado com ele
// reabre no tipo certo pelo caminho do credor legado (`useOperacaoLancamento`).
export const CREDORES_POR_CATEGORIA: Record<CategoriaComCredor, TipoCredor[]> = {
  despesa: ["fornecedor", "colaborador"],
  mercadoria: ["fornecedor"],
  retirada: ["fornecedor", "socio_gestor"]
};

const CAMPO_DO_CREDOR: Record<TipoCredor, "fornecedorId" | "colaboradorId" | "socioGestorId"> = {
  fornecedor: "fornecedorId",
  colaborador: "colaboradorId",
  socio_gestor: "socioGestorId"
};

export function categoriaTemCredor(entidade: EntidadeOperacional): entidade is CategoriaComCredor {
  return entidade === "despesa" || entidade === "mercadoria" || entidade === "retirada";
}

/**
 * Zera do formulario o credor que a categoria de destino nao aceita.
 *
 * Sem isto o id do credor antigo continua no estado depois que o campo some da tela e viaja no
 * payload (`montarPayloadOperacao` emite os tres ids em toda entidade). Era assim que uma despesa
 * com colaborador virava retirada com colaborador — gravada, contra a R-128 — e que a mercadoria
 * saia com `colaboradorId` para ser descartado em silencio pelo zod.
 */
export function limparCredorIncompativel(form: OperacaoForm, entidade: EntidadeOperacional): void {
  if (!categoriaTemCredor(entidade)) return;
  const permitidos = CREDORES_POR_CATEGORIA[entidade];
  for (const tipo of Object.keys(CAMPO_DO_CREDOR) as TipoCredor[]) {
    if (!permitidos.includes(tipo)) form[CAMPO_DO_CREDOR[tipo]] = "";
  }
  if (form.credorTipo && !permitidos.includes(form.credorTipo)) form.credorTipo = "";
}
