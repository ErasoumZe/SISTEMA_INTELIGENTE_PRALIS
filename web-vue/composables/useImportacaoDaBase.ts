import type { JsonValue } from "@padaria/shared";
import { mensagemErro } from "~/utils/domain";

/** Linha do catalogo BASE como a API devolve (`jaImportado` so vem com a loja de destino). */
export interface ProdutoBase {
  id: string;
  idOrigem: string;
  codigoInterno: string | null;
  codigoBarras: string | null;
  nome: string;
  status: "ativo" | "inativo";
  grupoIdOrigem: string | null;
  dadosOficiais: Record<string, JsonValue>;
  atualizadoEm: string;
  jaImportado: boolean | null;
}

export interface ResultadoCopiaLote {
  total: number;
  importados: number;
  jaImportados: number;
  ignorados: number;
  bloqueados: number;
  naoEncontrados: number;
  erros: number;
  itens: Array<{ produtoBaseId: string; nome: string; estado: string; motivo?: string }>;
}

/** Teto do lote na API (`corpoCopiaLote`): mais que isso a rota recusa. */
export const LIMITE_DO_LOTE = 100;

/**
 * Copia da BASE para a LOJA ATIVA do shell. A selecao guarda id E nome e sobrevive a troca de pagina
 * e a busca (paralelo: `v-data-table` com selecao que atravessa as paginas); so a troca de situacao
 * limpa, porque nao se importa o que saiu da tela.
 */
export function useImportacaoDaBase(entrada: {
  empresaId: Ref<string>;
  itens: Ref<ProdutoBase[]>;
  recarregar: () => Promise<void>;
}) {
  const { apiPost } = useApi();
  const selecionados = ref<Record<string, string>>({});
  const aviso = ref("");
  const lote = ref<ResultadoCopiaLote | null>(null);
  const copiandoId = ref<string | null>(null);
  const copiandoLote = ref(false);

  const idsSelecionados = computed(() => Object.keys(selecionados.value));
  const idsDaPagina = computed(() => entrada.itens.value.map((produto) => produto.id));
  const paginaToda = computed(
    () => idsDaPagina.value.length > 0 && idsDaPagina.value.every((id) => id in selecionados.value)
  );
  const paginaEmParte = computed(() => !paginaToda.value && idsDaPagina.value.some((id) => id in selecionados.value));

  function selecionar(produto: Pick<ProdutoBase, "id" | "nome">, marcado: boolean | null) {
    const proximo = { ...selecionados.value };
    if (marcado) proximo[produto.id] = produto.nome;
    else delete proximo[produto.id];
    selecionados.value = proximo;
  }

  /** Marca ou desmarca so a pagina atual; o que foi escolhido nas outras paginas fica. */
  function selecionarPagina(marcado: boolean | null) {
    for (const produto of entrada.itens.value) selecionar(produto, marcado);
  }

  function limparSelecao() {
    selecionados.value = {};
  }

  /** Sem loja de destino nao se copia nada — e a pessoa fica sabendo por que (antes nao acontecia nada). */
  function destino(): string | null {
    if (entrada.empresaId.value) return entrada.empresaId.value;
    aviso.value = "Escolha a loja de destino no seletor de empresa antes de importar.";
    return null;
  }

  async function copiarUm(produto: ProdutoBase, nomeDaLoja: string) {
    const empresaId = destino();
    if (!empresaId) return;
    if (!window.confirm(`Copiar “${produto.nome}” para ${nomeDaLoja}? O saldo de estoque será iniciado em zero.`)) {
      return;
    }
    lote.value = null;
    copiandoId.value = produto.id;
    aviso.value = "";
    try {
      const resultado = await apiPost<{ estado: string; motivo?: string; mensagem?: string }>(
        `/api/produtos/catalogo-base/${produto.id}/importar`,
        { empresaId }
      );
      aviso.value =
        resultado.estado === "importado"
          ? `Produto copiado para ${nomeDaLoja}. O saldo começou em zero.`
          : (resultado.motivo ?? resultado.mensagem ?? "O produto não foi copiado.");
      await entrada.recarregar();
    } catch (falha) {
      aviso.value = mensagemErro(falha);
    } finally {
      copiandoId.value = null;
    }
  }

  async function copiarSelecionados(nomeDaLoja: string) {
    const empresaId = destino();
    if (!empresaId || !idsSelecionados.value.length || copiandoLote.value) return;
    if (idsSelecionados.value.length > LIMITE_DO_LOTE) {
      aviso.value = `Selecione até ${LIMITE_DO_LOTE} produtos por vez (há ${idsSelecionados.value.length} selecionados).`;
      return;
    }
    const quantidade = idsSelecionados.value.length;
    if (!window.confirm(`Copiar ${quantidade} produto(s) para ${nomeDaLoja}? O saldo será iniciado em zero.`)) return;
    const nomes = { ...selecionados.value };
    copiandoLote.value = true;
    aviso.value = "";
    lote.value = null;
    try {
      const resultado = await apiPost<
        Omit<ResultadoCopiaLote, "itens"> & { itens: Array<{ produtoBaseId: string; estado: string; motivo?: string }> }
      >("/api/produtos/catalogo-base/importar", { empresaId, produtoBaseIds: idsSelecionados.value });
      lote.value = {
        ...resultado,
        itens: resultado.itens.map((item) => ({ ...item, nome: nomes[item.produtoBaseId] ?? item.produtoBaseId }))
      };
      limparSelecao();
      await entrada.recarregar();
    } catch (falha) {
      aviso.value = mensagemErro(falha);
    } finally {
      copiandoLote.value = false;
    }
  }

  return {
    selecionados,
    idsSelecionados,
    paginaToda,
    paginaEmParte,
    aviso,
    lote,
    copiandoId,
    copiandoLote,
    selecionar,
    selecionarPagina,
    limparSelecao,
    copiarUm,
    copiarSelecionados
  };
}
