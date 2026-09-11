// Mapeamentos PUROS de operacao (venda/despesa/mercadoria/retirada/transferencia),
// extraidos do AppWorkspace para serem testaveis: detalhe da API -> formulario, e
// formulario -> payload da API. Dinheiro em centavos (mesma regra do servidor).
import { deCentavos, paraCentavos } from "@padaria/shared";
import type { FrequenciaRecorrencia, Recorrencia } from "@padaria/shared/recorrencia";
import type { EntidadeOperacional, OperacaoForm } from "~/types/padaria";

// Formato do GET de detalhe (/api/<tipo>/:id) usado para preencher o formulario de edicao.
export type OperacaoDetalhe = {
  id: string;
  dataReferencia: string;
  dataVencimento?: string;
  dataPagamento?: string | null;
  descricao: string;
  observacao?: string | null;
  valorOriginal: number;
  valorAcrescimo: number;
  descricaoAcrescimo?: string | null;
  jurosTipo?: "percentual" | "valor" | null;
  jurosValorInformado?: number | null;
  valorDesconto: number;
  descricaoDesconto?: string | null;
  descontoGeralTipo?: "percentual" | "valor" | null;
  descontoGeralValor?: number | null;
  contaOrigemId?: string | null;
  contaDestinoId?: string | null;
  fornecedorId?: string | null;
  colaboradorId?: string | null;
  socioGestorId?: string | null;
  credorTipo?: "fornecedor" | "colaborador" | "socio_gestor" | null;
  dataDocumentoFiscal?: string | null;
  numeroDocumentoFiscal?: string | null;
  grupoDespesaId?: string | null;
  grupoMercadoriaId?: string | null;
  grupoRetiradaId?: string | null;
  nLacreDoc?: string | null;
  agendadaPara?: string | null;
  dataRecebimento?: string | null;
  tempoConfirmacao?: OperacaoForm["tempoConfirmacao"];
  contasDestinoIds?: string[];
  recorrenciaId?: string | null;
  temNotaFiscal?: boolean;
  computar: boolean;
  fotoDocumentoUrl?: string | null;
  fotoNotaUrl?: string | null;
  itensVenda?: {
    produtoId: string | null;
    descricaoProduto: string;
    quantidade: number;
    valorUnitario: number;
    valorTotal: number;
  }[];
  tiposPagamento?: { formaPagamentoId: string | null; numeroVendas: number; totalPago: number }[];
  itensDespesa?: {
    grupoDespesaId: string | null;
    grupoPatrimonioId?: string | null;
    patrimonioItemId?: string | null;
    colaboradorId?: string | null;
    descricao: string;
    valor: number;
    quantidade?: number;
    valorUnitario?: number;
    descontoTipo?: "percentual" | "valor" | null;
    descontoValor?: number | null;
    descontoTotalTipo?: "percentual" | "valor" | null;
    descontoTotalValor?: number | null;
  }[];
  itensMercadoria?: {
    produtoId: string | null;
    grupoMercadoriaId: string | null;
    grupoPatrimonioId?: string | null;
    unidadeMedidaId: string | null;
    descricao: string;
    quantidade: number;
    valorUnitario: number;
    descontoTipo?: "percentual" | "valor" | null;
    descontoValor?: number | null;
    descontoTotalTipo?: "percentual" | "valor" | null;
    descontoTotalValor?: number | null;
    valorTotal: number;
  }[];
};

export type ItemVendaForm = {
  descricaoProduto: string;
  quantidade: string;
  valorUnitario: string;
  valorTotal: string;
  produtoId: string;
};
export type TipoPagamentoForm = { formaPagamentoId: string; totalPago: string; numeroVendas: string };
// grupoPatrimonioId: grupo do item vindo do cadastro de PATRIMONIO (§5, item 6). Exclusivo com o
// grupo proprio — o select da tela escreve num OU no outro, nunca nos dois.
export type ItemDespesaForm = {
  descricao: string;
  // E6: de qual cadastro veio a linha. Um dos dois, nunca os dois.
  patrimonioItemId: string;
  colaboradorId: string;
  valor: string;
  grupoDespesaId: string;
  grupoPatrimonioId: string;
  quantidade: string;
  valorUnitario: string;
  descontoTipo: string;
  descontoValor: string;
  descontoTotalTipo: string;
  descontoTotalValor: string;
};
export type ItemMercadoriaForm = {
  descricao: string;
  quantidade: string;
  valorUnitario: string;
  // Desconto por item (discriminacao). tipo vazio = sem desconto. valor e % ou R$ conforme o tipo.
  descontoTipo: string;
  descontoValor: string;
  descontoTotalTipo: string;
  descontoTotalValor: string;
  valorTotal: string;
  produtoId: string;
  grupoMercadoriaId: string;
  grupoPatrimonioId: string;
  unidadeMedidaId: string;
};

