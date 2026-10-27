import type { ProdutoDetalhe } from "@padaria/shared";
import {
  calcularPrecoVenda,
  fracaoParaMargemPercentual,
  montarComoSeCompra,
  montarValidacaoQtd,
  validarBalanca,
  validarEstoquePorEmbalagem,
  validarPromocoesDoProduto
} from "@padaria/shared";
import { mensagemErro } from "~/utils/domain";
import {
  formularioDoDetalhe,
  formularioVazio,
  descricaoPreviewDoProduto,
  numero,
  payloadDoFormulario,
  type ProdutoForm
} from "~/composables/produto-formulario-mapa";

/**
 * Estado do formulario de produto. As previas (descricao, "como se compra", preco) usam as MESMAS
 * funcoes puras que o servidor usa — e por isso que previa e valor gravado nunca divergem.
 */

export function useProdutoFormulario(empresaId: Ref<string>, produtoId: Ref<string | null>) {
  const { apiGet, apiPost, apiPut } = useApi();

  const form = ref<ProdutoForm>(formularioVazio(empresaId.value));
  const unidades = ref<Array<{ id: string; sigla: string; nome: string }>>([]);
  const grupos = ref<Array<{ id: string; nome: string; margemPadrao?: string | null }>>([]);

  const carregando = ref(false);
  const salvando = ref(false);
  const erro = ref("");
  const duplicado = ref("");
  const alterado = ref(false);
  /** Foto escolhida antes de o produto existir: sobe logo depois do POST. */
  const fotoPendente = ref<File | null>(null);
  /** Grupo com que o produto chegou: quem ja tinha grupo nao pode ficar sem (oficial). */
  const grupoOriginal = ref<string | null>(null);
  const grupoObrigatorio = computed(() => !produtoId.value || Boolean(grupoOriginal.value));

  let estadoOriginal = JSON.stringify(form.value);
  watch(
    form,
    () => {
      alterado.value = JSON.stringify(form.value) !== estadoOriginal;
    },
    { deep: true }
  );

  const siglaDaUnidade = computed(
    () => unidades.value.find((unidade) => unidade.id === form.value.unidadeIndividualId)?.sigla ?? ""
  );

  const descricaoPreview = computed(() =>
    descricaoPreviewDoProduto({
      nome: form.value.nomeCatalogo,
      nomeOriginal: form.value.nomeCatalogoOriginal,
      descricaoAtual: form.value.descricao,
      quantidade: form.value.quantidadeIndividual,
      siglaUnidade: siglaDaUnidade.value
    })
  );

  const comoSeCompraPreview = computed(() =>
    montarComoSeCompra({
      embalagem: form.value.embalagem,
      cDe: form.value.cDe,
      quantidadeCaixa: numero(form.value.quantidadeCaixa),
      medidaCompra: form.value.medidaCompra,
      descricao: descricaoPreview.value || form.value.descricao,
      aproximado: form.value.compraAproximada
    })
  );

  const validacaoQtdPreview = computed(() =>
    form.value.tipo === "transformacao"
      ? montarValidacaoQtd(
          descricaoPreview.value || form.value.descricao,
          form.value.precisao,
          numero(form.value.quantidadeTransformacao) ?? 0,
          form.value.unidadeTransformacao
        )
      : ""
  );

  /** Margem padrao (fracao) do grupo escolhido; 0 quando o grupo nao tem margem. */
  const margemDoGrupo = computed(
    () => Number(grupos.value.find((grupo) => grupo.id === form.value.grupoMercadoriaId)?.margemPadrao ?? 0) || 0
  );
  /** "30" para mostrar na dica do campo de margem; vazio quando o grupo nao tem margem. */
  const margemDoGrupoPercentual = computed(() =>
    margemDoGrupo.value ? fracaoParaMargemPercentual(margemDoGrupo.value) : ""
  );

  /**
   * Previa do preco. O servidor recalcula e MANDA (ADR-002) — isto aqui e so para a pessoa ver o
   * numero antes de salvar. Sem margem propria vale a margem padrao do grupo (oficial).
   */
  const precoPreview = computed(() =>
    calcularPrecoVenda({
      auto: form.value.auto,
      custo: numero(form.value.custo) ?? 0,
      quantidadeCaixa: numero(form.value.quantidadeCaixa) ?? 1,
      margem: form.value.margemPercentual ? (numero(form.value.margemPercentual) ?? 0) / 100 : null,
      margemGrupo: margemDoGrupo.value,
      precoManual: numero(form.value.precoVenda) ?? 0,
      temProduto: Boolean(form.value.nomeCatalogo.trim())
    })
  );

  /** Erros por campo — alimentam `error-messages` e o foco no primeiro invalido. */
  const erros = computed(() => {
    const lista: Record<string, string> = {};
    if (!form.value.nomeCatalogo.trim()) lista["nomeCatalogo"] = "Informe o nome do produto.";
    if (!form.value.unidadeIndividualId) lista["unidadeIndividualId"] = "Escolha a unidade individual.";
    const quantidade = numero(form.value.quantidadeIndividual);
    if (quantidade == null || quantidade < 0) lista["quantidadeIndividual"] = "Informe a quantidade (0 ou mais).";
    if (grupoObrigatorio.value && !form.value.grupoMercadoriaId) {
      lista["grupoMercadoriaId"] = "Selecione o grupo de mercadorias para aplicar os impostos.";
    }
    if (form.value.pesavel === null) lista["pesavel"] = "Escolha Sim ou Não para o campo Vai para balança.";
    const [erroDeBalanca] = validarBalanca({
      pesavel: form.value.pesavel,
      validadeBalanca: form.value.validadeBalanca === "" ? null : numero(form.value.validadeBalanca)
    });
    if (erroDeBalanca) lista["validadeBalanca"] = erroDeBalanca;
    const minimo = numero(form.value.estoqueMin);
    const maximo = numero(form.value.estoqueMax);
    if (minimo != null && maximo != null && maximo < minimo) {
      lista["estoqueMax"] = "O máximo não pode ser menor que o mínimo.";
    }
    for (const item of validarEstoquePorEmbalagem({
      quantidadeCaixa: numero(form.value.quantidadeCaixa),
      estoqueMin: form.value.estoqueMin === "" ? null : minimo,
      estoqueMax: form.value.estoqueMax === "" ? null : maximo
    })) {
      lista[item.campo] ??= item.mensagem;
    }
    const unidadesDasConversoes = form.value.conversoes.map((item) => item.unidadeMedidaId).filter(Boolean);
    if (new Set(unidadesDasConversoes).size !== unidadesDasConversoes.length) {
      lista["conversoes"] = "A mesma unidade aparece em duas conversões.";
    }
    return lista;
  });

  const errosDePromocao = computed(() =>
    validarPromocoesDoProduto(
      form.value.promocoes.map((promo) => ({
        tipo: promo.tipo,
        valor: numero(promo.valor),
        descontoFracao: promo.descontoPercentual ? (numero(promo.descontoPercentual) ?? 0) / 100 : null,
        horaInicio: promo.horaInicio || null,
        horaFim: promo.horaFim || null,
        dias: promo.dias,
        validaAte: promo.validaAte || null
      }))
    )
  );

  const valido = computed(() => Object.keys(erros.value).length === 0 && errosDePromocao.value.length === 0);

  async function carregarOpcoes() {
    if (!empresaId.value) return;
    const consulta = `?empresaId=${empresaId.value}&pageSize=100`;
    const [listaUnidades, listaGrupos] = await Promise.all([
      apiGet<Array<{ id: string; sigla: string; nome: string }>>(`/api/unidades_medida${consulta}`),
      apiGet<{ gruposMercadorias: Array<{ id: string; nome: string; margemPadrao?: string | null }> }>(
        `/api/grupos${consulta}`
      )
    ]);
    unidades.value = listaUnidades;
    grupos.value = listaGrupos.gruposMercadorias;
  }

  async function carregar() {
    carregando.value = true;
    erro.value = "";
    try {
      await carregarOpcoes();
      if (produtoId.value) {
        form.value = formularioDoDetalhe(await apiGet<ProdutoDetalhe>(`/api/produtos/${produtoId.value}`));
      }
      grupoOriginal.value = form.value.grupoMercadoriaId || null;
      estadoOriginal = JSON.stringify(form.value);
      alterado.value = false;
    } catch (falha) {
      erro.value = mensagemErro(falha);
    } finally {
      carregando.value = false;
    }
  }

  /**
   * Salva. Devolve o id em caso de sucesso, ou `null` — e o formulario CONSERVA tudo o que a pessoa
   * digitou. `salvando` bloqueia o duplo clique.
   */
  async function salvar(forcar = false): Promise<string | null> {
    if (salvando.value || !valido.value) return null;
    salvando.value = true;
    erro.value = "";
    duplicado.value = "";
    try {
      const payload = payloadDoFormulario(form.value, empresaId.value, forcar, descricaoPreview.value);
      let id = produtoId.value;
      if (id) {
        await apiPut(`/api/produtos/${id}`, payload);
      } else {
        const criado = await apiPost<{ id: string }>("/api/produtos", payload);
        id = criado.id;
      }
      // Foto escolhida antes de o produto existir sobe agora. Se ELA falhar, o produto ja esta
      // salvo — o erro aparece, mas ninguem recadastra o produto por causa disso.
      if (id && fotoPendente.value) {
        await enviarFotoPendente(id);
        fotoPendente.value = null;
      }
      estadoOriginal = JSON.stringify(form.value);
      alterado.value = false;
      return id;
    } catch (falha) {
      const mensagem = mensagemErro(falha);
      // "Cadastrar mesmo assim" vale para nome e para codigo de barras repetidos (oficial).
      if (mensagem.includes("Ja existe o produto")) {
        duplicado.value = mensagem;
      } else {
        erro.value = mensagem;
      }
      return null;
    } finally {
      salvando.value = false;
    }
  }

  const { apiUrl } = useApi();
  async function enviarFotoPendente(id: string) {
    const corpo = new FormData();
    corpo.append("arquivo", fotoPendente.value as File);
    const resposta = await fetch(`${apiUrl}/api/produtos/${id}/foto`, {
      method: "POST",
      credentials: "include",
      body: corpo
    });
    if (!resposta.ok) throw new Error("Produto salvo, mas a foto não subiu. Abra o produto e envie de novo.");
  }

  return {
    form,
    unidades,
    grupos,
    carregando,
    salvando,
    erro,
    duplicado,
    alterado,
    fotoPendente,
    erros,
    errosDePromocao,
    valido,
    grupoObrigatorio,
    siglaDaUnidade,
    descricaoPreview,
    comoSeCompraPreview,
    validacaoQtdPreview,
    precoPreview,
    margemDoGrupoPercentual,
    carregar,
    salvar
  };
}
