import type { ProdutoDetalhe } from "@padaria/shared";
import {
  calcularPrecoVenda,
  montarComoSeCompra,
  montarValidacaoQtd,
  validarBalanca,
  validarEstoquePorEmbalagem,
  validarPromocoesDoProduto
} from "@padaria/shared";
import { mensagemErro } from "~/utils/domain";
import { ErroApiCliente } from "~/composables/useApi";
import { useGrupoFiscalDoProduto } from "~/composables/useGrupoFiscalDoProduto";
import { useProdutoFotoPendente } from "~/composables/useProdutoFotoPendente";
import { mensagemDeProdutoSalvo, numeroDigitado, percentualParaFracao } from "~/utils/produto-numeros";
import { siglaCanonica } from "~/utils/produto-listas";
import {
  aplicarValoresDaBase,
  formularioDoDetalhe,
  formularioVazio,
  descricaoPreviewDoProduto,
  payloadDoFormulario,
  type ProdutoForm
} from "~/composables/produto-formulario-mapa";

/** Codigos de duplicidade da API: os dois oferecem "Cadastrar mesmo assim" (nome e EAN, oficial). */
const CODIGOS_DE_DUPLICADO = new Set(["DUPLICATE_PRODUCT", "DUPLICATE_BARCODE"]);

/** Mensagem do paralelo quando a planilha fiscal nao responde (cadastro novo fica bloqueado). */
export const REGRAS_FISCAIS_INDISPONIVEIS =
  "Regras fiscais indisponíveis. Não foi possível carregar os grupos e as regras fiscais. " +
  "Você pode editar outros dados de um produto existente sem trocar grupo ou código de barras. " +
  "Novos cadastros e reclassificações continuam bloqueados para evitar imposto incorreto.";

/** Resultado de um salvamento: o aviso e de sucesso, ou de alerta quando so a foto falhou. */
export interface ProdutoSalvo {
  id: string;
  mensagem: string;
  tipo: "success" | "warning";
}

/**
 * Estado do formulario de produto. As previas (descricao, "como se compra", preco) usam as MESMAS
 * funcoes puras que o servidor usa — e por isso que previa e valor gravado nunca divergem.
 *
 * Dois cadastros, um formulario (igual ao app oficial):
 *  - `base`: o que o produto E. So o administrador cria e edita; a edicao desce para as lojas.
 *  - `loja`: a copia importada. A loja completa o que e dela (estoque, preco, fiscal, promocao);
 *    o que veio da BASE fica em leitura.
 */
export type ModoDoProduto = "base" | "loja";