// --- Recorrencia (D3) --------------------------------------------------------------------------
// Os rotulos sao os do desenho do Rodrigo; os valores sao os que o contrato aceita. "3 em 3" =
// trimestral e os DIAS so valem na frequencia semanal (decisoes do Jose, 30/07).
//
// DOMINGO (iso 7) e decisao do JOSE, nao do desenho: o rascunho tem seis dias (Sg..Sa), mas a
// padaria abre domingo — costuma ser o dia mais forte. Registrado em PROJECT_BRAIN/17 §6.
export const DIAS_RECORRENCIA = [
  { rotulo: "Dom", iso: 7 },
  { rotulo: "Sg", iso: 1 },
  { rotulo: "Ter", iso: 2 },
  { rotulo: "Qa", iso: 3 },
  { rotulo: "Qi", iso: 4 },
  { rotulo: "Sx", iso: 5 },
  { rotulo: "Sa", iso: 6 }
] as const;

export const FREQUENCIAS_RECORRENCIA = [
  { rotulo: "dia", valor: "dia" },
  { rotulo: "semana", valor: "semana" },
  { rotulo: "mês", valor: "mes" },
  { rotulo: "quinzena", valor: "quinzena" },
  { rotulo: "3 em 3", valor: "trimestre" },
  { rotulo: "ano", valor: "ano" }
] as const;

export type EstadoRecorrencia = {
  aberta: boolean;
  numero: string;
  frequencia: FrequenciaRecorrencia;
  dias: boolean[];
};

export function estadoRecorrenciaVazio(): EstadoRecorrencia {
  // O tamanho acompanha DIAS_RECORRENCIA: derivar evita o array de 6 posicoes sobrar quando um dia
  // novo entra na lista (foi o que aconteceu ao incluir domingo).
  return { aberta: false, numero: "1", frequencia: "mes", dias: DIAS_RECORRENCIA.map(() => false) };
}

/**
 * Bloco `recorrencia` do payload — `undefined` quando nao ha serie a criar.
 *
 * "Repetir 1 vez" e o mesmo que nao repetir: mandar a recorrencia nesse caso faria o servidor
 * exigir a permissao (403) de quem so queria um lancamento avulso.
 */
export function montarRecorrencia(estado: EstadoRecorrencia): Recorrencia | undefined {
  const repeticoes = Number(estado.numero || 1);
  if (!estado.aberta || !Number.isFinite(repeticoes) || repeticoes < 2) return undefined;
  const diasSemana =
    estado.frequencia === "semana"
      ? DIAS_RECORRENCIA.filter((_, indice) => estado.dias[indice]).map((dia) => dia.iso)
      : [];
  return { frequencia: estado.frequencia, repeticoes, ...(diasSemana.length ? { diasSemana } : {}) };
}

// Linha em branco da discriminacao. Existe como FUNCAO (e nao como literal repetido em cada tela)
// porque o literal estava copiado em quatro lugares: bastava um campo novo entrar em tres deles
// para a quarta tela montar um item sem o campo. Foi assim que o "" de ID sobreviveu.
export function itemDespesaVazio(): ItemDespesaForm {
  return {
    descricao: "",
    patrimonioItemId: "",
    colaboradorId: "",
    valor: "",
    grupoDespesaId: "",
    grupoPatrimonioId: "",
    quantidade: "1",
    valorUnitario: "",
    descontoTipo: "",
    descontoValor: "",
    descontoTotalTipo: "",
    descontoTotalValor: ""
  };
}

export function itemMercadoriaVazio(): ItemMercadoriaForm {
  return {
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
  };
}

