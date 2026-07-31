// M3/ADR-002: tipos de formulario de cadastro agora moram no shared (fachada para o front).
export type { CadastroForm, ProdutoConversaoForm, ProdutoFiscalForm, ProdutoTransformacaoForm } from "@padaria/shared";

import type { ConfiguracaoAparenciaEmpresa, Permissao, TemaAplicacao } from "@padaria/shared";

// Dados fiscais do produto como vêm da API (numeric chega como string).
export type ProdutoFiscalDados = {
  ncm?: string | null;
  cest?: string | null;
  categoriaFiscal?: string | null;
  cstPisCofins?: string | null;
  aliquotaCheia?: string | number | null;
  aliquotaFcp?: string | number | null;
  aliquotaPis?: string | number | null;
  aliquotaCofins?: string | number | null;
  reducaoIcms?: string | number | null;
  icms?: string | number | null;
};

// Transformacao (ficha de receita) como vem da API e no formulario.
export type ProdutoTransformacaoDados = {
  precisao?: string | null;
  quantidade?: string | number | null;
  unidade?: string | null;
  produtoReceituario?: string | null;
};

// Promocao como vem da API (1:N).
export type ProdutoPromocaoDados = {
  tipo?: string | null;
  valor?: string | number | null;
  descontoFracao?: string | number | null;
  horaInicio?: string | null;
  horaFim?: string | null;
  seg?: boolean;
  ter?: boolean;
  qua?: boolean;
  qui?: boolean;
  sex?: boolean;
  sab?: boolean;
  dom?: boolean;
  validaAte?: string | null;
};

export type Opcao = {
  id: string;
  nome?: string;
  email?: string;
  descricao?: string;
  codigo?: string;
  codigoBarras?: string;
  documento?: string;
  dataNascimento?: string;
  whatsapp?: string;
  cep?: string;
  rua?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  cnpj?: string | null;
  configuracoesAparencia?: ConfiguracaoAparenciaEmpresa;
  marca?: string | null;
  // Conta com fundo (D8), vindo de /api/contas/saldos. saldoAtual e DERIVADO dos movimentos —
  // nunca ha coluna de saldo. Ausentes no GET /api/contas comum (lista de opcao de formulario).
  saldoInicial?: number;
  saldoAtual?: number;
  usuariosIds?: string[];
  // Patrimonio (D2)
  sig?: string;
  grupoPatrimonioId?: string | null;
  grupoMercadoriaId?: string | null;
  unidadeMedidaId?: string | null;
  unidadeIndividualId?: string | null;
  quantidadeIndividual?: string;
  embalagem?: string | null;
  cDe?: string | null;
  quantidadeCaixa?: string | number | null;
  medidaCompra?: string | null;
  quantidadeEstoque?: string | number | null;
  estoqueMin?: string | number | null;
  estoqueMax?: string | number | null;
  setorEstoque?: string | null;
  localVenda1?: string | null;
  localVenda2?: string | null;
  fotoUrl?: string | null;
  fiscal?: ProdutoFiscalDados | null;
  transformacao?: ProdutoTransformacaoDados | null;
  promocoes?: ProdutoPromocaoDados[];
  custo?: string | number | null;
  margem?: string | number | null;
  precoVenda?: string | number | null;
  // Derivado pelo servidor na leitura (promocao ativa por dia/horario) — nunca enviado de volta.
  precoVendaAtual?: number | null;
  auto?: boolean;
  status?: string | null;
  sigla?: string;
  empresaId?: string;
  empresaIds?: string[];
  caminho?: string;
  nivel?: number;
  selecionavel?: boolean;
  // Malote (D3): o malote E o lacre — identidade = numero do lacre + valor + status.
  numeroLacre?: string;
  valor?: string | number | null;
  cpf?: string;
  tipo?: string;
  tipoGrupo?: "despesa" | "mercadoria" | "retirada" | "vendas";
  grupoPaiId?: string | null;
  areaId?: string | null;
  setorPaiId?: string | null;
  setorId?: string | null;
  salario?: string;
  usuarioId?: string;
  colaboradorId?: string;
  cargoId?: string;
  contaId?: string;
  cargoIds?: string[];
  cargos?: string[];
  conversoes?: ProdutoConversao[];
  role?: string;
  cargoNome?: string;
  remuneracaoMinuto?: string;
  dataInicio?: string;
  ativo?: boolean;
  horaInicio?: string | null;
  horaFim?: string | null;
  turnoPadraoId?: string | null;
  diaDaSemana?: string;
  horaEntrada?: string;
  cargaHorariaDiariaEmMinutos?: number;
  intervaloMinutos?: number;
  colaboradorCargoId?: string;
  inicio?: string;
  fim?: string;
  motivo?: string;
  dia?: number;
  mes?: number;
  ano?: number | null;
  tipoPermissao?: "cargo" | "setor" | "usuario";
  codigoPermissao?: string;
  permissaoCodigo?: string;
  tipoAreaSetor?: "area" | "setor";
  tipoPatrimonio?: "grupo" | "item";
};

export type PermissoesPaginadas = {
  itens: Array<Record<string, string | undefined>>;
  total: number;
  page: number;
  pageSize: number;
};

export type Opcoes = {
  empresas: Opcao[];
  contas: Opcao[];
  formasPagamento: Opcao[];
  fornecedores: Opcao[];
  clientes: Opcao[];
  colaboradores: Opcao[];
  cargos: Opcao[];
  colaboradoresCargos: Opcao[];
  colaboradoresJornadas: Opcao[];
  colaboradoresFaltasJustificadas: Opcao[];
  gruposDespesas: Opcao[];
  gruposMercadorias: Opcao[];
  gruposRetiradas: Opcao[];
  gruposVendas: Opcao[];
  unidadesMedida: Opcao[];
  areas: Opcao[];
  setores: Opcao[];
  permissoes: Opcao[];
  cargosPermissoes: Opcao[];
  setoresPermissoes: Opcao[];
  usuariosPermissoes: Opcao[];
  usuarios: Opcao[];
  produtos: Opcao[];
  malotes: Opcao[];
  pdvs: Opcao[];
  turnos: Opcao[];
  gruposPatrimonio: Opcao[];
  patrimonioItens: Opcao[];
};

