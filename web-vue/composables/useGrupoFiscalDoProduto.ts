import { normalizarGrupoFiscal, type RegraFiscalGrupo } from "@padaria/shared";
import { fracaoParaPercentual } from "~/utils/produto-numeros";
import type { ProdutoForm } from "~/composables/produto-formulario-mapa";

type Grupo = { id: string; nome: string };

/**
 * Grupo de mercadorias e a regra fiscal dele (planilha oficial, `/api/produtos/regras-fiscais`).
 *
 * Igual ao paralelo: so se escolhe grupo que TEM regra fiscal (e dela que saem os impostos e a margem
 * padrao). O grupo continua sendo o cadastro LOCAL (`grupoMercadoriaId`); a regra e casada pelo NOME
 * normalizado, porque os nomes da planilha carregam caracteres invisiveis. Sem a planilha, so o grupo
 * que o produto ja tem fica na lista: edicao segue, reclassificacao e cadastro novo nao.
 */
export function useGrupoFiscalDoProduto(entrada: {
  form: Ref<ProdutoForm>;
  grupos: Ref<Grupo[]>;
  grupoOriginal: Ref<string | null>;
  carregando: Ref<boolean>;
}) {
  const { apiGet } = useApi();
  const { form, grupos, grupoOriginal, carregando } = entrada;

  const regrasFiscais = ref<RegraFiscalGrupo[]>([]);
  /** Planilha fiscal fora do ar: sem grupo novo, sem cadastro novo (paralelo). */
  const planilhaFiscalForaDoAr = ref(false);

  const regraPorChave = computed(
    () => new Map(regrasFiscais.value.map((regra) => [normalizarGrupoFiscal(regra.grupo), regra]))
  );
  const regraDoNome = (nome: string | undefined) =>
    nome ? (regraPorChave.value.get(normalizarGrupoFiscal(nome)) ?? null) : null;

  /** Grupos oferecidos: os que tem regra fiscal + o grupo que o produto ja tem (nao some da tela). */
  const gruposComRegra = computed(() => {
    const manter = new Set([grupoOriginal.value, form.value.grupoMercadoriaId].filter(Boolean));
    return grupos.value
      .filter((grupo) => manter.has(grupo.id) || regraDoNome(grupo.nome))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  });

  /** Regra fiscal do grupo escolhido (o "Regra automatica" do cartao fiscal). */
  const regraDoGrupo = computed(() =>
    regraDoNome(grupos.value.find((grupo) => grupo.id === form.value.grupoMercadoriaId)?.nome)
  );
  /** Margem padrao (fracao) do grupo escolhido; `null` = o grupo nao tem. */
  const margemDoGrupo = computed<number | null>(() => regraDoGrupo.value?.margemPadrao ?? null);
  /** A mesma margem em % para a tela ("Padrão do grupo: 30%"), arredondada como no paralelo. */
  const margemDoGrupoPct = computed(() =>
    margemDoGrupo.value == null ? null : fracaoParaPercentual(margemDoGrupo.value)
  );

  /*
   * Decisao D3 (Jose): TROCAR o grupo preenche a margem do produto com a padrao do grupo, quando ela
   * existe (paralelo). E o que evita produto sem margem sair no TXT do PDV pelo preco de custo. So
   * reage a TROCA feita na tela: `sync` + `carregando` deixam de fora a hidratacao do produto, senao
   * abrir um produto sobrescreveria a margem gravada dele.
   */
  watch(
    () => form.value.grupoMercadoriaId,
    (novo, anterior) => {
      if (carregando.value || !novo || novo === anterior) return;
      if (margemDoGrupoPct.value != null) form.value.margemPercentual = margemDoGrupoPct.value;
    },
    { flush: "sync" }
  );

  /** A planilha pode estar fora do ar: a tela segue, sem grupo novo e com a previa sem margem. */
  async function carregarRegras() {
    const fonte = await apiGet<{ disponivel: boolean; regras: RegraFiscalGrupo[] }>(
      "/api/produtos/regras-fiscais"
    ).catch(() => ({ disponivel: false, regras: [] }));
    regrasFiscais.value = fonte.regras;
    planilhaFiscalForaDoAr.value = !fonte.disponivel;
  }

  return {
    planilhaFiscalForaDoAr,
    gruposComRegra,
    regraDoGrupo,
    margemDoGrupo,
    margemDoGrupoPct,
    carregarRegras
  };
}
