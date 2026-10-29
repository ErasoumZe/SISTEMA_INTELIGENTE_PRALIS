import type { ProdutoForm } from "~/composables/produto-formulario-mapa";
import { useConsultaAoVivo } from "~/composables/useConsultaAoVivo";

/** Pausa do paralelo antes de procurar o EAN digitado. */
export const ATRASO_DO_AVISO_DE_EAN = 500;
/** Menos que isso nao significa nada como codigo de barras (paralelo). */
const DIGITOS_MINIMOS = 6;

type Achado = { id: string; nome: string; codigoInterno: string | null };

/**
 * Aviso de EAN repetido AO DIGITAR (F4, decisao D2; paralelo `ProductForm.vue` "barrasJaExiste"). Salvar
 * ja recusava o duplicado — mas descobrir so depois de preencher tudo e o que faz a pessoa forcar.
 * AVISO, nunca bloqueio: existe caso legitimo de mesmo EAN (kit, fracionado). O proprio produto em
 * edicao nao conta. Na BASE procura no catalogo BASE; na loja, na empresa do formulario.
 */
export function useAvisoDeEanRepetido(entrada: {
  form: Ref<ProdutoForm>;
  empresaId: Ref<string>;
  produtoId: Ref<string | null>;
  modo: Ref<"base" | "loja">;
}) {
  const { apiGet } = useApi();
  const consulta = useConsultaAoVivo(async (parametros: URLSearchParams) => {
    const achados = await apiGet<Achado[]>(`/api/produtos/por-codigo-barras?${parametros.toString()}`);
    return achados.find((achado) => achado.id !== entrada.produtoId.value) ?? null;
  }, ATRASO_DO_AVISO_DE_EAN);

  watch(
    () => [entrada.form.value.codigoBarras, entrada.empresaId.value, entrada.modo.value] as const,
    ([codigoBarras, empresaId, modo]) => {
      const digitos = String(codigoBarras ?? "").replace(/\D/g, "");
      if (digitos.length < DIGITOS_MINIMOS || (modo === "loja" && !empresaId)) return consulta.agendar(null);
      const parametros = new URLSearchParams({ codigoBarras: digitos, catalogo: modo });
      if (modo === "loja") parametros.set("empresaId", empresaId);
      consulta.agendar(parametros);
    }
  );

  /** O produto que ja tem este EAN e onde abri-lo, ou `null`. */
  const eanRepetido = computed(() => {
    const achado = consulta.resultado.value;
    if (!achado) return null;
    const rota = entrada.modo.value === "base" ? `/produtos/base/${achado.id}` : `/produtos/${achado.id}`;
    return { nome: achado.nome, codigoInterno: achado.codigoInterno, rota };
  });

  return { eanRepetido };
}
