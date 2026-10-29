// M3/ADR-002: tipos de formulario de cadastro agora moram no shared (fachada para o front).
export type { CadastroForm } from "@padaria/shared";

import type { ConfiguracaoAparenciaEmpresa, Permissao, TemaAplicacao } from "@padaria/shared";
import type { CaixaDaTransferencia, LacreRelatorio, SituacaoMalote } from "@padaria/shared/transferencias";

// Dados fiscais do produto como vêm da API (numeric chega como string).
export type Opcao = {
  id: string;
  nome?: string;
  vinculoAtivoId?: string | null;
  temVinculoHistorico?: boolean;
  matricula?: string | null;
  funcaoNome?: string | null;
  email?: string;
  descricao?: string;
  apelido?: string;
  numeroSerie?: string;
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
  matriculaPrefixo?: string;
  // Configuracao operacional da empresa (migration 0060). Precisam viajar na opcao porque a grade de
  // cadastro alimenta o formulario de edicao: campo que nao chega na linha reabre vazio e o salvar
  // seguinte grava null em cima do valor correto.
  fusoHorario?: string;
  comprasPrazoRespostaHoras?: number | string | null;
  configuracoesAparencia?: ConfiguracaoAparenciaEmpresa;
  marca?: string | null;
  // Conta com fundo (D8), vindo de /api/contas/saldos. saldoAtual e DERIVADO dos movimentos —
  // nunca ha coluna de saldo. Ausentes no GET /api/contas comum (lista de opcao de formulario).
  saldoInicial?: number;
  saldoAtual?: number;
  saldoPendente?: number;
  usuariosIds?: string[];
  /** Derivados da configuração da empresa; usados para orientar o malote Cofre → PDV. */
  ehCofre?: boolean;
  ehContaPdv?: boolean;
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
  numeroLacre?: string;
  valor?: string | number | null;
  cpf?: string;
  tipo?: string;
  tipoGrupo?: "despesa" | "mercadoria" | "retirada" | "vendas";
  grupoPaiId?: string | null;
  areaId?: string | null;
  setorPaiId?: string | null;
  setorId?: string | null;
  setorNome?: string | null;
  salario?: string;
  usuarioId?: string;
  colaboradorId?: string;
  cargoId?: string;
  // Regras ja gravadas do alvo, como `/api/permissoes` devolve em cargos/setores/usuariosPermissoes
  // (`permissoes.repository.ts`). O servidor sempre mandou; faltava declarar. Usado pela S-06 para
  // preservar no save as permissoes que a tela esconde.
  regras?: Record<string, boolean>;
  // Resumo calculado pelo servidor sobre o perfil completo do usuario. Diferente de `regras`,
  // estas listas nao sao editaveis nem recortadas pela empresa selecionada na tela.
  permissoesHerdadas?: Permissao[];
  permissoesEfetivas?: Permissao[];
  contaId?: string;
  contaCofreId?: string | null;
  cargoIds?: string[];
  cargos?: string[];
  conversoes?: ProdutoConversao[];
  role?: string;
  cargoNome?: string;
  remuneracaoMinuto?: string;
  dataInicio?: string;
  ativo?: boolean;
  /** Situacao do fornecedor (R-219): fornecedor inativo nao aparece no seletor da rodada. */
  situacao?: "ativo" | "inativo";
  horaInicio?: string | null;
  horaFim?: string | null;
  /** ADM-003 V1B — turno. Nulos significam TURNO INCOMPLETO: valido no cadastro, mas nao admissivel. */
  etiqueta?: string | null;
  diasSemana?: string[] | null;
  turnoPadraoId?: string | null;
  // R-229 · postos do Caixa: turnos do caixa do PDV e o posto (PDV + turno) do login.
  turnosCaixa?: string[] | null;
  postoPdvId?: string | null;
  postoTurnoCaixa?: "manha" | "tarde" | null;
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
  sociosGestores: Opcao[];
  maquininhas: Opcao[];
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
  // R-183 (transferencia): o que o cofre CONTOU. Null em tudo que nao e `divergente`.
  valorRecebido?: number | null;
  valorEspecieDeclarado?: number | null;
  valorMoedasDeclarado?: number | null;
  // Venda: o que de fato entrou (original - desconto + acrescimo). E o que bate com o rodape do
  // relatorio, com o resumo do caixa e com o VALOR_TOTAL do CREARE.
  valorLiquido?: string;
  valorDesconto?: string;
  valorAcrescimo?: string;
  computar: boolean;
  status: string;
  cancelamentoAutorizadoPorAutomacao?: string | null;
  cancelamentoJustificativa?: string | null;
  cancelamentoMotivo?: string | null;
  contaOrigemId?: string;
  contaDestinoId?: string;
  contaOrigemNome?: string;
  contaDestinoNome?: string;
  nLacreDoc?: string | null;
  lacreFechamentoPlanejado?: string | null;
  prazoConfirmacaoEm?: string | null;
  dataRecebimento?: string | null;
  confirmadoPor?: string | null;
  caixaId?: string | null;
  possuiPlanejamentoRetorno?: boolean;
  ehPlanejamentoRetorno?: boolean;
  // Transferência: esta linha está sob as regras ESTRITAS da Transferência de retorno? Calculado
  // pelo servidor (caixa_id + tipo retorno/sangria) — a tela não conhece o tipo.
  ehCaixaParaCofre?: boolean;
  // Relatorio de Transferencias (campos devolvidos por GET /api/transferencias; todos opcionais: as
  // demais telas usam OperacaoResumo para outros tipos de lancamento e nao os recebem).
  tipoMovimento?: "abertura" | "suprimento" | "sangria" | "retorno";
  situacaoMalote?: SituacaoMalote | null;
  pdvsDestino?: string[];
  lacres?: LacreRelatorio[];
  caixa?: CaixaDaTransferencia | null;
  pendenteDiscriminacao?: boolean;
  fotoDocumentoUrl?: string | null;
  fotoNotaUrl?: string | null;
  pdvId?: string | null;
  pdvNome?: string | null;
  criadoEm?: string;
  criadoPorNome?: string | null;
  observacao?: string | null;
  clienteId?: string | null;
  clienteNome?: string | null;
  colaboradorId?: string | null;
  colaboradorNome?: string | null;
  pagamentos?: Array<{
    id: string;
    formaPagamentoId: string | null;
    formaPagamentoNome: string | null;
    tipoPagamentoAutomacaoId?: string | null;
    tipoPagamentoAutomacao?: string | null;
    totalPago: string;
  }>;
  itensVenda?: Array<{
    produtoId?: string | null;
    produtoAutomacaoId?: string | null;
    produtoAutomacaoCodigo?: string | null;
    descricaoProduto: string;
    quantidade: number;
    valorUnitario: number;
    valorTotal: number;
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
  porFormaPagamento?: Array<{
    formaPagamentoId: string | null;
    formaPagamento: string;
    total: number;
    quantidade: number;
  }>;
};

export type CaixaOperacional = {
  id: string;
  empresaId: string;
  pdvId: string;
  pdvNome: string;
  // R-121: conta do PDV — a unica origem valida das saidas do operador. A tela trava o campo nela.
  pdvContaId: string | null;
  usuarioId: string;
  usuarioCaixaId: string;
  usuarioCaixaNome: string;
  colaboradorId: string;
  // Dia CONTABIL do caixa ("yyyy-MM-dd") — o que a tela de Entradas lista para quem opera caixa.
  dataMovimento: string;
  dataHoraAbertura: string;
  abertoEm: string;
  dataHoraFechamento: string | null;
  fechamentoIniciadoEm?: string | null;
  fechadoEm: string | null;
  tokenEdicao: string | null;
  turnoId: string | null;
  turnoNome: string | null;
  maquininhaId: string | null;
  maquininhaApelido: string | null;
  maquininhaNumeroSerie: string | null;
  caixaResponsavelNomeAbertura: string | null;
  supervisorResponsavelNomeAbertura: string | null;
  observacao: string | null;
  status: string;
};

// G1/R-171/R-187: retorno que JA SAIU e ainda espera conferencia na conta destino.
export type EntregaCofrePendente = {
  id: string;
  tipo: "sangria" | "retorno";
  valor: number;
  lacre: string | null;
  contaDestinoNome: string;
  criadoEm: string;
  // R-183: o que o destino CONTOU na ultima tentativa. `null` = ninguem contou ainda.
  valorContado: number | null;
  recusaId: string | null;
};

export type PlanejamentoRetorno = {
  id: string;
  tipo: "sangria" | "retorno";
  valor: number;
  lacre: string;
  contaDestinoId: string;
  contaDestinoNome: string;
  observacao: string | null;
  criadoEm: string;
};

export type CaixaStatus = {
  caixaAberto: CaixaOperacional | null;
  resumo: ResumoCaixa | null;
  vinculoOperador?: { pdvId: string; turnoCaixa: "manha" | "tarde" } | null;
  lacreFechamentoReservado: string | null;
  indisponibilidadeAberta?: {
    id: string;
    motivos: string[];
    motivoOutro: string | null;
    iniciadoEm: string;
  } | null;
  // Lista VAZIA quando nao ha nada travando. Nunca ausente: ausente teria de significar "nao ha",
  // e um dia significaria "a rota esqueceu de mandar".
  entregasPendentes: EntregaCofrePendente[];
  planejamentosPendentes: PlanejamentoRetorno[];
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
  /** Composição física obrigatória no malote Cofre → PDV. */
  valorEspecieDeclarado: string;
  valorMoedasDeclarado: string;
  valorAcrescimo: string;
  descricaoAcrescimo: string;
  // R-041: juros. O tipo vazio significa "sem juros" — o payload converte para null.
  jurosTipo: "" | "percentual" | "valor";
  jurosValorInformado: string;
  valorDesconto: string;
  descricaoDesconto: string;
  descontoGeralTipo: "" | "percentual" | "valor";
  descontoGeralValor: string;
  contaOrigemId: string;
  contaDestinoId: string;
  fornecedorId: string;
  colaboradorId: string;
  socioGestorId: string;
  credorTipo: "" | "fornecedor" | "colaborador" | "socio_gestor";
  dataDocumentoFiscal: string;
  numeroDocumentoFiscal: string;
  fotoDocumentoUrl: string;
  fotoNotaUrl: string;
  grupoDespesaId: string;
  grupoMercadoriaId: string;
  grupoRetiradaId: string;
  numeroLacre: string;
  nLacreDoc: string;
  lacresRetorno: string[];
  lacreFechamentoPlanejado: string;
  agendadaPara: string;
  dataRecebimento: string;
  tempoConfirmacao: "5min" | "10min" | "30min" | "1h" | "1dia" | "10dias" | "30dias" | null;
  contasDestinoIds: string[];
  recorrenciaId: string;
  documento: string;
  numeroNotaFiscal: string;
  chaveAcesso: string;
  temNotaFiscal: boolean;
  computar: boolean;
};

export type TemaForm = TemaAplicacao;
