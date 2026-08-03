// Estado do Lancamento (Despesa / Mercadoria / Retirada) — extraido do OperacaoLancamentoModal.vue
// para que o componente de 999 linhas vire um container enxuto + blocos coesos (R5). A LOGICA e
// IDENTICA a original: este composable e chamado UMA vez no modal (sempre montado) e o estado e
// distribuido aos blocos via provide/inject, exatamente como o workspace-context. Nada de
// api/db/shared; este composable liga a tela ao contrato persistido.
import { computed, inject, ref, watch, type InjectionKey } from "vue";
import { useWorkspaceContext } from "~/components/workspace/workspace-context";
import type { FrequenciaRecorrencia } from "@padaria/shared/recorrencia";
// Pela RAIZ do pacote, nao por `@padaria/shared/datas`: o `nuxt.config` apelida `@padaria/shared`
// para o ARQUIVO `shared/src/index.ts`, e o alias do Vite casa por prefixo — o subcaminho viraria
// `.../index.ts/datas` e o modulo vem 404 no navegador. O typecheck passa (resolve por exports do
// package.json) e a tela quebra calada: foi o que aconteceu aqui.
import { diaNegocio } from "@padaria/shared";
import {
  DIAS_RECORRENCIA,
  FREQUENCIAS_RECORRENCIA,
  grupoItemEscolhido,
  opcaoGrupoItem,
  type ItemDespesaForm,
  type ItemMercadoriaForm
} from "~/utils/operacoes";

export type Cat = "despesa" | "mercadoria" | "retirada";
type TipoCredor = "fornecedor" | "colaborador" | "socio_gestor";