export type EntidadeOperacional = "venda" | "despesa" | "mercadoria" | "retirada" | "transferencia";

// Fila de aprovacao de compras vindas de NF-e (retaguarda). Espelha MercadoriaAprovacaoDto da API.
export type MercadoriaAprovacaoItem = {
  descricao: string;
  quantidade: string;
  valorUnitario: string;
  valorTotal: string;
};

export type MercadoriaAprovacao = {
  id: string;
  empresaId: string;
  dataReferencia: string;
  dataVencimento: string;
  descricao: string;
  valorOriginal: string;
  computar: boolean;
  fornecedorId: string | null;
  fornecedorNome: string | null;
  notaFiscalId: string | null;
  itens: MercadoriaAprovacaoItem[];
};

export type OperacaoResumo = {
  id: string;
  empresaId: string;
  // Datas CONTABEIS (date-only "yyyy-MM-dd", sem hora): exibir com formatarDataSomenteDia.
  dataReferencia: string;
  dataVencimento?: string;
  dataPagamento?: string | null;
  // Momento real da venda (timestamp ISO), so em venda vinda da integracao — null na manual.
  // E a unica fonte de "que horas foi a venda"; dataReferencia nao responde isso.
  dataVenda?: string | null;
  descricao: string;
  // SUBTOTAL do lancamento — nao e o que o cliente pagou.
  valorOriginal: string;
  // Venda: o que de fato entrou (original - desconto + acrescimo). E o que bate com o rodape do
  // relatorio, com o resumo do caixa e com o VALOR_TOTAL do CREARE.
  valorLiquido?: string;
  computar: boolean;
  status: string;
  pendenteDiscriminacao?: boolean;
  fotoDocumentoUrl?: string | null;
  pdvId?: string | null;
  pdvNome?: string | null;
  clienteId?: string | null;
  clienteNome?: string | null;
  colaboradorId?: string | null;
  colaboradorNome?: string | null;
  pagamentos?: Array<{
    id: string;
    formaPagamentoId: string | null;
    formaPagamentoNome: string | null;
    totalPago: string;
  }>;
  totalComprovantes?: number;
};

export type ResumoCaixa = {
  totalEntradas: number;
  totalTransferencias: number;
  totalTransferenciasEntrada?: number;
  totalTransferenciasSaida?: number;
  totalDespesas: number;
  totalRetiradas: number;
  totalMercadorias?: number;
  saldo: number;
};

export type CaixaOperacional = {
  id: string;
  empresaId: string;
  pdvId: string;
  pdvNome: string;
  usuarioId: string;
  usuarioCaixaId: string;
  usuarioCaixaNome: string;
  colaboradorId: string;
  // Dia CONTABIL do caixa ("yyyy-MM-dd") — o que a tela de Entradas lista para quem opera caixa.
  dataMovimento: string;
  dataHoraAbertura: string;
  abertoEm: string;
  dataHoraFechamento: string | null;
  fechadoEm: string | null;
  tokenEdicao: string | null;
  turnoId: string | null;
  observacao: string | null;
  status: string;
};

export type CaixaStatus = {
  caixaAberto: CaixaOperacional | null;
  resumo: ResumoCaixa | null;
};

export type ItemMenu = {
  id: string;
  titulo: string;
  permissao: Permissao;
  permissoesAlternativas?: Permissao[];
  permissaoMenu?: Permissao;
  permissaoMenuDesabilitado?: Permissao;
  icone: string;
  // Cor da categoria (identidade visual) aplicada ao icone no menu; ver corCategoriaPorTela.
  cor?: string;
};

export type AcaoNovo = {
  id: string;
  titulo: string;
  subtitulo: string;
  // Basta UMA das permissoes para o item aparecer (Saidas = despesa OU mercadoria OU retirada).
  permissoes: readonly Permissao[];
  icone: string;
  cor: string;
  // Ou NAVEGA para uma tela (Entradas) ou ABRE o modal de uma entidade — nunca os dois.
  telaDestino?: string;
  entidade?: EntidadeOperacional;
};

export type TreeItem = {
  id: string;
  nome: string;
  detalhe?: string;
  nivel: number;
  item: Record<string, string | undefined>;
};

export type ProdutoConversao = {
  id?: string;
  produtoId?: string;
  unidadeMedidaId: string;
  quantidade: string;
  unidadesIndividuais: string;
};

export type OperacaoForm = {
  dataReferencia: string;
  dataVencimento: string;
  dataPagamento: string;
  descricao: string;
  observacao: string;
  valorOriginal: string;
  valorAcrescimo: string;
  descricaoAcrescimo: string;
  // R-041: juros. O tipo vazio significa "sem juros" — o payload converte para null.
  jurosTipo: "" | "percentual" | "valor";
  jurosValorInformado: string;
  valorDesconto: string;
  descricaoDesconto: string;
  contaOrigemId: string;
  contaDestinoId: string;
  fornecedorId: string;
  colaboradorId: string;
  grupoDespesaId: string;
  grupoMercadoriaId: string;
  grupoRetiradaId: string;
  maloteId: string;
  numeroLacre: string;
  documento: string;
  numeroNotaFiscal: string;
  chaveAcesso: string;
  temNotaFiscal: boolean;
  computar: boolean;
};

export type TemaForm = TemaAplicacao;
