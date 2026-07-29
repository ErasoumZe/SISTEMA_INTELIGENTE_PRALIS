// Estado do Lancamento (Despesa / Mercadoria / Retirada) — extraido do OperacaoLancamentoModal.vue
// para que o componente de 999 linhas vire um container enxuto + blocos coesos (R5). A LOGICA e
// IDENTICA a original: este composable e chamado UMA vez no modal (sempre montado) e o estado e
// distribuido aos blocos via provide/inject, exatamente como o workspace-context. Nada de
// api/db/shared; os campos NOVOS seguem data-pendente="regra" (estado local, nunca enviado).
import { computed, inject, ref, watch, type InjectionKey } from "vue";
import { useWorkspaceContext } from "~/components/workspace/workspace-context";
import type { ItemMercadoriaForm } from "~/utils/operacoes";

export type Cat = "despesa" | "mercadoria" | "retirada";
type TipoCredor = "fornecedor" | "colaborador" | "socios_setores";

export function useOperacaoLancamento() {
  const {
    modalOperacaoAberto,
    entidadeNova,
    trocarCategoriaLancamento,
    operacaoEditandoId,
    form,
    opcoesEmpresa,
    valorTotalOperacao,
    discriminandoDespesa,
    discriminandoMercadoria,
    itensDespesa,
    itensMercadoria,
    fotoDocumentoPreview,
    fotoDocumentoExistente,
    selecionarFotoDocumento,
    salvandoOperacao,
    salvarOperacao
  } = useWorkspaceContext();

  const CATEGORIAS: Cat[] = ["despesa", "mercadoria", "retirada"];

  const aberto = computed({
    get: () => modalOperacaoAberto.value && CATEGORIAS.includes(entidadeNova.value as Cat),
    set: (v: boolean) => {
      if (!v) modalOperacaoAberto.value = false;
    }
  });

  const cat = computed<Cat>(() =>
    CATEGORIAS.includes(entidadeNova.value as Cat) ? (entidadeNova.value as Cat) : "despesa"
  );

  const CFG: Record<Cat, { token: string; icone: string; discrimina: boolean }> = {
    despesa: { token: "despesas", icone: "mdi-receipt-text-outline", discrimina: true },
    mercadoria: { token: "mercadorias", icone: "mdi-package-variant", discrimina: true },
    retirada: { token: "retiradas", icone: "mdi-cash-remove", discrimina: false }
  };
  const cfg = computed(() => CFG[cat.value]);
  const catVars = computed(() => ({
    "--cat": `var(--cat-${cfg.value.token}-base)`,
    "--cat-soft": `var(--cat-${cfg.value.token}-soft)`
  }));

  // --- 3 botoes do TOPO: alternam a categoria SEM fechar o modal (PROJECT_BRAIN/17 §4). A cor do
  // modal acompanha (vermelho/verde/azul) porque catVars deriva de `cat`. So aparece ao CRIAR: em
  // edicao/discriminacao o registro ja tem categoria e trocar apontaria para outro endpoint. ---
  const CATEGORIAS_LANCAMENTO = CATEGORIAS.map((id) => ({
    id,
    titulo: id === "despesa" ? "Despesa" : id === "mercadoria" ? "Mercadoria" : "Retirada",
    icone: CFG[id].icone,
    token: CFG[id].token
  }));
  const podeTrocarCategoria = computed(() => !operacaoEditandoId.value);
  function trocarCategoria(destino: Cat) {
    if (!podeTrocarCategoria.value) return;
    void trocarCategoriaLancamento(destino);
  }

  // --- Grupo: roteia para o campo suportado da categoria (grupoDespesa/Mercadoria/Retirada). ---
  const grupoOpcoes = computed(() =>
    cat.value === "despesa"
      ? opcoesEmpresa.value.gruposDespesas
      : cat.value === "mercadoria"
        ? opcoesEmpresa.value.gruposMercadorias
        : opcoesEmpresa.value.gruposRetiradas
  );
  const grupoId = computed({
    get: () =>
      cat.value === "despesa"
        ? form.value.grupoDespesaId
        : cat.value === "mercadoria"
          ? form.value.grupoMercadoriaId
          : form.value.grupoRetiradaId,
    set: (v: string) => {
      if (cat.value === "despesa") form.value.grupoDespesaId = v;
      else if (cat.value === "mercadoria") form.value.grupoMercadoriaId = v;
      else form.value.grupoRetiradaId = v;
    }
  });

  // --- Tipo de credor (define a fonte de busca do campo Credor) ---
  const CREDORES: Record<Cat, TipoCredor[]> = {
    despesa: ["fornecedor", "colaborador"],
    mercadoria: ["fornecedor"],
    // Retirada: o desenho traz "Sócios/setores"; mantemos Colaborador (que o backend exige) para salvar.
    retirada: ["colaborador", "socios_setores"]
  };
  const rotuloCredor: Record<TipoCredor, string> = {
    fornecedor: "Fornecedor",
    colaborador: "Colaborador",
    socios_setores: "Sócios / setores"
  };
  const tipoCredor = ref<TipoCredor>("fornecedor");
  watch(
    cat,
    (c) => {
      const primeiro = CREDORES[c][0];
      if (primeiro && !CREDORES[c].includes(tipoCredor.value)) tipoCredor.value = primeiro;
    },
    { immediate: true }
  );
  const credorOpcoes = computed(() =>
    tipoCredor.value === "fornecedor"
      ? opcoesEmpresa.value.fornecedores
      : tipoCredor.value === "colaborador"
        ? opcoesEmpresa.value.colaboradores
        : opcoesEmpresa.value.setores
  );
  // TODO(regras): "Sócios/setores" nao tem coluna propria de credor — fica LOCAL (data-pendente).
  const socioSetorId = ref("");
  const credorId = computed({
    get: () =>
      tipoCredor.value === "fornecedor"
        ? form.value.fornecedorId
        : tipoCredor.value === "colaborador"
          ? form.value.colaboradorId
          : socioSetorId.value,
    set: (v: string) => {
      if (tipoCredor.value === "fornecedor") form.value.fornecedorId = v;
      else if (tipoCredor.value === "colaborador") form.value.colaboradorId = v;
      else socioSetorId.value = v;
    }
  });

  // Pagamento (toggle S/N): derivado de dataPagamento (campo suportado). Sem data = nao pago.
  const pago = computed({
    get: () => Boolean(form.value.dataPagamento),
    set: (v: boolean) => {
      form.value.dataPagamento = v ? form.value.dataPagamento || hojeISO.value : "";
    }
  });

  // --- Campos SEM backend nesta rodada (data-pendente="regra"): estado LOCAL, nunca enviado. ---
  // TODO(regras): Data e N do Documento Fiscal no lancamento.
  const dataDocFiscal = ref("");
  const numeroDocFiscal = ref("");
  // Foto 1 (Recibo/Boleto/Nota): campo SUPORTADO. Extrai o File do input nativo e reusa o handler do
  // contexto (que espera File | File[] | null, nao um Event).
  function onFotoDocumento(e: Event) {
    selecionarFotoDocumento((e.target as HTMLInputElement).files?.[0] ?? null);
  }
  // TODO(regras): segunda foto (nota/interno) — sem upload nesta rodada.
  const fotoInternaNome = ref("");
  function selecionarFotoInterna(e: Event) {
    const arquivo = (e.target as HTMLInputElement).files?.[0];
    fotoInternaNome.value = arquivo?.name ?? "";
  }
  // TODO(regras): Recorrencia (numero de repeticoes, dias da semana, frequencia).
  const recorrenciaAberta = ref(false);
  const recorrenciaNumero = ref("1");
  const DIAS = ["Sg", "Ter", "Qa", "Qi", "Sx", "Sa"];
  const recorrenciaDias = ref<boolean[]>([false, false, false, false, false, false]);
  const FREQUENCIAS = ["dia", "semana", "mês", "quinzena", "3 em 3"];
  const recorrenciaFrequencia = ref("mês");

  const discriminando = computed({
    get: () => (cat.value === "despesa" ? discriminandoDespesa.value : discriminandoMercadoria.value),
    set: (v: boolean) => {
      if (cat.value === "despesa") discriminandoDespesa.value = v;
      else discriminandoMercadoria.value = v;
    }
  });

  // --- Discriminação (FOTO 3): desconto GERAL "Vale Presente" (R$ ou %) distribuído nas linhas. O
  // valor em R$ vai para form.valorDesconto (SUPORTADO — salva). As colunas c/Desc e % e os totais
  // são RECÁLCULO no front (não persistidos). Em Mercadoria a Descrição vem do cadastro de produto. ---
  const modoDesconto = ref<"valor" | "percentual">("valor");
  const descontoInput = ref("");
  const totalGeralBruto = computed(() =>
    itensMercadoria.value.reduce((soma, it) => soma + Number(it.quantidade || 0) * Number(it.valorUnitario || 0), 0)
  );
  const descontoFrac = computed(() => {
    const bruto = totalGeralBruto.value;
    if (modoDesconto.value === "percentual") return Math.min(1, Math.max(0, Number(descontoInput.value || 0) / 100));
    return bruto > 0 ? Math.min(1, Math.max(0, Number(descontoInput.value || 0) / bruto)) : 0;
  });
  const descontoValorReais = computed(() => totalGeralBruto.value * descontoFrac.value);
  const totalGeralComDesc = computed(() => totalGeralBruto.value - descontoValorReais.value);
  const pctEfetivo = computed(() => descontoFrac.value * 100);
  // Espelha o desconto geral no campo suportado do header (em R$) para salvar de verdade.
  watch(descontoValorReais, (v) => {
    form.value.valorDesconto = v ? v.toFixed(2) : "";
  });
  function totalLinha(it: ItemMercadoriaForm) {
    return Number(it.quantidade || 0) * Number(it.valorUnitario || 0);
  }
  function unitComDesc(it: ItemMercadoriaForm) {
    return Number(it.valorUnitario || 0) * (1 - descontoFrac.value);
  }
  function totalLinhaComDesc(it: ItemMercadoriaForm) {
    return totalLinha(it) * (1 - descontoFrac.value);
  }
  function brn(n: number) {
    return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  // Mercadoria: a Descrição vem do cadastro de produto (preenche produtoId + descrição).
  function escolherProduto(item: ItemMercadoriaForm, produtoId: string) {
    item.produtoId = produtoId;
    const p = opcoesEmpresa.value.produtos.find((x) => x.id === produtoId);
    if (p?.descricao) item.descricao = p.descricao;
  }
  function novoItemMercadoria() {
    itensMercadoria.value.push({
      descricao: "",
      quantidade: "1",
      valorUnitario: "",
      descontoTipo: "",
      descontoValor: "",
      valorTotal: "",
      produtoId: "",
      grupoMercadoriaId: "",
      unidadeMedidaId: ""
    });
  }

  function dataISO(offset: number) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  }
  const hojeISO = computed(() => dataISO(0));

  return {
    // contexto compartilhado usado pelos blocos
    form,
    opcoesEmpresa,
    valorTotalOperacao,
    operacaoEditandoId,
    salvandoOperacao,
    salvarOperacao,
    aberto,
    cat,
    cfg,
    catVars,
    // alternancia de categoria (3 botoes do topo)
    CATEGORIAS_LANCAMENTO,
    podeTrocarCategoria,
    trocarCategoria,
    // classificacao (grupo/credor)
    grupoOpcoes,
    grupoId,
    CREDORES,
    rotuloCredor,
    tipoCredor,
    credorOpcoes,
    credorId,
    // pagamento / datas
    pago,
    hojeISO,
    dataDocFiscal,
    numeroDocFiscal,
    // fotos
    fotoDocumentoPreview,
    fotoDocumentoExistente,
    onFotoDocumento,
    fotoInternaNome,
    selecionarFotoInterna,
    // discriminacao
    discriminando,
    itensDespesa,
    itensMercadoria,
    modoDesconto,
    descontoInput,
    totalGeralBruto,
    descontoValorReais,
    totalGeralComDesc,
    pctEfetivo,
    totalLinha,
    unitComDesc,
    totalLinhaComDesc,
    brn,
    escolherProduto,
    novoItemMercadoria,
    // recorrencia
    recorrenciaAberta,
    recorrenciaNumero,
    DIAS,
    recorrenciaDias,
    FREQUENCIAS,
    recorrenciaFrequencia
  };
}

export type OperacaoLancamentoBloco = ReturnType<typeof useOperacaoLancamento>;

export const OPERACAO_LANCAMENTO_KEY: InjectionKey<OperacaoLancamentoBloco> = Symbol("operacao-lancamento-bloco");

// Inject helper: os blocos coesos leem o estado daqui (analogo ao useWorkspaceContext).
export function useOperacaoLancamentoBloco() {
  const bloco = inject(OPERACAO_LANCAMENTO_KEY);
  if (!bloco) throw new Error("Bloco de lancamento precisa ser usado dentro do OperacaoLancamentoModal.");
  return bloco;
}