// --- Campo Grupo do ITEM: duas origens, uma lista so (§5, item 6) ----------------------------
// O item guarda DOIS campos exclusivos — o grupo do cadastro proprio (despesa/mercadoria) e o de
// PATRIMONIO — mas a pessoa ve UM campo, com os dois blocos. O <option> carrega a origem no valor
// porque o id sozinho nao diz de qual cadastro ele veio: dois uuid quaisquer sao indistinguiveis.
//
// A exclusividade sai de graca aqui: grupoItemEscolhido SEMPRE devolve um dos dois vazio, entao a
// tela nao tem como montar um item com as duas origens (que o contrato e o CHECK recusariam).
export const PREFIXO_GRUPO_PATRIMONIO = "pat:";

export function opcaoGrupoItem(grupoProprioId: string, grupoPatrimonioId: string): string {
  return grupoPatrimonioId ? PREFIXO_GRUPO_PATRIMONIO + grupoPatrimonioId : grupoProprioId;
}

export function grupoItemEscolhido(valor: string): { grupoProprioId: string; grupoPatrimonioId: string } {
  if (valor.startsWith(PREFIXO_GRUPO_PATRIMONIO)) {
    return { grupoProprioId: "", grupoPatrimonioId: valor.slice(PREFIXO_GRUPO_PATRIMONIO.length) };
  }
  return { grupoProprioId: valor, grupoPatrimonioId: "" };
}

// Total liquido de um item de mercadoria no cliente (espelha o recalculo do servidor). Sem desconto,
// usa o valorTotal digitado (permite valor cheio). Com desconto, e qtd*unit menos o desconto, >= 0.
export function totalItemMercadoriaForm(item: ItemMercadoriaForm): number {
  if (!item.descontoTipo && !item.descontoTotalTipo) return deCentavos(paraCentavos(item.valorTotal));
  const bruto = Number(item.quantidade || 0) * Number(item.valorUnitario || 0);
  const descNum = Number(item.descontoValor || 0);
  const descontoUnitario =
    item.descontoTipo === "percentual"
      ? (bruto * descNum) / 100
      : item.descontoTipo === "valor"
        ? descNum * Number(item.quantidade || 0)
        : 0;
  const aposUnitario = Math.max(0, bruto - descontoUnitario);
  const descontoTotalNumero = Number(item.descontoTotalValor || 0);
  const descontoTotal =
    item.descontoTotalTipo === "percentual"
      ? (aposUnitario * descontoTotalNumero) / 100
      : item.descontoTotalTipo === "valor"
        ? descontoTotalNumero
        : 0;
  const liquido = aposUnitario - descontoTotal;
  return deCentavos(paraCentavos(liquido > 0 ? liquido : 0));
}

// Pecas que o AppWorkspace atribui aos refs do formulario. Itens so vem quando o detalhe os traz
// (para nao sobrescrever as linhas em branco padrao quando o registro nao e discriminado).
export type FormOperacaoPreenchido = {
  form: Partial<OperacaoForm>;
  discriminandoDespesa: boolean;
  discriminandoMercadoria: boolean;
  itensVenda?: ItemVendaForm[];
  tiposPagamento?: TipoPagamentoForm[];
  itensDespesa?: ItemDespesaForm[];
  itensMercadoria?: ItemMercadoriaForm[];
};

