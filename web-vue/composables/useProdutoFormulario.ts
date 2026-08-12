import type { ProdutoDetalhe } from "@padaria/shared";
import {
  calcularPrecoVenda,
  montarComoSeCompra,
  montarDescricao,
  montarValidacaoQtd,
  validarPromocoesDoProduto
} from "@padaria/shared";
import { mensagemErro } from "~/utils/domain";

/**
 * Estado do formulario de produto. As previas (descricao, "como se compra", preco) usam as MESMAS
 * funcoes puras que o servidor usa — e por isso que previa e valor gravado nunca divergem.
 */

export interface PromocaoForm {
  tipo: "valor" | "desconto";
  valor: string;
  descontoPercentual: string;
  horaInicio: string;
  horaFim: string;
  dias: boolean[];
  validaAte: string;
}

export interface ConversaoForm {
  unidadeMedidaId: string;
  quantidade: string;
  unidadesIndividuais: string;
}

export function promocaoVazia(): PromocaoForm {
  return {
    tipo: "desconto",
    valor: "",
    descontoPercentual: "",
    horaInicio: "",
    horaFim: "",
    dias: [true, true, true, true, true, true, true],
    validaAte: ""
  };
}

function formularioVazio(empresaId: string) {
  return {
    empresaId,
    status: "ativo" as "ativo" | "inativo",
    codigo: "",
    codigoInterno: "",
    codigoBarras: "",
    marca: "",
    descricao: "",
    quantidadeIndividual: "1",
    unidadeIndividualId: "",
    grupoMercadoriaId: "" as string | null,
    tipo: "revenda" as "revenda" | "transformacao",
    embalagem: "" as string | null,
    cDe: "DE" as "C/" | "DE",
    quantidadeCaixa: "1",
    medidaCompra: "" as string | null,
    custo: "",
    margemPercentual: "",
    auto: true,
    precoVenda: "",
    quantidadeEstoque: "0",
    estoqueMin: "",
    estoqueMax: "",
    setorEstoque: "",
    fotoUrl: null as string | null,
    precisao: "EXATOS",
    quantidadeTransformacao: "",
    unidadeTransformacao: "",
    produtoReceituario: "",
    fiscal: {
      ncm: "",
      cest: "",
      categoriaFiscal: "",
      cstPisCofins: "",
      aliquotaCheia: "",
      aliquotaFcp: "",
      aliquotaPis: "",
      aliquotaCofins: "",
      reducaoIcms: "",
      icms: ""
    },
    promocoes: [] as PromocaoForm[],
    conversoes: [] as ConversaoForm[]
  };
}

export type ProdutoForm = ReturnType<typeof formularioVazio>;

const numero = (texto: string) => {
  const valor = Number(String(texto).replace(",", "."));
  return Number.isFinite(valor) ? valor : null;
};

