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
  valorDesconto: number;
  descricaoDesconto?: string | null;
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
  maloteId?: string | null;
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
    descricao: string;
    valor: number;
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
  valor: string;
  grupoDespesaId: string;
  grupoPatrimonioId: string;
};
export type ItemMercadoriaForm = {
  descricao: string;
  quantidade: string;
  valorUnitario: string;
  // Desconto por item (discriminacao). tipo vazio = sem desconto. valor e % ou R$ conforme o tipo.
  descontoTipo: string;
  descontoValor: string;
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
  { rotulo: "3 em 3", valor: "trimestre" }
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
  return { descricao: "", valor: "", grupoDespesaId: "", grupoPatrimonioId: "" };
}

export function itemMercadoriaVazio(): ItemMercadoriaForm {
  return {
    descricao: "",
    quantidade: "1",
    valorUnitario: "",
    descontoTipo: "",
    descontoValor: "",
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
  if (!item.descontoTipo) return deCentavos(paraCentavos(item.valorTotal));
  const bruto = Number(item.quantidade || 0) * Number(item.valorUnitario || 0);
  const descNum = Number(item.descontoValor || 0);
  const desconto = item.descontoTipo === "percentual" ? (bruto * descNum) / 100 : descNum;
  const liquido = bruto - desconto;
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
    observacao: detalhe.observacao ?? "",
    valorOriginal: String(detalhe.valorOriginal),
    valorAcrescimo: detalhe.valorAcrescimo ? String(detalhe.valorAcrescimo) : "",
    descricaoAcrescimo: detalhe.descricaoAcrescimo ?? "",
    valorDesconto: detalhe.valorDesconto ? String(detalhe.valorDesconto) : "",
    descricaoDesconto: detalhe.descricaoDesconto ?? "",
    contaOrigemId: detalhe.contaOrigemId ?? "",
    contaDestinoId: detalhe.contaDestinoId ?? "",
    fornecedorId: detalhe.fornecedorId ?? "",
    colaboradorId: detalhe.colaboradorId ?? "",
    socioGestorId: detalhe.socioGestorId ?? "",
    credorTipo: detalhe.credorTipo ?? "",
    dataDocumentoFiscal: detalhe.dataDocumentoFiscal ?? "",
    numeroDocumentoFiscal: detalhe.numeroDocumentoFiscal ?? "",
    grupoDespesaId: detalhe.grupoDespesaId ?? "",
    grupoMercadoriaId: detalhe.grupoMercadoriaId ?? "",
    grupoRetiradaId: detalhe.grupoRetiradaId ?? "",
    maloteId: detalhe.maloteId ?? "",
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
      valor: String(item.valor),
      grupoDespesaId: item.grupoDespesaId ?? "",
      grupoPatrimonioId: item.grupoPatrimonioId ?? ""
    }));
  }
  if (entidade === "mercadoria" && detalhe.itensMercadoria?.length) {
    preenchido.itensMercadoria = detalhe.itensMercadoria.map((item) => ({
      descricao: item.descricao,
      quantidade: String(item.quantidade),
      valorUnitario: String(item.valorUnitario),
      descontoTipo: item.descontoTipo ?? "",
      descontoValor: item.descontoValor != null ? String(item.descontoValor) : "",
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
    // qualquer campo de ID em branco (conta/fornecedor/colaborador/grupo/malote) quebra o envio.
    contaOrigemId: dados.form.contaOrigemId || null,
    contaDestinoId: dados.form.contaDestinoId || null,
    fornecedorId: dados.form.fornecedorId || null,
    colaboradorId: dados.form.colaboradorId || null,
    socioGestorId: dados.form.socioGestorId || null,
    credorTipo: dados.form.credorTipo || null,
    dataDocumentoFiscal: dados.form.dataDocumentoFiscal || null,
    numeroDocumentoFiscal: dados.form.numeroDocumentoFiscal || null,
    grupoDespesaId: dados.form.grupoDespesaId || null,
    grupoMercadoriaId: dados.form.grupoMercadoriaId || null,
    grupoRetiradaId: dados.form.grupoRetiradaId || null,
    maloteId: dados.form.maloteId || null,
    valorOriginal: deCentavos(paraCentavos(dados.form.valorOriginal)),
    valorAcrescimo: deCentavos(paraCentavos(dados.form.valorAcrescimo)),
    // R-041: manda COMO foi informado. O servidor recalcula o valorAcrescimo a partir daqui e
    // ignora o que mandamos acima — de proposito (valoresJuros em lancamentos.dominio).
    jurosTipo: dados.form.jurosTipo || null,
    jurosValorInformado: dados.form.jurosValorInformado
      ? Number(String(dados.form.jurosValorInformado).replace(",", "."))
      : null,
    valorDesconto: deCentavos(paraCentavos(dados.form.valorDesconto)),
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
    grupoDespesaId: string | null;
    grupoMercadoriaId: string | null;
    contaOrigemId: string | null;
    contaDestinoId: string | null;
    fornecedorId: string | null;
    colaboradorId: string | null;
    socioGestorId?: string | null;
    qtdItensDespesa: number;
    qtdItensMercadoria: number;
  }
): string | null {
  if (!dados.descricao.trim()) return "Informe a descricao do lancamento.";

  if (entidade === "despesa" && !dados.grupoDespesaId && dados.qtdItensDespesa === 0)
    return "Selecione o grupo da despesa ou discrimine os itens da despesa.";

  if (entidade === "mercadoria") {
    // Schema: fornecedorId e obrigatorio; grupo OU itens tambem.
    if (!dados.fornecedorId) return "Selecione o fornecedor da mercadoria.";
    if (!dados.grupoMercadoriaId && dados.qtdItensMercadoria === 0)
      return "Selecione o grupo da mercadoria ou discrimine os itens da mercadoria.";
  }

  // Schema: retirada exige colaboradorId.
  if (entidade === "retirada" && !dados.colaboradorId && !dados.socioGestorId)
    return "Selecione o credor da retirada.";

  if (entidade === "transferencia") {
    // Schema: contaOrigemId e contaDestinoId sao obrigatorios e devem diferir.
    if (!dados.contaOrigemId) return "Selecione a conta de origem.";
    if (!dados.contaDestinoId) return "Selecione a conta de destino.";
    if (dados.contaOrigemId === dados.contaDestinoId)
      return "A conta de destino deve ser diferente da conta de origem.";
  }

  return null;
}