export function formOperacaoDeDetalhe(entidade: EntidadeOperacional, detalhe: OperacaoDetalhe): FormOperacaoPreenchido {
  const form: Partial<OperacaoForm> = {
    dataReferencia: detalhe.dataReferencia,
    dataPagamento: detalhe.dataPagamento ?? "",
    descricao: detalhe.descricao,
    // R-127: o texto do movimento e a observacao. Registro antigo pode ter so `descricao` (o backfill
    // da 0027 cobre o que existia, mas o detalhe ja chega com o coalesce do textoDoMovimento) — sem
    // este fallback o modal reabriria com o campo Observacao VAZIO e salvar apagaria o texto.
    observacao: detalhe.observacao ?? detalhe.descricao ?? "",
    valorOriginal: String(detalhe.valorOriginal),
    valorAcrescimo: detalhe.valorAcrescimo ? String(detalhe.valorAcrescimo) : "",
    descricaoAcrescimo: detalhe.descricaoAcrescimo ?? "",
    jurosTipo: detalhe.jurosTipo ?? "",
    jurosValorInformado: detalhe.jurosValorInformado != null ? String(detalhe.jurosValorInformado) : "",
    valorDesconto: detalhe.valorDesconto ? String(detalhe.valorDesconto) : "",
    descricaoDesconto: detalhe.descricaoDesconto ?? "",
    descontoGeralTipo: detalhe.descontoGeralTipo ?? "",
    descontoGeralValor: detalhe.descontoGeralValor != null ? String(detalhe.descontoGeralValor) : "",
    contaOrigemId: detalhe.contaOrigemId ?? "",
    contaDestinoId: detalhe.contaDestinoId ?? "",
    fornecedorId: detalhe.fornecedorId ?? "",
    colaboradorId: detalhe.colaboradorId ?? "",
    socioGestorId: detalhe.socioGestorId ?? "",
    credorTipo: detalhe.credorTipo ?? "",
    dataDocumentoFiscal: detalhe.dataDocumentoFiscal ?? "",
    numeroDocumentoFiscal: detalhe.numeroDocumentoFiscal ?? "",
    fotoDocumentoUrl: detalhe.fotoDocumentoUrl ?? "",
    fotoNotaUrl: detalhe.fotoNotaUrl ?? "",
    grupoDespesaId: detalhe.grupoDespesaId ?? "",
    grupoMercadoriaId: detalhe.grupoMercadoriaId ?? "",
    grupoRetiradaId: detalhe.grupoRetiradaId ?? "",
    nLacreDoc: detalhe.nLacreDoc ?? "",
    agendadaPara: detalhe.agendadaPara?.slice(0, 16) ?? "",
    dataRecebimento: detalhe.dataRecebimento?.slice(0, 16) ?? "",
    tempoConfirmacao: detalhe.tempoConfirmacao ?? "1dia",
    contasDestinoIds: detalhe.contasDestinoIds ?? [],
    recorrenciaId: detalhe.recorrenciaId ?? "",
    temNotaFiscal: detalhe.temNotaFiscal ?? false,
    computar: detalhe.computar
  };
  // dataVencimento so quando o detalhe traz (senao mantem o default do form vazio).
  if (detalhe.dataVencimento !== undefined) form.dataVencimento = detalhe.dataVencimento;

  const preenchido: FormOperacaoPreenchido = {
    form,
    discriminandoDespesa: entidade === "despesa" && Boolean(detalhe.itensDespesa?.length),
    discriminandoMercadoria: entidade === "mercadoria" && Boolean(detalhe.itensMercadoria?.length)
  };

  if (entidade === "venda" && detalhe.itensVenda?.length) {
    preenchido.itensVenda = detalhe.itensVenda.map((item) => ({
      descricaoProduto: item.descricaoProduto,
      quantidade: String(item.quantidade),
      valorUnitario: String(item.valorUnitario),
      valorTotal: String(item.valorTotal),
      produtoId: item.produtoId ?? ""
    }));
  }
  if (entidade === "venda" && detalhe.tiposPagamento?.length) {
    preenchido.tiposPagamento = detalhe.tiposPagamento.map((pagamento) => ({
      formaPagamentoId: pagamento.formaPagamentoId ?? "",
      totalPago: String(pagamento.totalPago),
      numeroVendas: String(pagamento.numeroVendas)
    }));
  }
  if (entidade === "despesa" && detalhe.itensDespesa?.length) {
    preenchido.itensDespesa = detalhe.itensDespesa.map((item) => ({
      descricao: item.descricao,
      // E6: item ANTIGO nao tem vinculo — foi digitado a mao antes de 04/08/2026. Ele reabre com os
      // campos vazios e a `descricao` gravada visivel, que continua sendo o que a pessoa escreveu.
      // Zerar a descricao aqui apagaria o historico na cara do usuario (o erro que a R-128 pegou na
      // retirada com colaborador).
      patrimonioItemId: item.patrimonioItemId ?? "",
      colaboradorId: item.colaboradorId ?? "",
      valor: String(item.valor),
      grupoDespesaId: item.grupoDespesaId ?? "",
      grupoPatrimonioId: item.grupoPatrimonioId ?? "",
      quantidade: String(item.quantidade ?? 1),
      valorUnitario: String(item.valorUnitario ?? item.valor),
      descontoTipo: item.descontoTipo ?? "",
      descontoValor: item.descontoValor != null ? String(item.descontoValor) : "",
      descontoTotalTipo: item.descontoTotalTipo ?? "",
      descontoTotalValor: item.descontoTotalValor != null ? String(item.descontoTotalValor) : ""
    }));
  }
  if (entidade === "mercadoria" && detalhe.itensMercadoria?.length) {
    preenchido.itensMercadoria = detalhe.itensMercadoria.map((item) => ({
      descricao: item.descricao,
      quantidade: String(item.quantidade),
      valorUnitario: String(item.valorUnitario),
      descontoTipo: item.descontoTipo ?? "",
      descontoValor: item.descontoValor != null ? String(item.descontoValor) : "",
      descontoTotalTipo: item.descontoTotalTipo ?? "",
      descontoTotalValor: item.descontoTotalValor != null ? String(item.descontoTotalValor) : "",
      valorTotal: String(item.valorTotal),
      produtoId: item.produtoId ?? "",
      grupoMercadoriaId: item.grupoMercadoriaId ?? "",
      grupoPatrimonioId: item.grupoPatrimonioId ?? "",
      unidadeMedidaId: item.unidadeMedidaId ?? ""
    }));
  }
  return preenchido;
}

