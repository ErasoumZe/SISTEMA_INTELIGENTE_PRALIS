import { inject, type ComputedRef, type Ref } from "vue";
import type { TemaAplicacao } from "@padaria/shared";
import type { secoesPermissoes } from "~/utils/domain";
import type { CadastroForm, EntidadeOperacional, OperacaoForm, Opcao, Opcoes } from "~/types/padaria";

export type CaixaDrawerForm = {
  pdvId: string;
  turnoId: string;
  dataHoraAbertura: string;
};

export type ItemDespesaForm = {
  descricao: string;
  valor: string;
  grupoDespesaId: string;
};

export type ItemMercadoriaForm = {
  descricao: string;
  quantidade: string;
  valorUnitario: string;
  descontoTipo: string;
  descontoValor: string;
  valorTotal: string;
  produtoId: string;
  grupoMercadoriaId: string;
  unidadeMedidaId: string;
};

export type ItemVendaForm = {
  descricaoProduto: string;
  quantidade: string;
  valorUnitario: string;
  valorTotal: string;
  produtoId: string;
};

export type TipoPagamentoForm = {
  formaPagamentoId: string;
  totalPago: string;
  numeroVendas: string;
};

export type FormMalote = {
  codigo: string;
  lacres: string[];
};

export type SecaoPermissao = (typeof secoesPermissoes)[number];

export type WorkspaceContext = {
  modalCaixaDrawerAberto: Ref<boolean>;
  formCaixaDrawer: CaixaDrawerForm;
  opcoesEmpresa: ComputedRef<Opcoes>;
  caixaSalvando: Ref<boolean>;
  salvarCaixaDrawer: () => Promise<void>;
  modalOperacaoAberto: Ref<boolean>;
  entidadeNova: Ref<EntidadeOperacional>;
  operacaoEditandoId: Ref<string>;
  modoDiscriminacao: Ref<boolean>;
  form: Ref<OperacaoForm>;
  discriminandoDespesa: Ref<boolean>;
  discriminandoMercadoria: Ref<boolean>;
  valorTotalOperacao: ComputedRef<number>;
  itensVenda: Ref<ItemVendaForm[]>;
  tiposPagamento: Ref<TipoPagamentoForm[]>;
  itensDespesa: Ref<ItemDespesaForm[]>;
  itensMercadoria: Ref<ItemMercadoriaForm[]>;
  salvandoOperacao: Ref<boolean>;
  salvarOperacao: () => Promise<void>;
  fotoDocumentoPreview: Ref<string>;
  fotoDocumentoExistente: Ref<boolean>;
  selecionarFotoDocumento: (entrada: File | File[] | null) => void;
  modalMaloteAberto: Ref<boolean>;
  maloteEditandoId: Ref<string>;
  formMalote: Ref<FormMalote>;
  maloteSalvando: Ref<boolean>;
  salvarMalote: () => Promise<void>;
  modalCadastroAberto: Ref<boolean>;
  cadastroEditandoId: Ref<string>;
  cadastroTela: Ref<string>;
  formCadastro: Ref<CadastroForm>;
  mascararCpf: (valor: string) => string;
  mascararCnpj: (valor: string) => string;
  atualizarDocumentoCadastro: (valor: string) => void;
  documentoEhCpf: (valor: string) => boolean;
  mascararWhatsapp: (valor: string) => string;
  mascararCep: (valor: string) => string;
  colaboradoresSelectUsuario: ComputedRef<Array<Pick<Opcao, "id" | "nome">>>;
  atualizarColaboradorUsuario: (valor: string) => void;
  empresasDisponiveis: ComputedRef<Opcao[]>;
  dadosCadastro: (tela: string) => Array<Record<string, string | undefined>>;
  permissoesDaSecao: (secao: SecaoPermissao) => string[];
  estadoRegraPermissao: (permissao: string) => string;
  definirRegraPermissao: (permissao: string, estado: string) => void;
  cadastroSalvando: Ref<boolean>;
  salvarCadastro: () => Promise<void>;
  modalTemaAberto: Ref<boolean>;
  temaTelaEdicao: Ref<string>;
  telasTemaPermitidas: ComputedRef<{ id: string; titulo: string }[]>;
  abrirTema: (tela?: string) => Promise<void>;
  tema: Ref<TemaAplicacao>;
  temaSalvando: Ref<boolean>;
  salvarTema: () => Promise<void>;
  modalCopiaAberto: Ref<boolean>;
  copiaModo: Ref<"exportar" | "importar">;
  copiaNivel: Ref<"simples" | "completo">;
  copiaEmpresaOrigemId: Ref<string>;
  copiaEmpresaDestinoId: Ref<string>;
  copiaSalvando: Ref<boolean>;
  executarCopia: () => Promise<void>;
};

export const WORKSPACE_CONTEXT = "workspace";

export function useWorkspaceContext() {
  const workspace = inject<WorkspaceContext>(WORKSPACE_CONTEXT);
  if (!workspace) throw new Error("Componente de workspace precisa ser usado dentro de AppWorkspace.");
  return workspace;
}
