/**
 * Manutencao de pesaveis (iguais aos cards da `manutencao` do app oficial): pela exportacao do SIA (TNP),
 * classificar quem nao tem valor e padronizar todos os ativos. Toda acao tem previa sem gravar; gravar
 * exige a frase e o hash da previa — se algo mudou no meio, o servidor recusa e nada e gravado.
 */
export interface PreviaPesaveisExportacao {
  loja: string;
  totalFonte: number;
  pesaveisFonte: number;
  validadeZero: number;
  atualizarProdutos: number;
  atualizarEspelhos: number;
  jaCorretos: number;
  semProduto: string[];
  codigoAmbiguo: string[];
  espelhoAmbiguo: string[];
  semEspelho: string[];
  amostra: Array<{ codigoInterno: string; nome: string; validadeDias: number }>;
  hashArquivo: string;
  hashPlano: string;
  confirmacao: string;
}

export interface PreviaPesavelBackfill {
  loja: string;
  totalProdutos: number;
  gravar: number;
  porOrigem: { espelho: number; padrao: number };
  completarBalanca: number;
  jaDefinidos: number;
  conflitos: Array<{ codigoInterno: string; nome: string; cadastro: string; espelho: string }>;
  espelhoCorrigir: Array<{ codigoInterno: string; nome: string; pesavel: string }>;
  espelhoAmbiguo: string[];
  espelhoIncompleto: string[];
  amostraPesaveis: Array<{ codigoInterno: string; nome: string; validadeDias: number }>;
  hashPlano: string;
  confirmacao: string;
}

export interface PreviaPesavelPadronizar {
  loja: string;
  totalAtivos: number;
  gravar: number;
  jaNoPadrao: number;
  invertidos: number;
  semValor: number;
  barrasProprias: number;
  paraS: number;
  paraN: number;
  espelhoCorrigir: number;
  semEspelho: number;
  amostraInvertidos: Array<{ codigoInterno: string; nome: string }>;
  amostraNaoPesaveis: Array<{ codigoInterno: string; codigoBarras: string; nome: string }>;
  hashPlano: string;
  confirmacao: string;
}

type Envelope<T> = { data?: T; title?: string } | null;

function usePedido() {
  const { apiUrl } = useApi();
  return async function pedir<T>(rota: string, init: RequestInit = {}): Promise<T> {
    const resposta = await fetch(`${apiUrl}${rota}`, { credentials: "include", ...init });
    const conteudo = (await resposta.json().catch(() => null)) as Envelope<T>;
    if (!resposta.ok) throw new Error(conteudo?.title ?? "Não foi possível concluir a ação.");
    return conteudo?.data as T;
  };
}

/** Estado comum de uma acao com previa: conferir, digitar a frase, gravar. */
function useAcaoComPrevia<P extends { confirmacao: string }>(empresaId: Ref<string>) {
  const previa = ref<P | null>(null) as Ref<P | null>;
  const confirmacao = ref("");
  const conferindo = ref(false);
  const gravando = ref(false);
  const erro = ref("");
  const sucesso = ref("");
  watch(empresaId, () => {
    previa.value = null;
    confirmacao.value = "";
  });
  const fraseOk = computed(
    () => Boolean(previa.value) && confirmacao.value.trim().toUpperCase() === previa.value?.confirmacao
  );
  async function rodar(fazer: () => Promise<void>, emAndamento: Ref<boolean>) {
    emAndamento.value = true;
    erro.value = "";
    sucesso.value = "";
    try {
      await fazer();
    } catch (falha) {
      erro.value = falha instanceof Error ? falha.message : "Não foi possível concluir a ação.";
    } finally {
      emAndamento.value = false;
    }
  }
  return { previa, confirmacao, conferindo, gravando, erro, sucesso, fraseOk, rodar };
}