export type DadosPayloadOperacao = {
  empresaId: string;
  form: OperacaoForm;
  itensVenda: ItemVendaForm[];
  tiposPagamento: TipoPagamentoForm[];
  itensDespesa: ItemDespesaForm[];
  itensMercadoria: ItemMercadoriaForm[];
  discriminandoDespesa: boolean;
  discriminandoMercadoria: boolean;
  produtos: Array<{ id: string; descricao?: string | null; nome?: string | null }>;
  // Recorrencia (D3): so nas SAIDAS (despesa/mercadoria/retirada) e so na CRIACAO — ver o payload.
  recorrencia?: Recorrencia | undefined;
};

export function montarPayloadOperacao(entidade: EntidadeOperacional, dados: DadosPayloadOperacao) {
  // Os IDs opcionais do ITEM seguem a MESMA regra dos do cabecalho (ver o comentario no return):
  // "" vira null, porque o zod usa uuid().optional().nullable() e REJEITA "" com "Invalid UUID".
  // Antes o item ia por spread e levava o "" junto — discriminar sem escolher Grupo (o padrao: o
  // campo e opcional e a primeira opcao do select e vazia) respondia 400. Por isso os campos sao
  // listados um a um aqui em vez de espalhados.
  const itensDespesa =
    entidade === "despesa" && dados.discriminandoDespesa
      ? dados.itensDespesa
          .filter((item) => item.descricao || item.valor)
          .map((item) => ({
            descricao: item.descricao,
            valor: deCentavos(paraCentavos(item.valor)),
            quantidade: Number(item.quantidade || 1),
            valorUnitario: Number(item.valorUnitario || item.valor || 0),
            descontoTipo: item.descontoTipo || null,
            descontoValor: item.descontoValor ? Number(item.descontoValor) : null,
            descontoTotalTipo: item.descontoTotalTipo || null,
            descontoTotalValor: item.descontoTotalValor ? Number(item.descontoTotalValor) : null,
            grupoDespesaId: item.grupoDespesaId || null,
            grupoPatrimonioId: item.grupoPatrimonioId || null
          }))
      : [];
  const itensMercadoria =
    entidade === "mercadoria" && dados.discriminandoMercadoria
      ? dados.itensMercadoria
          .filter((item) => item.descricao || item.produtoId)
          .map((item) => ({
            descricao: item.descricao,
            quantidade: Number(item.quantidade || 0),
            valorUnitario: Number(item.valorUnitario || 0),
            descontoTipo: item.descontoTipo || null,
            descontoValor: item.descontoValor ? Number(item.descontoValor) : null,
            descontoTotalTipo: item.descontoTotalTipo || null,
            descontoTotalValor: item.descontoTotalValor ? Number(item.descontoTotalValor) : null,
            // Servidor recalcula, mas mandamos o total ja liquido para casar com a soma na hora.
            valorTotal: totalItemMercadoriaForm(item),
            produtoId: item.produtoId || null,
            grupoMercadoriaId: item.grupoMercadoriaId || null,
            grupoPatrimonioId: item.grupoPatrimonioId || null,
            unidadeMedidaId: item.unidadeMedidaId || null
          }))
      : [];
  const itensVenda =
    entidade === "venda"
      ? dados.itensVenda
          .filter((item) => item.descricaoProduto || item.produtoId || item.valorTotal)
          .map((item) => {
            const produto = dados.produtos.find((opcao) => opcao.id === item.produtoId);
            return {
              produtoId: item.produtoId || null,
              descricaoProduto: item.descricaoProduto || produto?.descricao || produto?.nome || "Venda",
              quantidade: Number(item.quantidade || 0),
              valorUnitario: Number(item.valorUnitario || 0),
              valorTotal: deCentavos(paraCentavos(item.valorTotal))
            };
          })
      : [];
  const tiposPagamento =
    entidade === "venda"
      ? dados.tiposPagamento
          .filter((item) => item.formaPagamentoId || item.totalPago)
          .map((item) => ({
            formaPagamentoId: item.formaPagamentoId || null,
            numeroVendas: Number(item.numeroVendas || 0),
            totalPago: deCentavos(paraCentavos(item.totalPago))
          }))
      : [];

  return {
    empresaId: dados.empresaId,
    ...dados.form,
    dataPagamento: dados.form.dataPagamento || null,
    // IDs opcionais nao selecionados vao como null (nao ""). O schema zod usa uuid().optional()
    // .nullable(): aceita UUID, null ou undefined, mas REJEITA "" com "Invalid UUID". Sem isso,
    // qualquer campo de ID em branco (conta/fornecedor/colaborador/grupo) quebra o envio.
    contaOrigemId: dados.form.contaOrigemId || null,
    contaDestinoId: dados.form.contaDestinoId || null,
    fornecedorId: dados.form.fornecedorId || null,
    colaboradorId: dados.form.colaboradorId || null,
    socioGestorId: dados.form.socioGestorId || null,
    // `credorTipo` sem credor nenhum nao vai. O chip e o SELETOR do tipo: clicar nele (ou escolher
    // um credor e voltar o select para "—") deixa o tipo preenchido com os tres ids vazios. Na
    // despesa o credor e OPCIONAL, entao esse estado e um caminho normal — e o servidor passou a
    // recusa-lo como credor incoerente, com uma mensagem que cita nomes de campo que nao existem na
    // tela. Sem credor, nao ha tipo a declarar.
    credorTipo:
      dados.form.fornecedorId || dados.form.colaboradorId || dados.form.socioGestorId
        ? dados.form.credorTipo || null
        : null,
    dataDocumentoFiscal: dados.form.dataDocumentoFiscal || null,
    numeroDocumentoFiscal: dados.form.numeroDocumentoFiscal || null,
    fotoDocumentoUrl: dados.form.fotoDocumentoUrl || null,
    fotoNotaUrl: dados.form.fotoNotaUrl || null,
    grupoDespesaId: dados.form.grupoDespesaId || null,
    grupoMercadoriaId: dados.form.grupoMercadoriaId || null,
    grupoRetiradaId: dados.form.grupoRetiradaId || null,
    ...(entidade === "transferencia"
      ? {
          nLacreDoc: dados.form.nLacreDoc || null,
          agendadaPara: dados.form.agendadaPara ? new Date(dados.form.agendadaPara).toISOString() : null,
          tempoConfirmacao: dados.form.tempoConfirmacao,
          contasDestinoIds: dados.form.contasDestinoIds,
          retornosPlanejados: dados.form.retornosPlanejados.map((retorno) => ({
            valor: deCentavos(paraCentavos(retorno.valor)),
            nLacreDoc: retorno.nLacreDoc.trim(),
            contaDestinoId: retorno.contaDestinoId
          }))
        }
      : {}),
    valorOriginal: deCentavos(paraCentavos(dados.form.valorOriginal)),
    valorAcrescimo: deCentavos(paraCentavos(dados.form.valorAcrescimo)),
    // R-041: manda COMO foi informado. O servidor recalcula o valorAcrescimo a partir daqui e
    // ignora o que mandamos acima — de proposito (valoresJuros em lancamentos.dominio).
    jurosTipo: dados.form.jurosTipo || null,
    jurosValorInformado: dados.form.jurosValorInformado
      ? Number(String(dados.form.jurosValorInformado).replace(",", "."))
      : null,
    valorDesconto: deCentavos(paraCentavos(dados.form.valorDesconto)),
    ...(entidade === "despesa" || entidade === "mercadoria"
      ? {
          descontoGeralTipo: dados.form.descontoGeralTipo || null,
          descontoGeralValor: dados.form.descontoGeralValor ? Number(dados.form.descontoGeralValor) : null
        }
      : {}),
    // Recorrencia so existe em despesa/mercadoria/retirada. Venda vem da integracao e transferencia
    // e movimento imediato — mandar o campo la seria rejeitado pelo contrato (schema .strict()).
    ...(dados.recorrencia && entidade !== "venda" && entidade !== "transferencia"
      ? { recorrencia: dados.recorrencia }
      : {}),
    itensVenda,
    tiposPagamento,
    itensDespesa,
    itensMercadoria
  };
}

