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
  itemDespesaVazio,
  itemMercadoriaVazio,
  opcaoGrupoItem,
  type ItemDespesaForm,
  type ItemMercadoriaForm
} from "~/utils/operacoes";
import {
  CREDORES_POR_CATEGORIA,
  limparCredorIncompativel,
  type CategoriaComCredor,
  type TipoCredor
} from "~/utils/credor-categoria";

export type Cat = CategoriaComCredor;

// O que a tabela de discriminacao precisa saber de um item, seja de despesa ou de mercadoria. As
// duas formas ja tem estes campos — tipar pela FORMA e o que permite uma tabela so, sem ramo por
// categoria dentro do template (E6).
type ItemDiscriminado = {
  descricao: string;
  quantidade: string;
  valorUnitario: string;
  descontoTipo: string;
  descontoValor: string;
  descontoTotalTipo: string;
  descontoTotalValor: string;
  grupoPatrimonioId: string;
};

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
    contaTravadaDoCaixaNota,
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
  //
  // `form` entra nas fontes porque o workspace TROCA o objeto do formulario (`form.value =
  // formOperacaoVazio()`) quando o "+ NOVO" reabre o modal ja aberto em outra categoria. Sem
  // observar essa troca, `aberto` seguia true, a conta travada nao mudava, o watch nao disparava e
  // o lancamento saia sem conta.
  //
  // So vale para lancamento NOVO. Num registro ABERTO para edicao a conta e a que foi gravada: o
  // PDV pode ter sido reapontado para outra conta depois do lancamento, e sobrescrever aqui movia
  // o registro de conta em silencio — o servidor aprovaria, porque a conta nova E a do PDV atual.
  // Quem decide a edicao e a trava do servidor (403), nao a tela.
  watch(
    [aberto, contaTravadaDoCaixa, form],
    ([estaAberto, conta]) => {
      if (estaAberto && conta && !operacaoEditandoId.value) form.value.contaOrigemId = conta;
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
    "--cat-soft": `var(--cat-${cfg.value.token}-soft)`,
    // Fundo da FAIXA do cabecalho, onde o texto e branco: a base reprova em 4,5:1 nas categorias
    // claras. Ver cores-categoria.ts.
    "--cat-faixa": `var(--cat-${cfg.value.token}-faixa)`,
    // A categoria como TEXTO (numero calculado, chip ativo, rotulo). Separada de --cat porque a
    // base reprova em AA como tinta nos DOIS modos, e no escuro ela precisa clarear, nao escurecer.
    "--cat-tinta": `var(--cat-${cfg.value.token}-tinta)`
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
  // desenho; era o codigo que divergia. O mapa vive em `utils/credor-categoria` porque a troca de
  // categoria precisa da MESMA resposta para limpar o credor que a nova categoria nao aceita.
  const CREDORES = CREDORES_POR_CATEGORIA;
  const rotuloCredor: Record<TipoCredor, string> = {
    fornecedor: "Fornecedor",
    colaborador: "Colaborador",
    socio_gestor: "Sócio ou Gestor"
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
  // O ID gravado no registro, capturado JUNTO com o tipo. Tem de ser uma copia: `escolherTipoCredor`
  // zera os tres ids do formulario, entao ler o form depois disso perde justamente o dado que este
  // chip existe para preservar — quem recebeu o dinheiro.
  const credorLegadoId = ref("");
  let registroDoLegado: string | null | undefined;
  watch(
    [() => operacaoEditandoId.value, credorTipoGravado, cat],
    ([id, tipo, categoria]) => {
      if (id !== registroDoLegado) {
        registroDoLegado = id;
        credorLegado.value = null;
        credorLegadoId.value = "";
      }
      // So um REGISTRO ABERTO reabre o tipo legado. Sem o `id`, trocar de despesa para mercadoria
      // com um colaborador escolhido devolvia o chip "Colaborador" a mercadoria — o oposto do que o
      // comentario acima promete e do que a FOTO 2 permite.
      if (id && tipo && !CREDORES[categoria].includes(tipo)) {
        credorLegado.value = tipo;
        // So na PRIMEIRA vez: depois que o usuario mexe nos chips, o formulario nao e mais fonte.
        if (!credorLegadoId.value) credorLegadoId.value = idDoTipoNoFormulario(tipo);
      }
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
      // Limpeza da troca de categoria, num lugar so. O id do credor que a nova categoria nao aceita
      // sai do ESTADO, e nao apenas da tela: o payload emite os tres ids em qualquer entidade,
      // entao um campo so escondido continuava viajando — era assim que uma despesa com colaborador
      // virava retirada com colaborador, gravada, contra a R-128. O grupo tambem e proprio da
      // categoria anterior. Nada disso vale para registro em EDICAO, que nem troca de categoria e
      // cujo credor historico a R-128 manda preservar.
      if (!operacaoEditandoId.value) {
        form.value.grupoDespesaId = "";
        form.value.grupoMercadoriaId = "";
        form.value.grupoRetiradaId = "";
        limparCredorIncompativel(form.value, c);
      }
      const primeiro = CREDORES[c][0];
      if (primeiro && !credoresOferecidos.value.includes(tipoCredor.value)) tipoCredor.value = primeiro;
    },
    { immediate: true }
  );
  function idDoTipoNoFormulario(tipo: TipoCredor) {
    if (tipo === "fornecedor") return form.value.fornecedorId;
    if (tipo === "colaborador") return form.value.colaboradorId;
    return form.value.socioGestorId;
  }
  const credorOpcoes = computed(() => {
    const lista =
      tipoCredor.value === "fornecedor"
        ? opcoesEmpresa.value.fornecedores
        : tipoCredor.value === "colaborador"
          ? opcoesEmpresa.value.colaboradores
          : opcoesEmpresa.value.sociosGestores;
    // No tipo LEGADO, a unica opcao e quem ja esta gravado. O servidor exige o MESMO credor
    // (`exigirCredorDaRetirada`): oferecer a lista inteira convidava a trocar quem recebeu o
    // dinheiro e devolvia um 400 dizendo "use fornecedor ou socio/gestor" — instrucao que contradiz
    // o chip que a propria tela estava exibindo como valido. Preservar nao e poder trocar.
    //
    // O id vem do REGISTRO (`credorLegadoId`), nunca do formulario: ir ao chip "Fornecedor" so para
    // olhar a lista e voltar zerava `colaboradorId`, e o filtro passava a comparar com "" — o chip
    // legado reabria com a lista VAZIA e sem nenhuma forma de recuperar o credor original a nao ser
    // cancelar a edicao inteira. Era metade do defeito que este chip existe para corrigir.
    if (credorLegado.value && tipoCredor.value === credorLegado.value) {
      return lista.filter((opcao) => opcao.id === credorLegadoId.value);
    }
    return lista;
  });
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
  function totalLinha(it: ItemDiscriminado) {
    return Number(it.quantidade || 0) * Number(it.valorUnitario || 0);
  }
  function aplicarDesconto(valor: number, tipo: string, informado: string) {
    const numero = Number(informado || 0);
    return Math.max(0, valor - (tipo === "percentual" ? (valor * numero) / 100 : tipo === "valor" ? numero : 0));
  }
  function unitComDesc(it: ItemDiscriminado) {
    return aplicarDesconto(Number(it.valorUnitario || 0), it.descontoTipo, it.descontoValor);
  }
  function totalLinhaComDesc(it: ItemDiscriminado) {
    const aposUnitario = unitComDesc(it) * Number(it.quantidade || 0);
    return aplicarDesconto(aposUnitario, it.descontoTotalTipo, it.descontoTotalValor) * (1 - descontoFrac.value);
  }
  function brn(n: number) {
    return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // ===== E6: uma tabela de discriminacao para despesa E mercadoria ==============================
  // O mecanismo e o mesmo nas duas — escolher um item de um CADASTRO preenche descricao e grupo. O
  // que muda e a ORIGEM: mercadoria vem de Produtos; despesa vem de Patrimonio e Colaboradores.
  // Decisao do Jose (04/08/2026). A descricao livre saiu: o item passa a ser sempre do cadastro.
  // Retirada NAO discrimina (R-050) e nao entra aqui.

  /** A lista de itens da categoria corrente. `splice`/`push` mutam o array original. */
  const itensDaDiscriminacao = computed<(ItemDespesaForm | ItemMercadoriaForm)[]>(() =>
    cat.value === "despesa" ? itensDespesa.value : itensMercadoria.value
  );

  /** Blocos do select de item (viram <optgroup>). Prefixo no valor diz de qual cadastro veio. */
  const origensDoItem = computed(() =>
    cat.value === "mercadoria"
      ? [{ rotulo: "Produtos", opcoes: opcoesEmpresa.value.produtos, prefixo: "prod" }]
      : [
          { rotulo: "Patrimônio", opcoes: opcoesEmpresa.value.patrimonioItens, prefixo: "pat" },
          { rotulo: "Colaboradores", opcoes: opcoesEmpresa.value.colaboradores, prefixo: "col" }
        ]
  );

  function rotuloDaOpcao(opcao: { nome?: string; descricao?: string }) {
    return opcao.descricao ?? opcao.nome ?? "";
  }

  /** Valor atual do select de item — vazio no registro ANTIGO, que nao tem vinculo. */
  function itemVinculado(item: ItemDespesaForm | ItemMercadoriaForm) {
    if ("produtoId" in item) return item.produtoId ? `prod:${item.produtoId}` : "";
    if (item.patrimonioItemId) return `pat:${item.patrimonioItemId}`;
    return item.colaboradorId ? `col:${item.colaboradorId}` : "";
  }

  /**
   * Escolher o item preenche DESCRICAO e GRUPO sozinho — e essa a razao de o campo livre ter saido.
   * Colaborador nao tem grupo no cadastro: preenche so a descricao e deixa o Grupo para a pessoa.
   */
  function escolherItemVinculado(item: ItemDespesaForm | ItemMercadoriaForm, valor: string) {
    const [prefixo, id] = valor.split(":");
    if ("produtoId" in item) {
      item.produtoId = prefixo === "prod" ? (id ?? "") : "";
      const produto = opcoesEmpresa.value.produtos.find((o) => o.id === id);
      if (produto) item.descricao = rotuloDaOpcao(produto);
      return;
    }
    item.patrimonioItemId = prefixo === "pat" ? (id ?? "") : "";
    item.colaboradorId = prefixo === "col" ? (id ?? "") : "";
    const origem = (prefixo === "pat" ? opcoesEmpresa.value.patrimonioItens : opcoesEmpresa.value.colaboradores).find(
      (o) => o.id === id
    );
    if (!origem) return;
    item.descricao = rotuloDaOpcao(origem);
    // O item de patrimonio ja carrega o grupo (a coluna e NOT NULL no cadastro): o Grupo da linha
    // vem de graca, sem consulta extra.
    if (prefixo === "pat" && origem.grupoPatrimonioId) definirGrupoItemDespesa(item, `pat:${origem.grupoPatrimonioId}`);
  }

  /** Grupo da linha, roteado para o campo da categoria. */
  function grupoDoItem(item: ItemDespesaForm | ItemMercadoriaForm) {
    return "produtoId" in item ? grupoItemMercadoria(item) : grupoItemDespesa(item);
  }
  function definirGrupoDoItem(item: ItemDespesaForm | ItemMercadoriaForm, valor: string) {
    if ("produtoId" in item) definirGrupoItemMercadoria(item, valor);
    else definirGrupoItemDespesa(item, valor);
  }

  /** Grupos proprios da categoria (o bloco "Patrimonio" e acrescentado no template). */
  const gruposDoItem = computed(() =>
    cat.value === "mercadoria" ? opcoesEmpresa.value.gruposMercadorias : opcoesEmpresa.value.gruposDespesas
  );

  function novoItemDaDiscriminacao() {
    if (cat.value === "mercadoria") novoItemMercadoria();
    else novoItemDespesa();
  }
  function removerItemDaDiscriminacao(indice: number) {
    const lista = cat.value === "mercadoria" ? itensMercadoria.value : itensDespesa.value;
    if (lista.length > 1) lista.splice(indice, 1);
  }
  // Mercadoria: a Descrição vem do cadastro de produto (preenche produtoId + descrição).
  function escolherProduto(item: ItemMercadoriaForm, produtoId: string) {
    item.produtoId = produtoId;
    const p = opcoesEmpresa.value.produtos.find((x) => x.id === produtoId);
    if (p?.descricao) item.descricao = p.descricao;
  }
  // Mesma razao do novoItemDespesa: a fabrica e o unico lugar que precisa saber os campos do item.
  function novoItemMercadoria() {
    itensMercadoria.value.push(itemMercadoriaVazio());
  }
  // Usa a FABRICA em vez de um literal proprio. O literal daqui foi exatamente o caso que o
  // comentario de `itemDespesaVazio` descreve: campo novo entra no tipo e na fabrica, e a copia
  // solta fica para tras. Aconteceu com `patrimonioItemId`/`colaboradorId` (E6).
  function novoItemDespesa() {
    itensDespesa.value.push(itemDespesaVazio());
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
    itensDaDiscriminacao,
    origensDoItem,
    rotuloDaOpcao,
    itemVinculado,
    escolherItemVinculado,
    grupoDoItem,
    definirGrupoDoItem,
    gruposDoItem,
    novoItemDaDiscriminacao,
    removerItemDaDiscriminacao,
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
    contaTravadaDoCaixaNota,
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