export function usePesaveisExportacao(empresaId: Ref<string>) {
  const pedir = usePedido();
  const acao = useAcaoComPrevia<PreviaPesaveisExportacao>(empresaId);
  const arquivo = ref<File | null>(null);
  watch(arquivo, () => {
    acao.previa.value = null;
    acao.confirmacao.value = "";
  });
  const corpo = () => {
    const dados = new FormData();
    dados.append("arquivo", arquivo.value as File);
    return dados;
  };
  const bloqueado = computed(
    () => (acao.previa.value?.codigoAmbiguo.length ?? 0) + (acao.previa.value?.espelhoAmbiguo.length ?? 0) > 0
  );
  const conferir = () =>
    acao.rodar(async () => {
      if (!arquivo.value) return;
      acao.previa.value = await pedir<PreviaPesaveisExportacao>(
        `/api/produtos/pesaveis/previa?empresaId=${encodeURIComponent(empresaId.value)}`,
        { method: "POST", body: corpo() }
      );
    }, acao.conferindo);
  const gravar = () =>
    acao.rodar(async () => {
      const previa = acao.previa.value;
      if (!previa || !acao.fraseOk.value || bloqueado.value) return;
      const consulta = new URLSearchParams({
        empresaId: empresaId.value,
        confirmacao: acao.confirmacao.value,
        hashArquivo: previa.hashArquivo,
        hashPlano: previa.hashPlano
      });
      const feito = await pedir<{ produtosAtualizados: number; espelhosAtualizados: number }>(
        `/api/produtos/pesaveis?${consulta}`,
        { method: "POST", body: corpo() }
      );
      acao.sucesso.value = `${feito.produtosAtualizados} produto(s) e ${feito.espelhosAtualizados} linha(s) do de-para atualizados.`;
      acao.previa.value = null;
      acao.confirmacao.value = "";
    }, acao.gravando);
  return { ...acao, arquivo, bloqueado, conferir, gravar };
}

export function usePesavelBackfill(empresaId: Ref<string>) {
  const pedir = usePedido();
  const acao = useAcaoComPrevia<PreviaPesavelBackfill>(empresaId);
  const manterCadastro = ref(false);
  watch(manterCadastro, () => {
    acao.previa.value = null;
    acao.confirmacao.value = "";
  });
  const conflitos = computed(() => (manterCadastro.value ? "manterCadastro" : "bloquear"));
  const bloqueado = computed(
    () => (acao.previa.value?.conflitos.length ?? 0) + (acao.previa.value?.espelhoAmbiguo.length ?? 0) > 0
  );
  const conferir = () =>
    acao.rodar(async () => {
      const consulta = new URLSearchParams({ empresaId: empresaId.value, conflitos: conflitos.value });
      acao.previa.value = await pedir<PreviaPesavelBackfill>(`/api/produtos/pesavel-backfill/previa?${consulta}`);
    }, acao.conferindo);
  const gravar = () =>
    acao.rodar(async () => {
      const previa = acao.previa.value;
      if (!previa || !acao.fraseOk.value || bloqueado.value) return;
      const feito = await pedir<{ gravados: number; completados: number; espelhosCorrigidos: number }>(
        "/api/produtos/pesavel-backfill",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            empresaId: empresaId.value,
            confirmacao: acao.confirmacao.value,
            hashPlano: previa.hashPlano,
            conflitos: conflitos.value
          })
        }
      );
      acao.sucesso.value =
        `${feito.gravados} produto(s) classificados e ${feito.completados} completados.` +
        (feito.espelhosCorrigidos ? ` ${feito.espelhosCorrigidos} linha(s) do de-para corrigidas pelo cadastro.` : "");
      acao.previa.value = null;
      acao.confirmacao.value = "";
    }, acao.gravando);
  return { ...acao, manterCadastro, bloqueado, conferir, gravar };
}

export function usePesavelPadronizar(empresaId: Ref<string>) {
  const pedir = usePedido();
  const acao = useAcaoComPrevia<PreviaPesavelPadronizar>(empresaId);
  // Oficial: por padrao, quem tem codigo de barras proprio fica N (a balanca nao aceita acima de 999999).
  const barrasPropriasPesaveis = ref(false);
  watch(barrasPropriasPesaveis, () => {
    acao.previa.value = null;
    acao.confirmacao.value = "";
  });
  const barrasProprias = computed(() => (barrasPropriasPesaveis.value ? "pesavel" : "naoPesavel"));
  const conferir = () =>
    acao.rodar(async () => {
      const consulta = new URLSearchParams({ empresaId: empresaId.value, barrasProprias: barrasProprias.value });
      acao.previa.value = await pedir<PreviaPesavelPadronizar>(`/api/produtos/pesavel-padronizar/previa?${consulta}`);
    }, acao.conferindo);
  const gravar = () =>
    acao.rodar(async () => {
      const previa = acao.previa.value;
      if (!previa || !acao.fraseOk.value) return;
      const feito = await pedir<{ gravados: number; paraS: number; paraN: number; espelhosCorrigidos: number }>(
        "/api/produtos/pesavel-padronizar",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            empresaId: empresaId.value,
            confirmacao: acao.confirmacao.value,
            hashPlano: previa.hashPlano,
            barrasProprias: barrasProprias.value
          })
        }
      );
      acao.sucesso.value = `${feito.gravados} produto(s) padronizados (${feito.paraS} pesáveis, ${feito.paraN} não) e ${feito.espelhosCorrigidos} linha(s) do de-para.`;
      acao.previa.value = null;
      acao.confirmacao.value = "";
    }, acao.gravando);
  return { ...acao, barrasPropriasPesaveis, conferir, gravar };
}