export function useProdutoFormulario(empresaId: Ref<string>, produtoId: Ref<string | null>) {
  const { apiGet, apiPost, apiPut } = useApi();

  const form = ref<ProdutoForm>(formularioVazio(empresaId.value));
  const unidades = ref<Array<{ id: string; sigla: string; nome: string }>>([]);
  const grupos = ref<Array<{ id: string; nome: string }>>([]);

  const carregando = ref(false);
  const salvando = ref(false);
  const erro = ref("");
  const duplicado = ref("");
  const alterado = ref(false);
  /** Foto escolhida antes de o produto existir: sobe logo depois do POST. */
  const fotoPendente = ref<File | null>(null);

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
    montarDescricao(form.value.descricao, form.value.quantidadeIndividual, siglaDaUnidade.value)
  );

  const comoSeCompraPreview = computed(() =>
    montarComoSeCompra({
      embalagem: form.value.embalagem,
      cDe: form.value.cDe,
      quantidadeCaixa: numero(form.value.quantidadeCaixa),
      medidaCompra: form.value.medidaCompra,
      descricao: descricaoPreview.value || form.value.descricao
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

  /**
   * Previa do preco. O servidor recalcula e MANDA (ADR-002) — isto aqui e so para a pessoa ver o
   * numero antes de salvar. `margemGrupo: 0` porque `grupos_mercadorias.margem` ainda nao existe
   * (migration bloqueada; ver PROJECT_BRAIN/30 §7).
   */
  const precoPreview = computed(() =>
    calcularPrecoVenda({
      auto: form.value.auto,
      custo: numero(form.value.custo) ?? 0,
      quantidadeCaixa: numero(form.value.quantidadeCaixa) ?? 1,
      margem: form.value.margemPercentual ? (numero(form.value.margemPercentual) ?? 0) / 100 : null,
      margemGrupo: 0,
      precoManual: numero(form.value.precoVenda) ?? 0,
      temProduto: Boolean(form.value.descricao.trim())
    })
  );

  /** Erros por campo — alimentam `error-messages` e o foco no primeiro invalido. */
  const erros = computed(() => {
    const lista: Record<string, string> = {};
    if (!form.value.descricao.trim()) lista["descricao"] = "Informe a descrição do produto.";
    if (!form.value.unidadeIndividualId) lista["unidadeIndividualId"] = "Escolha a unidade individual.";
    const quantidade = numero(form.value.quantidadeIndividual);
    if (quantidade == null || quantidade <= 0) lista["quantidadeIndividual"] = "A quantidade precisa ser maior que 0.";
    const minimo = numero(form.value.estoqueMin);
    const maximo = numero(form.value.estoqueMax);
    if (minimo != null && maximo != null && maximo < minimo) {
      lista["estoqueMax"] = "O máximo não pode ser menor que o mínimo.";
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
      apiGet<{ gruposMercadorias: Array<{ id: string; nome: string }> }>(`/api/grupos${consulta}`)
    ]);
    unidades.value = listaUnidades;
    grupos.value = listaGrupos.gruposMercadorias;
  }

  async function carregar() {
    carregando.value = true;
    erro.value = "";
    try {
      await carregarOpcoes();
      if (produtoId.value) aplicarDetalhe(await apiGet<ProdutoDetalhe>(`/api/produtos/${produtoId.value}`));
      estadoOriginal = JSON.stringify(form.value);
      alterado.value = false;
    } catch (falha) {
      erro.value = mensagemErro(falha);
    } finally {
      carregando.value = false;
    }
  }

  function aplicarDetalhe(detalhe: ProdutoDetalhe) {
    const { fiscal, transformacao } = detalhe;

    form.value = {
      ...formularioVazio(detalhe.empresaId),
      status: detalhe.status === "inativo" ? "inativo" : "ativo",
      codigo: detalhe.codigo ?? "",
      codigoInterno: detalhe.codigoInterno ?? "",
      codigoBarras: detalhe.codigoBarras ?? "",
      marca: detalhe.marca ?? "",
      descricao: detalhe.descricao,
      quantidadeIndividual: detalhe.quantidadeIndividual || "1",
      unidadeIndividualId: detalhe.unidadeIndividualId ?? "",
      grupoMercadoriaId: detalhe.grupoMercadoriaId,
      tipo: detalhe.tipo === "transformacao" ? "transformacao" : "revenda",
      embalagem: detalhe.embalagem,
      cDe: detalhe.cDe === "C/" ? "C/" : "DE",
      quantidadeCaixa: String(detalhe.quantidadeCaixa || 1),
      medidaCompra: detalhe.medidaCompra,
      custo: detalhe.custo ?? "",
      margemPercentual: detalhe.margem == null ? "" : String(Number(detalhe.margem) * 100),
      auto: detalhe.auto,
      precoVenda: detalhe.precoVenda ?? "",
      quantidadeEstoque: detalhe.quantidadeEstoque || "0",
      estoqueMin: detalhe.estoqueMin ?? "",
      estoqueMax: detalhe.estoqueMax ?? "",
      setorEstoque: detalhe.setorEstoque ?? "",
      fotoUrl: detalhe.fotoUrl,
      precisao: transformacao?.precisao ?? "EXATOS",
      quantidadeTransformacao: transformacao?.quantidade ?? "",
      unidadeTransformacao: transformacao?.unidade ?? "",
      produtoReceituario: transformacao?.produtoReceituario ?? "",
      fiscal: {
        ncm: fiscal?.ncm ?? "",
        cest: fiscal?.cest ?? "",
        categoriaFiscal: fiscal?.categoriaFiscal ?? "",
        cstPisCofins: fiscal?.cstPisCofins ?? "",
        aliquotaCheia: fiscal?.aliquotaCheia ?? "",
        aliquotaFcp: fiscal?.aliquotaFcp ?? "",
        aliquotaPis: fiscal?.aliquotaPis ?? "",
        aliquotaCofins: fiscal?.aliquotaCofins ?? "",
        reducaoIcms: fiscal?.reducaoIcms ?? "",
        icms: fiscal?.icms ?? ""
      },
      promocoes: detalhe.promocoes.map((promo) => ({
        tipo: promo.tipo === "valor" ? "valor" : "desconto",
        valor: promo.valor ?? "",
        descontoPercentual: promo.descontoFracao == null ? "" : String(Number(promo.descontoFracao) * 100),
        horaInicio: (promo.horaInicio ?? "").slice(0, 5),
        horaFim: (promo.horaFim ?? "").slice(0, 5),
        dias: [promo.seg, promo.ter, promo.qua, promo.qui, promo.sex, promo.sab, promo.dom],
        validaAte: promo.validaAte ?? ""
      })),
      conversoes: detalhe.conversoes.map((conversao) => ({
        unidadeMedidaId: conversao.unidadeMedidaId,
        quantidade: conversao.quantidade,
        unidadesIndividuais: conversao.unidadesIndividuais
      }))
    };
  }

  function montarPayload(forcar: boolean) {
    const ehRevenda = form.value.tipo === "revenda";
    const fiscalPreenchido = Object.values(form.value.fiscal).some((valor) => String(valor).trim());
    return {
      empresaId: empresaId.value,
      codigo: form.value.codigo || null,
      codigoBarras: form.value.codigoBarras || null,
      descricao: form.value.descricao.trim(),
      marca: form.value.marca || null,
      unidadeIndividualId: form.value.unidadeIndividualId,
      quantidadeIndividual: numero(form.value.quantidadeIndividual) ?? 1,
      grupoMercadoriaId: form.value.grupoMercadoriaId || null,
      embalagem: form.value.embalagem || null,
      cDe: form.value.embalagem ? form.value.cDe : null,
      quantidadeCaixa: numero(form.value.quantidadeCaixa) ?? 1,
      medidaCompra: form.value.medidaCompra || null,
      custo: numero(form.value.custo),
      margem: form.value.margemPercentual ? (numero(form.value.margemPercentual) ?? 0) / 100 : null,
      precoVenda: numero(form.value.precoVenda),
      auto: form.value.auto,
      status: form.value.status,
      tipo: form.value.tipo,
      quantidadeEstoque: numero(form.value.quantidadeEstoque),
      estoqueMin: numero(form.value.estoqueMin),
      estoqueMax: numero(form.value.estoqueMax),
      setorEstoque: form.value.setorEstoque || null,
      fotoUrl: form.value.fotoUrl,
      fiscal: fiscalPreenchido
        ? {
            ncm: form.value.fiscal.ncm || null,
            cest: form.value.fiscal.cest || null,
            categoriaFiscal: form.value.fiscal.categoriaFiscal || null,
            cstPisCofins: form.value.fiscal.cstPisCofins || null,
            aliquotaCheia: numero(form.value.fiscal.aliquotaCheia),
            aliquotaFcp: numero(form.value.fiscal.aliquotaFcp),
            aliquotaPis: numero(form.value.fiscal.aliquotaPis),
            aliquotaCofins: numero(form.value.fiscal.aliquotaCofins),
            reducaoIcms: numero(form.value.fiscal.reducaoIcms),
            icms: numero(form.value.fiscal.icms)
          }
        : null,
      // Payload coerente com o tipo: o servidor recusa o contrario, e a tela nao manda o que ele recusa.
      transformacao: ehRevenda
        ? null
        : {
            precisao: form.value.precisao,
            quantidade: numero(form.value.quantidadeTransformacao),
            unidade: form.value.unidadeTransformacao || null,
            produtoReceituario: form.value.produtoReceituario || null
          },
      promocoes: ehRevenda
        ? form.value.promocoes.map((promo) => ({
            tipo: promo.tipo,
            valor: promo.tipo === "valor" ? numero(promo.valor) : null,
            descontoFracao:
              promo.tipo === "desconto" && promo.descontoPercentual
                ? (numero(promo.descontoPercentual) ?? 0) / 100
                : null,
            horaInicio: promo.horaInicio || null,
            horaFim: promo.horaFim || null,
            seg: promo.dias[0],
            ter: promo.dias[1],
            qua: promo.dias[2],
            qui: promo.dias[3],
            sex: promo.dias[4],
            sab: promo.dias[5],
            dom: promo.dias[6],
            validaAte: promo.validaAte || null
          }))
        : [],
      conversoes: form.value.conversoes
        .filter((conversao) => conversao.unidadeMedidaId)
        .map((conversao) => ({
          unidadeMedidaId: conversao.unidadeMedidaId,
          quantidade: numero(conversao.quantidade) ?? 1,
          unidadesIndividuais: numero(conversao.unidadesIndividuais) ?? 1
        })),
      forcar
    };
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
      const payload = montarPayload(forcar);
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
      // "Cadastrar mesmo assim" vale para descricao repetida; EAN repetido e bloqueio absoluto.
      if (mensagem.includes("Ja existe o produto") && !mensagem.includes("codigo de barras")) {
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
    siglaDaUnidade,
    descricaoPreview,
    comoSeCompraPreview,
    validacaoQtdPreview,
    precoPreview,
    carregar,
    salvar
  };
}
