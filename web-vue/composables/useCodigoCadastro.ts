/**
 * Codigo de cadastro x SIA (igual a tela `produtos/codigo-cadastro` do app oficial): a previa separa os
 * produtos em baldes; so os baldes de certeza sao adotados em lote; o resto e decisao item a item.
 */
export type BaldeCodigo =
  | "ja-correto"
  | "exato"
  | "barras-tem-codigo"
  | "conflito-sia"
  | "disputado"
  | "fora-do-sia"
  | "novo";
export type BaldeEmLote = "exato" | "barras-tem-codigo";

export interface ItemCodigoCadastro {
  productId: string;
  loja: string;
  nome: string;
  codigoBarras: string | null;
  codigoAtual: string | null;
  balde: BaldeCodigo;
  codigoProposto: string | null;
  motivo: string;
  candidatos: Array<{ loja: string; coditem: string; descricao: string; semelhanca?: number }>;
}

export interface PreviaCodigoCadastro {
  resumo: Record<BaldeCodigo, number>;
  teto: number;
  tetoDe: string;
  paresSia: number;
  itens: ItemCodigoCadastro[];
  confirmacao: string;
  loteMaximo: number;
}

/** Os baldes na ordem e com os textos da tela oficial. */
export const BALDES_CODIGO: Array<{ id: BaldeCodigo; titulo: string; ajuda: string }> = [
  {
    id: "exato",
    titulo: "Pronto para adotar",
    ajuda:
      "O código de barras casa com um produto do SIA e nenhum outro cadastro disputa esse código. É o único balde adotado de uma vez."
  },
  {
    id: "barras-tem-codigo",
    titulo: "Código está nas barras",
    ajuda:
      "O SIA grava o código do produto no campo do código de barras quando ele não tem etiqueta — 00000000012067 é o produto 12067. O de-para carregado NÃO lista esse código: a exportação do SIA está atrasada. Confira alguns antes de adotar o lote e reenvie um de-para novo quando puder."
  },
  {
    id: "conflito-sia",
    titulo: "Precisa de você",
    ajuda:
      "Ou as lojas discordam do código no SIA, ou o número deste produto é curto demais para ser código de barras e casou por coincidência."
  },
  {
    id: "disputado",
    titulo: "Dois cadastros, um código",
    ajuda:
      "Dois produtos apontam para o mesmo código do PDV — quase sempre cadastro duplicado. Unifique na Central antes de numerar."
  },
  {
    id: "fora-do-sia",
    titulo: "Falta no PDV",
    ajuda:
      "O produto já tem código da rede, mas o PDV ainda não o cadastrou. Nada a fazer aqui: some deste balde quando a loja cadastrar no SIA e o de-para for reenviado."
  },
  {
    id: "novo",
    titulo: "Sem código da rede",
    ajuda:
      "Não casa por código de barras e o código atual não é da faixa da rede. Sugestões por nome aparecem com a % de parecença — confira antes de clicar. Cunhar só quando nenhuma servir: cria numeração nova PARA SEMPRE."
  },
  { id: "ja-correto", titulo: "Já está certo", ajuda: "O produto já está com o código do PDV. Nada a fazer." }
];

export function useCodigoCadastro() {
  const { apiUrl } = useApi();
  const dados = ref<PreviaCodigoCadastro | null>(null);
  const carregando = ref(false);
  const erro = ref("");
  const aviso = ref<{ texto: string; tipo: "success" | "warning" | "error" } | null>(null);
  const confirmacao = ref("");
  const aplicando = ref(false);
  const decidindo = ref<string | null>(null);
  const visao = ref<BaldeCodigo>("exato");
  const busca = ref("");

  async function pedir<T>(rota: string, corpo?: object): Promise<T> {
    const resposta = await fetch(`${apiUrl}${rota}`, {
      method: corpo ? "POST" : "GET",
      credentials: "include",
      ...(corpo ? { headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) } : {})
    });
    const conteudo = (await resposta.json().catch(() => null)) as { data?: T; title?: string } | null;
    if (!resposta.ok) throw new Error(conteudo?.title ?? "Não foi possível concluir a ação.");
    return conteudo?.data as T;
  }

  const buscando = computed(() => busca.value.trim().length > 0);
  /** Com termo, busca em TODOS os baldes (oficial: "nada encontrado" sobre produto que existe engana). */
  const itens = computed(() => {
    const termo = busca.value.trim().toLowerCase();
    const todos = dados.value?.itens ?? [];
    if (!termo) return todos.filter((i) => i.balde === visao.value);
    return todos.filter(
      (i) =>
        i.nome.toLowerCase().includes(termo) ||
        (i.codigoBarras ?? "").includes(termo) ||
        (i.codigoAtual ?? "").includes(termo)
    );
  });
  const conta = (balde: BaldeCodigo) => dados.value?.resumo[balde] ?? 0;
  const fraseOk = computed(() => confirmacao.value.trim().toUpperCase() === (dados.value?.confirmacao ?? ""));

  async function carregar() {
    carregando.value = true;
    erro.value = "";
    try {
      dados.value = await pedir<PreviaCodigoCadastro>("/api/produtos/codigo-cadastro/previa");
    } catch (falha) {
      dados.value = null;
      erro.value = falha instanceof Error ? falha.message : "Não foi possível montar a prévia.";
    } finally {
      carregando.value = false;
    }
  }

  async function adotarEmLote(balde: BaldeEmLote) {
    if (!fraseOk.value) return;
    aplicando.value = true;
    try {
      const r = await pedir<{ aplicadas: number; conflitos: number; restantes: number }>(
        "/api/produtos/codigo-cadastro/adotar-exatos",
        { confirmacao: confirmacao.value, balde }
      );
      const extras = [
        r.conflitos ? `${r.conflitos} mudaram no meio do caminho ou colidem na loja` : "",
        r.restantes ? `faltam ${r.restantes} — clique de novo` : ""
      ]
        .filter(Boolean)
        .join("; ");
      aviso.value = {
        texto: `${r.aplicadas} código(s) adotado(s)${extras ? `. ${extras}.` : "."}`,
        tipo: r.conflitos || r.restantes ? "warning" : "success"
      };
      await carregar();
    } catch (falha) {
      aviso.value = { texto: falha instanceof Error ? falha.message : "Não foi possível adotar.", tipo: "error" };
    } finally {
      aplicando.value = false;
    }
  }

  async function decidir(item: ItemCodigoCadastro, corpo: { codigo?: string; cunhar?: boolean }) {
    if (!fraseOk.value) {
      aviso.value = { texto: "Digite a frase de confirmação antes de gravar.", tipo: "error" };
      return;
    }
    decidindo.value = item.productId;
    try {
      const r = await pedir<{ codigo: string }>("/api/produtos/codigo-cadastro/decidir", {
        productId: item.productId,
        // o que ESTA tela viu: e o que impede sobrescrever quem decidiu antes
        codigoAtualEsperado: item.codigoAtual,
        ...corpo,
        confirmacao: confirmacao.value
      });
      aviso.value = { texto: `${item.nome}: código ${r.codigo}.`, tipo: "success" };
      await carregar();
    } catch (falha) {
      aviso.value = { texto: falha instanceof Error ? falha.message : "Não foi possível gravar.", tipo: "error" };
    } finally {
      decidindo.value = null;
    }
  }

  return {
    dados,
    carregando,
    erro,
    aviso,
    confirmacao,
    aplicando,
    decidindo,
    visao,
    busca,
    buscando,
    itens,
    conta,
    fraseOk,
    carregar,
    adotarEmLote,
    decidir
  };
}
