import type { Permissao, TemaAplicacao } from "@padaria/shared";

export type Opcao = {
  id: string;
  nome?: string;
  email?: string;
  descricao?: string;
  codigo?: string;
  sigla?: string;
  empresaId?: string;
  empresaIds?: string[];
  caminho?: string;
  nivel?: number;
  selecionavel?: boolean;
  totalLacres?: number;
  cpf?: string;
  tipo?: string;
  tipoGrupo?: "despesa" | "mercadoria" | "retirada";
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
  role?: string;
  cargoNome?: string;
  remuneracaoMinuto?: string;
  dataInicio?: string;
  ativo?: boolean;
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
  feriados: Opcao[];
  gruposDespesas: Opcao[];
  gruposMercadorias: Opcao[];
  gruposRetiradas: Opcao[];
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
};

export type EntidadeOperacional = "venda" | "despesa" | "mercadoria" | "retirada" | "transferencia";

export type OperacaoResumo = {
  id: string;
  empresaId: string;
  dataReferencia: string;
  descricao: string;
  valorOriginal: string;
  computar: boolean;
  status: string;
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
  dataHoraAbertura: string;
  abertoEm: string;
  dataHoraFechamento: string | null;
  fechadoEm: string | null;
  tokenEdicao: string | null;
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
  icone: string;
};

export type AcaoNovo = {
  entidade?: EntidadeOperacional;
  tela?: "malote";
  titulo: string;
  subtitulo: string;
  permissao: Permissao;
  icone: string;
  cor: string;
};

export type TreeItem = {
  id: string;
  nome: string;
  detalhe?: string;
  nivel: number;
  item: Record<string, string | undefined>;
};

export type CadastroForm = {
  nome: string;
  email: string;
  senha: string;
  cpf: string;
  sigla: string;
  codigo: string;
  contaId: string;
  ativo: boolean;
  tipoGrupo: "despesa" | "mercadoria" | "retirada";
  grupoPaiId: string;
  tipoAreaSetor: "area" | "setor";
  areaId: string;
  setorPaiId: string;
  setorId: string;
  colaboradorId: string;
  novoColaborador: boolean;
  novoColaboradorNome: string;
  novoColaboradorCpf: string;
  novoColaboradorSetorId: string;
  novoColaboradorCargoId: string;
  novoColaboradorRemuneracaoMinuto: string;
  novoColaboradorDataInicio: string;
  cargoId: string;
  empresaIds: string[];
  tipoPermissao: "cargo" | "setor" | "usuario";
  usuarioId: string;
  permissoes: string[];
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
