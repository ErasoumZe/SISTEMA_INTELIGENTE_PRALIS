import type { ClassificacaoFiscal, ResultadoFiscal } from "@padaria/shared";
import type { ProdutoForm } from "~/composables/produto-formulario-mapa";
import { useConsultaAoVivo } from "~/composables/useConsultaAoVivo";

/** Pausa antes de classificar: o nome muda a cada tecla; grupo e EAN mudam de uma vez. */
export const ATRASO_DA_CLASSIFICACAO = 400;

/**
 * Classificacao fiscal AO VIVO (F3, decisao D2; paralelo `ProductForm.vue` watch de grupo e EAN): o que
 * a gravacao aplicaria com o grupo, o EAN e o nome que estao na tela. So MOSTRA — nao escreve no
 * `form.fiscal`: quem grava e o servidor, que reclassifica ao salvar quando grupo ou EAN mudam. Escrever
 * aqui faria quem nao e admin mandar fiscal diferente do gravado e levar `ONLY_ADMIN_FISCAL`.
 */
export function useClassificacaoFiscalAoVivo(entrada: {
  form: Ref<ProdutoForm>;
  empresaId: Ref<string>;
  /** So a LOJA tem cartao fiscal; na BASE nao ha o que mostrar. */
  ativo: Ref<boolean>;
}) {
  const { apiPost } = useApi();
  const consulta = useConsultaAoVivo(
    (corpo: { empresaId: string; grupoMercadoriaId: string; codigoBarras: string | null; nome: string | null }) =>
      apiPost<ResultadoFiscal>("/api/produtos/fiscal/classificar", corpo),
    ATRASO_DA_CLASSIFICACAO
  );

  watch(
    () =>
      [
        entrada.ativo.value,
        entrada.empresaId.value,
        entrada.form.value.grupoMercadoriaId,
        entrada.form.value.codigoBarras,
        entrada.form.value.nomeCatalogo
      ] as const,
    ([ativo, empresaId, grupoMercadoriaId, codigoBarras, nome]) => {
      // Sem grupo nao ha regra fiscal a aplicar (o paralelo tambem nao consulta).
      if (!ativo || !empresaId || !grupoMercadoriaId) return consulta.agendar(null);
      consulta.agendar({
        empresaId,
        grupoMercadoriaId,
        codigoBarras: codigoBarras?.trim() || null,
        nome: nome?.trim() || null
      });
    }
  );

  const classificacao = computed<ClassificacaoFiscal | null>(() => consulta.resultado.value?.classificacao ?? null);
  return { classificacao, classificando: consulta.carregando };
}
