// Mapeamentos PUROS de operacao (venda/despesa/mercadoria/retirada/transferencia),
// extraidos do AppWorkspace para serem testaveis: detalhe da API -> formulario, e
// formulario -> payload da API. Dinheiro em centavos (mesma regra do servidor).
import { deCentavos, paraCentavos } from "@padaria/shared";
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
  grupoDespesaId?: string | null;
  grupoMercadoriaId?: string | null;
  grupoRetiradaId?: string | null;
  maloteId?: string | null;
  temNotaFiscal?: boolean;
  computar: boolean;
  itensVenda?: {
    produtoId: string | null;
    descricaoProduto: string;
    quantidade: number;
    valorUnitario: number;
    valorTotal: number;
  }[];
  tiposPagamento?: { formaPagamentoId: string | null; numeroVendas: number; totalPago: number }[];
  itensDespesa?: { grupoDespesaId: string | null; descricao: string; valor: number }[];
  itensMercadoria?: {
    produtoId: string | null;
    grupoMercadoriaId: string | null;
    unidadeMedidaId: string | null;
    descricao: string;
    quantidade: number;
    valorUnitario: number;
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
export type ItemDespesaForm = { descricao: string; valor: string; grupoDespesaId: string };
export type ItemMercadoriaForm = {
  descricao: string;
  quantidade: string;
  valorUnitario: string;
  valorTotal: string;
  produtoId: string;
  grupoMercadoriaId: string;
  unidadeMedidaId: string;
};

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
      grupoDespesaId: item.grupoDespesaId ?? ""
    }));
  }
  if (entidade === "mercadoria" && detalhe.itensMercadoria?.length) {
    preenchido.itensMercadoria = detalhe.itensMercadoria.map((item) => ({
      descricao: item.descricao,
      quantidade: String(item.quantidade),
      valorUnitario: String(item.valorUnitario),
      valorTotal: String(item.valorTotal),
      produtoId: item.produtoId ?? "",
      grupoMercadoriaId: item.grupoMercadoriaId ?? "",
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
};

export function montarPayloadOperacao(entidade: EntidadeOperacional, dados: DadosPayloadOperacao) {
  const itensDespesa =
    entidade === "despesa" && dados.discriminandoDespesa
      ? dados.itensDespesa
          .filter((item) => item.descricao || item.valor)
          .map((item) => ({ ...item, valor: deCentavos(paraCentavos(item.valor)) }))
      : [];
  const itensMercadoria =
    entidade === "mercadoria" && dados.discriminandoMercadoria
      ? dados.itensMercadoria
          .filter((item) => item.descricao || item.produtoId)
          .map((item) => ({
            ...item,
            quantidade: Number(item.quantidade || 0),
            valorUnitario: Number(item.valorUnitario || 0),
            valorTotal: deCentavos(paraCentavos(item.valorTotal))
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
    maloteId: dados.form.maloteId || null,
    valorOriginal: deCentavos(paraCentavos(dados.form.valorOriginal)),
    valorAcrescimo: deCentavos(paraCentavos(dados.form.valorAcrescimo)),
    valorDesconto: deCentavos(paraCentavos(dados.form.valorDesconto)),
    itensVenda,
    tiposPagamento,
    itensDespesa,
    itensMercadoria
  };
}