export function useProdutoFormulario(empresaId: Ref<string>, produtoId: Ref<string | null>, modo: Ref<ModoDoProduto>) {
  const { apiGet, apiPost, apiPut } = useApi();

  const form = ref<ProdutoForm>(formularioVazio(empresaId.value));
  const unidades = ref<Array<{ id: string; sigla: string; nome: string }>>([]);
  const grupos = ref<Array<{ id: string; nome: string }>>([]);

  const carregando = ref(false);
  const salvando = ref(false);
  const erro = ref("");
  const duplicado = ref("");
  const formAlterado = ref(false);
  /** Foto escolhida/removida: so vai para o servidor ao salvar (ver `useProdutoFotoPendente`). */
  const foto = useProdutoFotoPendente();
  const { fotoPendente } = foto;
  /** Foto escolhida tambem e alteracao: "Cancelar" pergunta antes de descartar. */
  const alterado = computed(() => formAlterado.value || Boolean(fotoPendente.value));
  /** Grupo com que o produto chegou: quem ja tinha grupo nao pode ficar sem (oficial). */
  const grupoOriginal = ref<string | null>(null);
  const grupoObrigatorio = computed(() => !produtoId.value || Boolean(grupoOriginal.value));
  /** Grupo trocado na tela: a classificacao gravada deixa de valer ate salvar (o servidor refaz). */
  const grupoMudou = computed(() => (form.value.grupoMercadoriaId || null) !== grupoOriginal.value);
  /** Copia de um produto da BASE: so ela tem campos herdados (produto proprio da loja nao). */
  const produtoBaseId = ref<string | null>(null);
  /** Loja do produto (TNP/LI/HORA; "BASE" na base geral). Area de venda so na TNP. */
  const loja = ref("");
  /** Selo de heranca: campos em que esta loja nao segue mais a base, e os valores atuais da base. */
  const heranca = ref<ProdutoDetalhe["heranca"]>(null);
  const herdadoTravado = computed(() => modo.value === "loja" && Boolean(produtoBaseId.value));

  let estadoOriginal = JSON.stringify(form.value);
  watch(
    form,
    () => {
      formAlterado.value = JSON.stringify(form.value) !== estadoOriginal;
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
      quantidadeCaixa: numeroDigitado(form.value.quantidadeCaixa),
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
          numeroDigitado(form.value.quantidadeTransformacao) ?? 0,
          form.value.unidadeTransformacao
        )
      : ""
  );

  const grupoFiscal = useGrupoFiscalDoProduto({ form, grupos, grupoOriginal, carregando });
  const { margemDoGrupo, planilhaFiscalForaDoAr } = grupoFiscal;

  /**
   * Previa do preco. O servidor recalcula e MANDA (ADR-002) — isto aqui e so para a pessoa ver o
   * numero antes de salvar. Sem margem propria vale a margem do grupo da planilha (igual ao oficial).
   */
  const precoPreview = computed(() =>
    calcularPrecoVenda({
      auto: form.value.auto,
      custo: numeroDigitado(form.value.custo) ?? 0,
      quantidadeCaixa: numeroDigitado(form.value.quantidadeCaixa) ?? 1,
      margem: percentualParaFracao(form.value.margemPercentual),
      margemGrupo: margemDoGrupo.value ?? 0,
      precoManual: numeroDigitado(form.value.precoVenda) ?? 0,
      temProduto: Boolean(form.value.nomeCatalogo.trim())
    })
  );

  /** Erros por campo — alimentam `error-messages` e o foco no primeiro invalido. */
  const erros = computed(() => {
    const lista: Record<string, string> = {};
    if (!form.value.nomeCatalogo.trim()) lista["nomeCatalogo"] = "Informe o nome do produto.";
    if (!form.value.unidadeIndividualId) lista["unidadeIndividualId"] = "Escolha a unidade individual.";
    // Gramatura vazia vale 0, como no paralelo (produto sem peso por unidade); so negativo e erro.
    const quantidade = numeroDigitado(form.value.quantidadeIndividual);
    if (quantidade != null && quantidade < 0) lista["quantidadeIndividual"] = "Informe a quantidade (0 ou mais).";
    if (grupoObrigatorio.value && !form.value.grupoMercadoriaId) {
      lista["grupoMercadoriaId"] = "Selecione o grupo de mercadorias para aplicar os impostos.";
    }
    if (form.value.pesavel === null) lista["pesavel"] = "Escolha Sim ou Não para o campo Vai para balança.";
    const [erroDeBalanca] = validarBalanca({
      pesavel: form.value.pesavel,
      validadeBalanca: form.value.validadeBalanca === "" ? null : numeroDigitado(form.value.validadeBalanca)
    });
    if (erroDeBalanca) lista["validadeBalanca"] = erroDeBalanca;
    const minimo = numeroDigitado(form.value.estoqueMin);
    const maximo = numeroDigitado(form.value.estoqueMax);
    if (minimo != null && maximo != null && maximo < minimo) {
      lista["estoqueMax"] = "O máximo não pode ser menor que o mínimo.";
    }
    for (const item of validarEstoquePorEmbalagem({
      quantidadeCaixa: numeroDigitado(form.value.quantidadeCaixa),
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
        valor: numeroDigitado(promo.valor),
        descontoFracao: promo.descontoPercentual ? (numeroDigitado(promo.descontoPercentual) ?? 0) / 100 : null,
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
      apiGet<{ gruposMercadorias: Array<{ id: string; nome: string }> }>(`/api/grupos${consulta}`)
    ]);
    unidades.value = listaUnidades;
    grupos.value = listaGrupos.gruposMercadorias;
    await grupoFiscal.carregarRegras();
  }

  async function carregar() {
    carregando.value = true;
    erro.value = "";
    try {
      await carregarOpcoes();
      if (produtoId.value) {
        const detalhe = await apiGet<ProdutoDetalhe>(
          modo.value === "base"
            ? `/api/produtos/base/${produtoId.value}?empresaId=${encodeURIComponent(empresaId.value)}`
            : `/api/produtos/${produtoId.value}`
        );
        form.value = formularioDoDetalhe(detalhe);
        produtoBaseId.value = detalhe.produtoBaseId;
        loja.value = detalhe.loja;
        heranca.value = detalhe.heranca;
      } else {
        loja.value = modo.value === "base" ? "BASE" : "";
        // Medida base KG por padrao (paralelo). Se a empresa nao tiver KG cadastrado, fica vazia.
        form.value.unidadeIndividualId =
          unidades.value.find((unidade) => siglaCanonica(unidade.sigla) === "KG")?.id ?? "";
      }
      grupoOriginal.value = form.value.grupoMercadoriaId || null;
      foto.marcarSalva(form.value.fotoUrl);
      estadoOriginal = JSON.stringify(form.value);
      formAlterado.value = false;
    } catch (falha) {
      erro.value = mensagemErro(falha);
    } finally {
      carregando.value = false;
    }
  }

  /**
   * Salva. Devolve o id e a mensagem de sucesso, ou `null` — e o formulario CONSERVA tudo o que a
   * pessoa digitou. O botao fica sempre ativo (paralelo): clicar com erro diz o MOTIVO em vez de um
   * botao cinza mudo. `salvando` bloqueia o duplo clique.
   */
  async function salvar(forcar = false): Promise<ProdutoSalvo | null> {
    if (salvando.value) return null;
    duplicado.value = "";
    // Paralelo: sem regra fiscal disponivel, cadastro NOVO fica bloqueado (imposto incorreto).
    if (!produtoId.value && planilhaFiscalForaDoAr.value) {
      erro.value = REGRAS_FISCAIS_INDISPONIVEIS;
      return null;
    }
    if (!valido.value) {
      erro.value = Object.values(erros.value)[0] ?? errosDePromocao.value[0] ?? "Confira os campos.";
      return null;
    }
    salvando.value = true;
    erro.value = "";
    try {
      const payload = payloadDoFormulario(form.value, empresaId.value, forcar, descricaoPreview.value);
      let id = produtoId.value;
      let lojasAtualizadas: number | null = null;
      if (modo.value === "base") {
        // Produto novo so nasce na BASE (oficial); a loja recebe por importacao. A edicao da BASE
        // responde quantas lojas receberam a mudanca.
        if (id) {
          const resposta = await apiPut<{ id: string; lojasAtualizadas?: number }>(`/api/produtos/base/${id}`, payload);
          lojasAtualizadas = resposta?.lojasAtualizadas ?? null;
        } else id = (await apiPost<{ id: string }>("/api/produtos/base", payload)).id;
      } else if (id) {
        await apiPut(`/api/produtos/${id}`, payload);
      } else {
        throw new Error("Produto novo é cadastrado na base geral e importado pela loja.");
      }
      if (!id) return null;
      // A foto vai DEPOIS do produto (precisa do id). Se ELA falhar, o produto ja esta salvo: sai com
      // aviso, sem pedir para salvar de novo (no cadastro novo isso criaria outro produto).
      const resultadoDaFoto = await foto.aplicarDepoisDeSalvar({
        rota: modo.value === "base" ? "/api/produtos/base" : "/api/produtos",
        id,
        fotoUrlDoFormulario: form.value.fotoUrl
      });
      form.value.fotoUrl = resultadoDaFoto.fotoUrl;
      estadoOriginal = JSON.stringify(form.value);
      formAlterado.value = false;
      const mensagem = mensagemDeProdutoSalvo({ modo: modo.value, lojasAtualizadas });
      return resultadoDaFoto.falha
        ? { id, mensagem: `${mensagem} ${resultadoDaFoto.falha}`, tipo: "warning" }
        : { id, mensagem, tipo: "success" };
    } catch (falha) {
      const mensagem = mensagemErro(falha);
      // "Cadastrar mesmo assim" vale para nome e para codigo de barras repetidos (oficial). Decidido
      // pelo CODIGO do erro, nunca pelo texto: o texto muda (acento, redacao) e o codigo e contrato.
      if (falha instanceof ErroApiCliente && falha.codigo && CODIGOS_DE_DUPLICADO.has(falha.codigo)) {
        duplicado.value = mensagem;
      } else {
        erro.value = mensagem;
      }
      return null;
    } finally {
      salvando.value = false;
    }
  }

  /**
   * "Voltar a herdar da base" (oficial): devolve ao formulario os valores da base nos campos
   * herdados — inclusive a foto, como no paralelo. Foto escolhida e ainda nao salva e descartada.
   */
  function voltarAHerdar() {
    if (!heranca.value) return;
    aplicarValoresDaBase(form.value, heranca.value.base);
    fotoPendente.value = null;
  }

  /**
   * De onde a tela mostra a foto. Arquivo escolhido: preview local. Foto como esta gravada: a rota
   * do proprio produto. Foto da BASE trazida pelo "voltar a herdar" (ainda nao salva): a rota da BASE.
   */
  const origemDaFoto = computed<{ rota: string; id: string | null }>(() => {
    const rotaPropria = modo.value === "base" ? "/api/produtos/base" : "/api/produtos";
    const fotoDaBase = heranca.value?.base.fotoUrl ?? null;
    const daBase =
      Boolean(form.value.fotoUrl) &&
      form.value.fotoUrl !== foto.fotoUrlSalva.value &&
      form.value.fotoUrl === fotoDaBase &&
      Boolean(produtoBaseId.value);
    return daBase
      ? { rota: "/api/produtos/base", id: produtoBaseId.value }
      : { rota: rotaPropria, id: produtoId.value };
  });

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
    grupoMudou,
    siglaDaUnidade,
    descricaoPreview,
    comoSeCompraPreview,
    validacaoQtdPreview,
    precoPreview,
    margemDoGrupo,
    margemDoGrupoPct: grupoFiscal.margemDoGrupoPct,
    gruposComRegra: grupoFiscal.gruposComRegra,
    regraDoGrupo: grupoFiscal.regraDoGrupo,
    planilhaFiscalForaDoAr,
    origemDaFoto,
    produtoBaseId,
    loja,
    heranca,
    herdadoTravado,
    voltarAHerdar,
    carregar,
    salvar
  };
}