// Pre-validacao no cliente ANTES de enviar, espelhando as regras do servidor, para dar uma
// mensagem clara em portugues em vez do generico "Requisicao invalida" (400) apos o round-trip.
// Fonte das regras: zod (descricao min 1) + services (validarDespesa/validarMercadoria/transferencia).
export function validarOperacaoParaEnvio(
  entidade: EntidadeOperacional,
  dados: {
    descricao: string;
    observacao?: string | null;
    grupoDespesaId: string | null;
    grupoMercadoriaId: string | null;
    contaOrigemId: string | null;
    contaDestinoId: string | null;
    fornecedorId: string | null;
    colaboradorId: string | null;
    socioGestorId?: string | null;
    qtdItensDespesa: number;
    qtdItensMercadoria: number;
    /** Conta do PDV do caixa aberto quando quem lanca e operador; "" para retaguarda. */
    contaTravada?: string;
    /** Registro ABERTO para edicao. Em lancamento novo a conta ainda vai ser preenchida. */
    editando?: boolean;
  }
): string | null {
  // R-127: o texto do movimento e a OBSERVACAO — e o campo que o usuario preenche na tela. A venda
  // ficou de fora da regra e continua com `descricao`, entao o texto exigido e "observacao ou
  // descricao": sem isto o lancamento novo (que so preenche observacao) seria barrado AQUI, antes de
  // chegar ao servidor, com uma mensagem falando de um campo que nao existe mais na tela.
  const texto = (dados.observacao ?? "").trim() || dados.descricao.trim();
  if (!texto) return entidade === "venda" ? "Informe a descricao da venda." : "Informe a observacao do lancamento.";

  // GRUPO e ITENS sao OPCIONAIS em despesa e mercadoria (decisao do Jose, 04/08/2026): o campo Grupo
  // saiu do modal — vive so na discriminacao — e discriminar continua opcional. A exigencia antiga
  // ("grupo ou itens") apontava um campo que a tela nao tem mais. Espelha validarDespesa/
  // validarMercadoria no servidor; se um lado voltar a exigir, o outro tem de voltar junto.
  if (entidade === "mercadoria") {
    // Schema: fornecedorId continua obrigatorio.
    if (!dados.fornecedorId) return "Selecione o fornecedor da mercadoria.";
  }

  // R-128: a retirada exige UM credor, e ele pode ser fornecedor, socio/gestor ou (historico)
  // colaborador. Sem o fornecedor aqui, a retirada nova para fornecedor era barrada na tela.
  if (entidade === "retirada" && !dados.fornecedorId && !dados.colaboradorId && !dados.socioGestorId)
    return "Selecione o credor da retirada.";

  // R-122: editando um registro cuja conta GRAVADA nao e a do PDV aberto, o servidor devolve 403 —
  // com certeza, nao por acaso. A tela ja exibia o aviso "correcao e da Tesouraria" sob o campo
  // travado, mas deixava preencher o formulario inteiro para tomar a recusa no fim. Barrar aqui e o
  // que faz o aviso valer alguma coisa. Nao vale para lancamento novo: ali a conta ainda vai ser
  // preenchida pelo watcher do caixa, e o campo vazio nao significa divergencia.
  if (dados.editando && dados.contaTravada && dados.contaOrigemId !== dados.contaTravada) {
    return dados.contaOrigemId
      ? "Este lançamento saiu de outra conta e a correção passa a ser da Tesouraria."
      : "Este lançamento foi gravado sem conta e a correção passa a ser da Tesouraria.";
  }

  if (entidade === "transferencia") {
    // Schema: contaOrigemId e contaDestinoId sao obrigatorios e devem diferir.
    if (!dados.contaOrigemId) return "Selecione a conta de origem.";
    if (!dados.contaDestinoId) return "Selecione a conta de destino.";
    if (dados.contaOrigemId === dados.contaDestinoId)
      return "A conta de destino deve ser diferente da conta de origem.";
  }

  return null;
}