export function useOperacaoLancamento() {
  const {
    modalOperacaoAberto,
    empresaId,
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
    erroDiscriminacaoLinha,
    erroDiscriminacaoCampo,
    fotoDocumentoPreview,
    fotoDocumentoExistente,
    selecionarFotoDocumento,
    fotoNotaPreview,
    fotoNotaExistente,
    selecionarFotoNota,
    salvandoOperacao,
    salvarOperacao,
    contaTravadaDoCaixa,
    contaTravadaDoCaixaNome,
    podeUsarRecorrencia,
    recorrencia
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

  // R-121: com a conta travada, o campo nao e escolha — entao o formulario ja nasce com ela. Sem
  // isto o select desabilitado apareceria em "—" e o payload sairia sem conta, deixando a correcao
  // por conta do servidor em vez da tela. `immediate` cobre o caso do status do caixa chegar depois.
  watch(
    [aberto, contaTravadaDoCaixa],
    ([estaAberto, conta]) => {
      if (estaAberto && conta) form.value.contaOrigemId = conta;
    },
    { immediate: true }
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
    (cat.value === "despesa"
      ? opcoesEmpresa.value.gruposDespesas
      : cat.value === "mercadoria"
        ? opcoesEmpresa.value.gruposMercadorias
        : opcoesEmpresa.value.gruposRetiradas
    ).filter((grupo) => grupo.ativo !== false)
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
  // R-128: a Retirada oferece FORNECEDOR e SOCIO/GESTOR, fiel a FOTO 2 ("Fornecedor — Despesas /
  // Mercadorias / Retiradas" e "Socios — Retiradas"). Colaborador nunca esteve na Retirada no
  // desenho; era o codigo que divergia.
  const CREDORES: Record<Cat, TipoCredor[]> = {
    despesa: ["fornecedor", "colaborador"],
    mercadoria: ["fornecedor"],
    retirada: ["fornecedor", "socio_gestor"]
  };
  const rotuloCredor: Record<TipoCredor, string> = {
    fornecedor: "Fornecedor",
    colaborador: "Colaborador",
    socio_gestor: "Sócio / gestor"
  };
  const tipoCredor = ref<TipoCredor>("fornecedor");
  // O tipo do registro em edicao. `credorTipo` e a resposta boa, mas o historico tem lancamento com
  // a coluna NULA — ali quem responde e o ID que veio preenchido. Sem esse segundo caminho a
  // retirada antiga (colaborador, credor_tipo nulo) abria com o campo Credor em "—" e salvar
  // apagaria, na cara do usuario, quem recebeu o dinheiro. Verificado na tela: era o que acontecia.
  const credorTipoGravado = computed<TipoCredor | null>(() => {
    const tipo = form.value.credorTipo as TipoCredor | "" | undefined;
    if (tipo) return tipo;
    if (form.value.colaboradorId) return "colaborador";
    if (form.value.socioGestorId) return "socio_gestor";
    if (form.value.fornecedorId) return "fornecedor";
    return null;
  });
  // R-128: retirada ANTIGA foi gravada com colaborador. O tipo legado entra na lista SO quando o
  // registro ABERTO usa ele — lancamento novo nao ganha a opcao de volta.
  //
  // Fica preso ao REGISTRO, nao ao estado corrente do formulario: derivado direto do form, o chip
  // "Colaborador" sumia no instante em que o usuario clicava em "Fornecedor" para olhar, e ele nao
  // tinha como voltar — so cancelando a edicao inteira. Zera quando o modal troca de registro.
  const credorLegado = ref<TipoCredor | null>(null);
  let registroDoLegado: string | null | undefined;
  watch(
    [() => operacaoEditandoId.value, credorTipoGravado, cat],
    ([id, tipo, categoria]) => {
      if (id !== registroDoLegado) {
        registroDoLegado = id;
        credorLegado.value = null;
      }
      if (tipo && !CREDORES[categoria].includes(tipo)) credorLegado.value = tipo;
    },
    { immediate: true }
  );
  const credoresOferecidos = computed<TipoCredor[]>(() => {
    const oferta = CREDORES[cat.value];
    const legado = credorLegado.value;
    return legado && !oferta.includes(legado) ? [...oferta, legado] : oferta;
  });
  watch(
    cat,
    (c) => {
      const primeiro = CREDORES[c][0];
      if (primeiro && !credoresOferecidos.value.includes(tipoCredor.value)) tipoCredor.value = primeiro;
    },
    { immediate: true }
  );
  const credorOpcoes = computed(() =>
    tipoCredor.value === "fornecedor"
      ? opcoesEmpresa.value.fornecedores
      : tipoCredor.value === "colaborador"
        ? opcoesEmpresa.value.colaboradores
        : opcoesEmpresa.value.sociosGestores
  );
  const credorId = computed({
    get: () =>
      tipoCredor.value === "fornecedor"
        ? form.value.fornecedorId
        : tipoCredor.value === "colaborador"
          ? form.value.colaboradorId
          : form.value.socioGestorId,
    set: (v: string) => {
      form.value.fornecedorId = tipoCredor.value === "fornecedor" ? v : "";
      form.value.colaboradorId = tipoCredor.value === "colaborador" ? v : "";
      form.value.socioGestorId = tipoCredor.value === "socio_gestor" ? v : "";
      form.value.credorTipo = tipoCredor.value;
    }
  });
  watch(
    credorTipoGravado,
    (tipo) => {
      if (tipo && credoresOferecidos.value.includes(tipo)) tipoCredor.value = tipo;
    },
    { immediate: true }
  );
  // Clicar no chip e escolha do usuario e tem de VENCER o que estava gravado — por isso limpa os
  // tres ids e assume o tipo. Sem limpar, trocar de tipo num registro antigo deixaria o id do credor
  // velho no payload (dois credores, que o servidor recusa) e `credorTipoGravado` puxaria o chip de
  // volta para o tipo legado, prendendo o usuario no valor que ele acabou de tentar trocar.
  function escolherTipoCredor(tipo: TipoCredor) {
    tipoCredor.value = tipo;
    form.value.fornecedorId = "";
    form.value.colaboradorId = "";
    form.value.socioGestorId = "";
    form.value.credorTipo = tipo;
  }

  // Pagamento (toggle S/N): derivado de dataPagamento (campo suportado). Sem data = nao pago.
  const pago = computed({
    get: () => Boolean(form.value.dataPagamento),
    set: (v: boolean) => {
      form.value.dataPagamento = v ? form.value.dataPagamento || hojeISO.value : "";
    }
  });

  const dataDocFiscal = computed({
    get: () => form.value.dataDocumentoFiscal,
    set: (valor: string) => (form.value.dataDocumentoFiscal = valor)
  });
  const numeroDocFiscal = computed({
    get: () => form.value.numeroDocumentoFiscal,
    set: (valor: string) => (form.value.numeroDocumentoFiscal = valor)
  });
  // Foto 1 (Recibo/Boleto/Nota): campo SUPORTADO. Extrai o File do input nativo e reusa o handler do
  // contexto (que espera File | File[] | null, nao um Event).
  function onFotoDocumento(e: Event) {
    selecionarFotoDocumento((e.target as HTMLInputElement).files?.[0] ?? null);
  }
  function onFotoNota(e: Event) {
    selecionarFotoNota((e.target as HTMLInputElement).files?.[0] ?? null);
  }
  // --- Recorrencia (D3) — SUPORTADA: o servidor cria a serie inteira no salvar. ---------------
  // O estado vive no workspace (e de la que o payload sai); aqui ficam so os atalhos de leitura e
  // escrita que o bloco da tela usa. Os DIAS so aparecem na frequencia 'semana': "toda terca" nao
  // significa nada numa serie mensal.
  const DIAS = DIAS_RECORRENCIA;
  const FREQUENCIAS = FREQUENCIAS_RECORRENCIA;
  const recorrenciaAberta = computed({
    get: () => recorrencia.value.aberta,
    set: (v: boolean) => {
      recorrencia.value = { ...recorrencia.value, aberta: v };
    }
  });
  const recorrenciaNumero = computed({
    get: () => recorrencia.value.numero,
    set: (v: string) => {
      recorrencia.value = { ...recorrencia.value, numero: v };
    }
  });
  const recorrenciaFrequencia = computed({
    get: () => recorrencia.value.frequencia,
    set: (v: FrequenciaRecorrencia) => {
      recorrencia.value = { ...recorrencia.value, frequencia: v };
    }
  });
  const recorrenciaDias = computed(() => recorrencia.value.dias);
  function alternarDiaRecorrencia(indice: number) {
    const dias = [...recorrencia.value.dias];
    dias[indice] = !dias[indice];
    recorrencia.value = { ...recorrencia.value, dias };
  }
  const recorrenciaSemanal = computed(() => recorrencia.value.frequencia === "semana");
  const confirmarCancelamentoSerie = ref(false);
  const cancelandoSerie = ref(false);
  async function cancelarSerie() {
    if (!form.value.recorrenciaId) return;
    cancelandoSerie.value = true;
    try {
      const { apiPatch } = useApi();
      await apiPatch(`/api/recorrencias/${form.value.recorrenciaId}/cancelar`, {
        empresaId: empresaId.value,
        dominio: cat.value
      });
      confirmarCancelamentoSerie.value = false;
      form.value.recorrenciaId = "";
    } finally {
      cancelandoSerie.value = false;
    }
  }

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
  const modoDesconto = computed<"valor" | "percentual">({
    get: () => form.value.descontoGeralTipo || "valor",
    set: (valor) => (form.value.descontoGeralTipo = valor)
  });
  const descontoInput = computed({
    get: () => form.value.descontoGeralValor,
    set: (valor: string) => (form.value.descontoGeralValor = valor)
  });
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
  function aplicarDesconto(valor: number, tipo: string, informado: string) {
    const numero = Number(informado || 0);
    return Math.max(0, valor - (tipo === "percentual" ? (valor * numero) / 100 : tipo === "valor" ? numero : 0));
  }
  function unitComDesc(it: ItemMercadoriaForm) {
    return aplicarDesconto(Number(it.valorUnitario || 0), it.descontoTipo, it.descontoValor);
  }
  function totalLinhaComDesc(it: ItemMercadoriaForm) {
    const aposUnitario = unitComDesc(it) * Number(it.quantidade || 0);
    return aplicarDesconto(aposUnitario, it.descontoTotalTipo, it.descontoTotalValor) * (1 - descontoFrac.value);
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
      descontoTotalTipo: "",
      descontoTotalValor: "",
      valorTotal: "",
      produtoId: "",
      grupoMercadoriaId: "",
      grupoPatrimonioId: "",
      unidadeMedidaId: ""
    });
  }
  function novoItemDespesa() {
    itensDespesa.value.push({
      descricao: "",
      valor: "",
      grupoDespesaId: "",
      grupoPatrimonioId: "",
      quantidade: "1",
      valorUnitario: "",
      descontoTipo: "",
      descontoValor: "",
      descontoTotalTipo: "",
      descontoTotalValor: ""
    });
  }

  // --- Campo Grupo do ITEM (§5, item 6): grupo do cadastro proprio OU do patrimonio ------------
  // Um select so, dois blocos (<optgroup>). A logica pura vive em utils/operacoes: aqui so ligamos
  // no item. Escrever por aqui zera sempre a outra origem — nao ha estado intermediario invalido.
  const gruposPatrimonio = computed(() => opcoesEmpresa.value.gruposPatrimonio);
  function grupoItemDespesa(item: ItemDespesaForm) {
    return opcaoGrupoItem(item.grupoDespesaId, item.grupoPatrimonioId);
  }
  function definirGrupoItemDespesa(item: ItemDespesaForm, valor: string) {
    const escolha = grupoItemEscolhido(valor);
    item.grupoDespesaId = escolha.grupoProprioId;
    item.grupoPatrimonioId = escolha.grupoPatrimonioId;
  }
  function grupoItemMercadoria(item: ItemMercadoriaForm) {
    return opcaoGrupoItem(item.grupoMercadoriaId, item.grupoPatrimonioId);
  }
  function definirGrupoItemMercadoria(item: ItemMercadoriaForm, valor: string) {
    const escolha = grupoItemEscolhido(valor);
    item.grupoMercadoriaId = escolha.grupoProprioId;
    item.grupoPatrimonioId = escolha.grupoPatrimonioId;
  }

  // R-129: "hoje" e o dia CONTABIL no fuso do negocio, nao `toISOString()` em UTC. Com UTC, quem
  // lanca as 21h em Sao Paulo ja veria o dia seguinte e o `min` do campo barraria um pagamento
  // marcado para hoje. Mesmo helper que o servidor usa — as duas pontas concordam sobre "hoje".
  function dataISO(offset: number) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return diaNegocio(d);
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
    credoresOferecidos,
    escolherTipoCredor,
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
    fotoNotaPreview,
    fotoNotaExistente,
    onFotoNota,
    // discriminacao
    discriminando,
    itensDespesa,
    itensMercadoria,
    erroDiscriminacaoLinha,
    erroDiscriminacaoCampo,
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
    novoItemDespesa,
    // campo Grupo do item (duas origens)
    gruposPatrimonio,
    grupoItemDespesa,
    definirGrupoItemDespesa,
    grupoItemMercadoria,
    definirGrupoItemMercadoria,
    contaTravadaDoCaixa,
    contaTravadaDoCaixaNome,
    // recorrencia (D3) — suportada
    recorrenciaAberta,
    recorrenciaNumero,
    DIAS,
    recorrenciaDias,
    FREQUENCIAS,
    recorrenciaFrequencia,
    recorrenciaSemanal,
    confirmarCancelamentoSerie,
    cancelandoSerie,
    cancelarSerie,
    alternarDiaRecorrencia,
    podeUsarRecorrencia
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
