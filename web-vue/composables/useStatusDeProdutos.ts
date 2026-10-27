import { fraseDeInativacaoEmLote } from "@padaria/shared";
import { mensagemErro } from "~/utils/domain";

/**
 * Ativar/inativar na propria listagem (oficial) e inativar em lote (so administrador). Nao existe
 * excluir: o produto sai de uso pelo status. Depois de qualquer troca a lista e recarregada do
 * servidor — o filtro "So ativos" pode tirar o item da tela, e so o servidor sabe a pagina certa.
 */
export function useStatusDeProdutos(empresaId: Ref<string>, recarregar: () => Promise<void> | void) {
  const { apiPatch } = useApi();
  const emAlteracao = ref<Set<string>>(new Set());
  const selecionados = ref<string[]>([]);
  const mensagem = ref<{ tipo: "success" | "error"; texto: string } | null>(null);
  const inativandoLote = ref(false);

  const fraseDoLote = computed(() => fraseDeInativacaoEmLote(selecionados.value.length));

  function marcar(id: string, ligado: boolean) {
    const proximo = new Set(emAlteracao.value);
    if (ligado) proximo.add(id);
    else proximo.delete(id);
    emAlteracao.value = proximo;
  }

  async function alternar(produto: { id: string; status: string; nomeCatalogo: string | null; descricao: string }) {
    if (emAlteracao.value.has(produto.id)) return;
    const status = produto.status === "ativo" ? "inativo" : "ativo";
    marcar(produto.id, true);
    mensagem.value = null;
    try {
      await apiPatch("/api/produtos/status", { empresaId: empresaId.value, ids: [produto.id], status });
      mensagem.value = {
        tipo: "success",
        texto: `${produto.nomeCatalogo || produto.descricao} ${status === "ativo" ? "ativado" : "inativado"}.`
      };
      await recarregar();
    } catch (falha) {
      mensagem.value = { tipo: "error", texto: mensagemErro(falha) };
    } finally {
      marcar(produto.id, false);
    }
  }

  function alternarSelecao(id: string) {
    selecionados.value = selecionados.value.includes(id)
      ? selecionados.value.filter((item) => item !== id)
      : [...selecionados.value, id];
  }

  /** Devolve `true` quando o lote foi inativado (o dialogo fecha). */
  async function inativarSelecionados(confirmacao: string): Promise<boolean> {
    if (inativandoLote.value || !selecionados.value.length) return false;
    inativandoLote.value = true;
    mensagem.value = null;
    try {
      const resultado = await apiPatch<{ alterados: string[]; ignorados: string[] }>("/api/produtos/status", {
        empresaId: empresaId.value,
        ids: selecionados.value,
        status: "inativo",
        confirmacao
      });
      const ignorados = resultado.ignorados.length
        ? ` ${resultado.ignorados.length} não encontrado(s) nesta loja.`
        : "";
      mensagem.value = { tipo: "success", texto: `${resultado.alterados.length} produto(s) inativado(s).${ignorados}` };
      selecionados.value = [];
      await recarregar();
      return true;
    } catch (falha) {
      mensagem.value = { tipo: "error", texto: mensagemErro(falha) };
      return false;
    } finally {
      inativandoLote.value = false;
    }
  }

  // Trocar de loja invalida a selecao: os ids sao da loja anterior.
  watch(empresaId, () => {
    selecionados.value = [];
  });

  return {
    emAlteracao,
    selecionados,
    mensagem,
    inativandoLote,
    fraseDoLote,
    alternar,
    alternarSelecao,
    inativarSelecionados
  };
}
