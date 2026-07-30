import { inject, type ComputedRef, type Ref } from "vue";
import type { TemaAplicacao } from "@padaria/shared";
import type { secoesPermissoes } from "~/utils/domain";
import type { CadastroForm, EntidadeOperacional, OperacaoForm, Opcao, Opcoes } from "~/types/padaria";

// As formas de item vivem em utils/operacoes (junto do payload que as consome) e sao REEXPORTADAS
// aqui. Antes o contexto declarava copias identicas: ao ganhar grupoPatrimonioId, os dois tipos se
// separaram e o mesmo objeto deixou de ser atribuivel a si mesmo. Uma definicao so, sempre.
export type { ItemDespesaForm, ItemMercadoriaForm, ItemVendaForm, TipoPagamentoForm } from "~/utils/operacoes";
import type { ItemDespesaForm, ItemMercadoriaForm, ItemVendaForm, TipoPagamentoForm } from "~/utils/operacoes";

export type FormMalote = {
  numeroLacre: string;
  valor: number;
};

export type SecaoPermissao = (typeof secoesPermissoes)[number];

export type WorkspaceContext = {
  opcoesEmpresa: ComputedRef<Opcoes>;
  modalOperacaoAberto: Ref<boolean>;
  entidadeNova: Ref<EntidadeOperacional>;
  // Troca a categoria do lancamento com o modal ABERTO (3 botoes do topo): mantem o que foi
  // digitado, limpa o que era da categoria anterior e recarrega as opcoes da nova.
  trocarCategoriaLancamento: (entidade: EntidadeOperacional) => Promise<void>;
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
