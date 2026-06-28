import type { Permissao, TemaAplicacao, TipoMovimentacao } from "@padaria/shared";

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

export type Opcoes = {
  empresas: Opcao[];
  contas: Opcao[];
  fornecedores: Opcao[];
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
};

export type Movimento = {
  id: string;
  empresaId: string;
  tipo: TipoMovimentacao;
  dataReferencia: string;
  descricao: string;
  valorOriginal: string;
  computar: boolean;
  status: string;
};

export type ResumoCaixa = {
  totalEntradas: number;
  totalTransferencias: number;
  totalDespesas: number;
  totalRetiradas: number;
  saldo: number;
};

export type ItemMenu = {
  id: string;
  titulo: string;
  permissao: Permissao;
  icone: string;
};

export type AcaoNovo = {
  tipo?: TipoMovimentacao;
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
  tipoGrupo: "despesa" | "mercadoria" | "retirada";
  grupoPaiId: string;
  tipoAreaSetor: "area" | "setor";
  areaId: string;
  setorPaiId: string;
  setorId: string;
  colaboradorId: string;
  cargoId: string;
  empresaIds: string[];
  tipoPermissao: "cargo" | "setor" | "usuario";
  usuarioId: string;
  permissoes: string[];
};

export type MovimentoForm = {
  dataReferencia: string;
  dataVencimento: string;
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
