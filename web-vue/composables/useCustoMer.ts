/**
 * Custo pela discriminacao de mercadorias (igual a tela `produtos/custo-discriminacao` do app oficial, DB-05):
 * o custo da compra mais recente, convertido para a embalagem. No ERP grava so nos produtos da TNP.
 */
export type MotivoSemCusto = "sem-lancamento" | "nome-ambiguo-no-cadastro" | "custo-ilegivel" | "ja-esta-certo";
export type EstadoMer = "ok" | "sem-destino" | "sem-coluna" | "falhou";

export interface PropostaCusto {
  productId: string;
  nome: string;
  custoAtual: number | null;
  custoNovo: number | null;
  custoUnitario: number | null;
  qtCad: number;
  fonte: string | null;
}

export interface PreviaCustoMer {
  estado: EstadoMer;
  truncada: boolean;
  erro?: string;
  linhaCabecalho: number | null;
  lancamentos: number;
  lancamentosDescartados: number;
  comCusto: number;
  semCusto: Record<MotivoSemCusto, number>;
  amostra: PropostaCusto[];
  /** O que a previa mostrou: gravar sobre outra coisa e recusado (409). */
  hashPlano: string | null;
  confirmacao: string;
  loteMaximo: number;
}

export const MOTIVO_SEM_CUSTO: Record<MotivoSemCusto, string> = {
  "sem-lancamento": "Sem compra nesta base",
  "ja-esta-certo": "Já está com o custo da última compra",
  "nome-ambiguo-no-cadastro": "Dois cadastros com o mesmo nome — não dá para saber de qual é a nota",
  "custo-ilegivel": "O valor na planilha não é um número"
};

export const AVISO_MER: Record<Exclude<EstadoMer, "ok">, string> = {
  "sem-destino":
    "A planilha de discriminação não está configurada no ERP (GOOGLE_PRODUTOS_MER_SPREADSHEET_ID). Sem ela a tela não lê nada — de propósito, para não ler a planilha errada.",
  "sem-coluna":
    "Não encontrei as colunas PRODUTOS, VALOR CUSTO UN e DATA REF nas primeiras linhas da aba. O cabeçalho é procurado, não fixado — mas ele precisa existir.",
  falhou: "A planilha não respondeu. Nada foi lido; tente de novo em instantes."
};

export function useCustoMer() {
  const { apiUrl } = useApi();
  const dados = ref<PreviaCustoMer | null>(null);
  const carregando = ref(false);
  const aplicando = ref(false);
  const erro = ref("");
  const aviso = ref<{ texto: string; tipo: "success" | "warning" | "error" } | null>(null);
  const confirmacao = ref("");
  const fraseOk = computed(() => confirmacao.value.trim().toUpperCase() === (dados.value?.confirmacao ?? ""));

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

  async function carregar() {
    carregando.value = true;
    erro.value = "";
    try {
      dados.value = await pedir<PreviaCustoMer>("/api/produtos/custo-discriminacao/previa");
    } catch (falha) {
      dados.value = null;
      erro.value = falha instanceof Error ? falha.message : "Não foi possível montar a prévia.";
    } finally {
      carregando.value = false;
    }
  }

  async function aplicar() {
    if (!fraseOk.value) return;
    aplicando.value = true;
    try {
      const r = await pedir<{ aplicados: number; conflitos: number; restantes: number }>(
        "/api/produtos/custo-discriminacao",
        { confirmacao: confirmacao.value, hashPlano: dados.value?.hashPlano }
      );
      const extras = [
        r.conflitos ? `${r.conflitos} foram editados no meio do caminho e ficaram como estavam` : "",
        r.restantes ? `faltam ${r.restantes} — clique de novo` : ""
      ]
        .filter(Boolean)
        .join("; ");
      aviso.value = {
        texto: `${r.aplicados} custo(s) gravado(s)${extras ? `. ${extras}.` : "."}`,
        tipo: r.conflitos || r.restantes ? "warning" : "success"
      };
      await carregar();
    } catch (falha) {
      aviso.value = { texto: falha instanceof Error ? falha.message : "Não foi possível gravar.", tipo: "error" };
    } finally {
      aplicando.value = false;
    }
  }

  return { dados, carregando, aplicando, erro, aviso, confirmacao, fraseOk, carregar, aplicar };
}
